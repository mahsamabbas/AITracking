import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { ActivityEvent } from "@techlio/event-schema";
import { db } from "./db.js";
import { activityEvents, hourlySnapshots } from "./schema.js";
import { fullEvent } from "./retention/payload.js";

export async function getHourlySnapshotDetail(
  organizationId: string,
  snapshotId: string,
): Promise<{
  snapshot: (typeof hourlySnapshots.$inferSelect) | null;
  sourceEvents: ActivityEvent[];
  versions: { id: string; version: number; recalcReason: string | null }[];
}> {
  const snapshots = await db
    .select()
    .from(hourlySnapshots)
    .where(
      and(
        eq(hourlySnapshots.id, snapshotId),
        eq(hourlySnapshots.organizationId, organizationId),
      ),
    );
  const snapshot = snapshots[0] ?? null;
  if (!snapshot) {
    return { snapshot: null, sourceEvents: [], versions: [] };
  }

  const hourEnd = new Date(snapshot.hourStart.getTime() + 3600_000);
  const eventRows = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.organizationId, organizationId),
        eq(activityEvents.developerId, snapshot.developerId),
        gte(activityEvents.occurredAt, snapshot.hourStart),
        lt(activityEvents.occurredAt, hourEnd),
      ),
    )
    .orderBy(desc(activityEvents.occurredAt))
    .limit(200);

  const allVersions = await db
    .select({
      id: hourlySnapshots.id,
      version: hourlySnapshots.version,
      recalcReason: hourlySnapshots.recalcReason,
    })
    .from(hourlySnapshots)
    .where(
      and(
        eq(hourlySnapshots.organizationId, organizationId),
        eq(hourlySnapshots.developerId, snapshot.developerId),
        eq(hourlySnapshots.hourStart, snapshot.hourStart),
      ),
    )
    .orderBy(desc(hourlySnapshots.version));

  return {
    snapshot,
    sourceEvents: eventRows.map((r) => fullEvent(r)),
    versions: allVersions,
  };
}
