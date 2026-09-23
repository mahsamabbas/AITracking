/**
 * Tier B live check: a Cursor Admin API row is attributed by email to the
 * right employee (never to a default person), stored as a daily aggregate,
 * and surfaced as daily progress — not as sessions.
 *
 *   LIVE_STACK=1 pnpm --filter @techlio/e2e test   (needs local Postgres + API)
 */
import { describe, expect, it } from "vitest";

import {
  aiProgress,
  db,
  ensureProviderPullDevice,
  ingestBatch,
  pool,
  sql,
  resolveProviderEmployee,
} from "@techlio/server-core";
import { cursorRowToEvent } from "@techlio/puller";

const LIVE = process.env.LIVE_STACK === "1";
const ORG = "550e8400-e29b-41d4-a716-446655440010";

describe.skipIf(!LIVE)("Tier B daily aggregates", () => {
  it("attributes by email, skips unknown accounts, and reports daily with nulls kept", async () => {
    const day = Date.UTC(2026, 8, 22);
    const employee = await resolveProviderEmployee({ organizationId: ORG, provider: "cursor", email: "Developer@Techlio.local" });
    expect(employee, "email match is case-insensitive").toBeTruthy();
    expect(await resolveProviderEmployee({ organizationId: ORG, provider: "cursor", email: "stranger@elsewhere.com" })).toBeNull();

    const deviceId = await ensureProviderPullDevice({ organizationId: ORG, employeeId: employee!, provider: "cursor", label: "Cursor Admin API (daily)" });
    const event = cursorRowToEvent(
      { userId: 424242, email: "developer@techlio.local", date: day, chatRequests: 7, agentRequests: 5, subscriptionIncludedReqs: 9, totalTabsAccepted: 30 },
      { organizationId: ORG, developerId: employee!, deviceId, connectorVersion: "puller-0.2.0", consentVersion: "1" },
    );
    try {
      const result = await ingestBatch(ORG, { events: [event] }, deviceId);
      expect(result.accepted + (result.reasons?.includes("duplicate") ? 1 : 0)).toBe(1);

      const progress = await aiProgress({
        organizationId: ORG,
        developerId: employee!,
        range: { from: new Date(day - 86_400_000), to: new Date(day + 2 * 86_400_000) },
      });
      const row = progress.tierBDaily.find((d) => d.provider === "cursor" && d.date === "2026-09-22");
      expect(row).toMatchObject({ billableRequests: 9, chatRequests: 7, agentRequests: 5, completions: 30 });
      expect(row?.suggestions).toBeNull(); // Cursor never reports it — stays null
      // The pull device is not a connector and must not appear in connector health.
      const kinds = await db.execute<{ kind: string }>(sql`SELECT kind FROM devices WHERE id = ${deviceId}`);
      expect(kinds.rows[0]?.kind).toBe("provider_pull");
    } finally {
      await db.execute(sql`DELETE FROM activity_events WHERE event_id = ${event.event_id}`);
      await db.execute(sql`DELETE FROM devices WHERE id = ${deviceId} AND kind = 'provider_pull'`);
      await pool.end();
    }
  });
});
