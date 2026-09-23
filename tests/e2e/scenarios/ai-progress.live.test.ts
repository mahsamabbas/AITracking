/**
 * §19 live integration: real connector → API → sessions → dashboard fields.
 *
 * Runs only against a live local stack (skipped otherwise):
 *   pnpm dev            # API in dev mode + connector, connector paired
 *   LIVE_STACK=1 pnpm --filter @techlio/e2e test
 *
 * It drives one Claude Code session (hooks + OpenTelemetry) and one Cursor
 * session (hooks only) through the real connector on 127.0.0.1:9477, then
 * checks that the employee hub's aiProgress, the session detail, and the live
 * strip agree with what was sent — and that unavailable metrics are null.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const LIVE = process.env.LIVE_STACK === "1";
const API = process.env.TECHLIO_API_URL ?? "http://localhost:3001";
const CONNECTOR = "http://127.0.0.1:9477";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${url} → ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

const hook = (body: Record<string, unknown>) =>
  json(`${CONNECTOR}/hooks/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!LIVE)("AI progress — live connector to dashboard", () => {
  it(
    "reports Claude Code (OTel tokens, per-call timing) and Cursor (turns, no tokens) accurately",
    async () => {
      const login = await json<{ token: string; user: { developerId: string } }>(`${API}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "developer@techlio.local", password: "developer123" }),
      });
      const auth = { Authorization: `Bearer ${login.token}` };
      const me = login.user.developerId;
      const identity = await json<{ paired: boolean; developerId?: string }>(`${CONNECTOR}/identity`);
      expect(identity.paired, "connector must be paired to the developer account").toBe(true);
      expect(identity.developerId).toBe(me);

      const claudeSession = randomUUID();
      const cursorSession = randomUUID();
      const cwd = "/tmp/ai-progress-e2e";

      // --- Claude Code: hook turn + one real API call over OTLP -------------
      await hook({ provider: "claude_code", hook_event_name: "SessionStart", session_id: claudeSession, cwd });
      await hook({ provider: "claude_code", hook_event_name: "UserPromptSubmit", session_id: claudeSession, cwd });
      await hook({ provider: "claude_code", hook_event_name: "PreToolUse", session_id: claudeSession, tool_name: "Edit", cwd });
      await sleep(300);
      await hook({ provider: "claude_code", hook_event_name: "PostToolUse", session_id: claudeSession, tool_name: "Edit", cwd, file_path: `${cwd}/src/a.ts` });
      const otel = await fetch(`${CONNECTOR}/v1/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: [
            { key: "event.name", value: { stringValue: "api_request" } },
            { key: "event.timestamp", value: { stringValue: new Date().toISOString() } },
            { key: "session.id", value: { stringValue: claudeSession } },
            { key: "request_id", value: { stringValue: `req_${claudeSession}` } },
            { key: "model", value: { stringValue: "claude-opus-5" } },
            { key: "input_tokens", value: { intValue: "1500" } },
            { key: "output_tokens", value: { intValue: "320" } },
            { key: "duration_ms", value: { intValue: "2400" } },
          ] }] }] }],
        }),
      });
      expect(otel.status).toBe(200);
      // Stop after OTel arrived: the hook turn must NOT be counted as a second call.
      await hook({ provider: "claude_code", hook_event_name: "Stop", session_id: claudeSession, cwd });
      await hook({ provider: "claude_code", hook_event_name: "SessionEnd", session_id: claudeSession, cwd });

      // --- Cursor: hooks only ---------------------------------------------
      await hook({ provider: "cursor", hook_event_name: "sessionStart", session_id: cursorSession, cwd });
      await hook({ provider: "cursor", hook_event_name: "beforeSubmitPrompt", session_id: cursorSession, cwd });
      await hook({ provider: "cursor", hook_event_name: "preToolUse", session_id: cursorSession, tool_name: "run_terminal_cmd", cwd });
      await sleep(300);
      await hook({ provider: "cursor", hook_event_name: "postToolUse", session_id: cursorSession, tool_name: "run_terminal_cmd", cwd });
      await hook({ provider: "cursor", hook_event_name: "stop", session_id: cursorSession, cwd });

      // --- Antigravity: per-invocation hooks (real per-call timing) --------
      const agySession = randomUUID();
      await hook({ provider: "antigravity", hook_event_name: "PreInvocation", session_id: agySession, model: "gemini-3.6-flash", cwd });
      await sleep(400);
      await hook({ provider: "antigravity", hook_event_name: "PostInvocation", session_id: agySession, model: "gemini-3.6-flash", cwd });
      await hook({ provider: "antigravity", hook_event_name: "Stop", session_id: agySession, cwd });

      // Connector flushes on every event; allow for the Claude echo hold and upload.
      await sleep(4_000);

      // --- Session detail --------------------------------------------------
      const claude = await json<{ session: Record<string, unknown>; capability: { missing: string[] } }>(
        `${API}/v1/sessions/${claudeSession}`,
        { headers: auth },
      );
      expect(claude.session.provider).toBe("claude_code");
      expect(claude.session.modelRequests).toBe(1); // the OTel call only
      expect(claude.session.modelDurationMs).toBe(2400); // real per-call timing
      expect(claude.session.tokenInput).toBe(1500);
      expect(claude.session.tokenOutput).toBe(320);
      expect(claude.session.toolCalls).toBe(1);
      expect(claude.capability.missing).not.toContain("token_totals");

      const cursor = await json<{ session: Record<string, unknown>; capability: { missing: string[] } }>(
        `${API}/v1/sessions/${cursorSession}`,
        { headers: auth },
      );
      expect(cursor.session.provider).toBe("cursor");
      expect(cursor.session.modelRequests).toBe(1); // one agent turn
      expect(cursor.session.tokenInput).toBeNull(); // never 0
      expect(cursor.session.toolCalls).toBe(1);
      expect(cursor.capability.missing).toEqual(expect.arrayContaining(["token_totals", "model_call_timing"]));

      const agy = await json<{ session: Record<string, unknown> }>(`${API}/v1/sessions/${agySession}`, { headers: auth });
      expect(agy.session.provider).toBe("antigravity");
      expect(agy.session.modelRequests).toBe(1); // Stop is not a second call
      expect(Number(agy.session.modelDurationMs)).toBeGreaterThanOrEqual(300);
      expect(agy.session.tokenInput).toBeNull();

      // --- Employee hub aiProgress agrees with the sessions -----------------
      const hub = await json<{
        aiProgress: { providers: { provider: string; sessions: number; modelRequests: number; tokenInput: number | null; capability: { source: string } }[] };
        recentSessions: { id: string }[];
      }>(`${API}/v1/employees/${me}?preset=today`, { headers: auth });
      const sessionsToday = await json<{ sessions: { id: string; provider: string; modelRequests: number; tokenInput: number | null }[]; total: number }>(
        `${API}/v1/employees/${me}/sessions?preset=today&pageSize=100`,
        { headers: auth },
      );
      for (const provider of ["claude_code", "cursor", "antigravity"]) {
        const card = hub.aiProgress.providers.find((p) => p.provider === provider)!;
        const rows = sessionsToday.sessions.filter((s) => s.provider === provider);
        expect(card, `${provider} card`).toBeTruthy();
        expect(card.sessions).toBe(rows.length);
        expect(card.modelRequests).toBe(rows.reduce((s, r) => s + r.modelRequests, 0));
        const tokenRows = rows.filter((r) => r.tokenInput != null);
        expect(card.tokenInput).toBe(tokenRows.length ? tokenRows.reduce((s, r) => s + (r.tokenInput ?? 0), 0) : null);
      }

      // --- Live strip shows the most recent agent -------------------------
      const live = await json<{ people?: { developerId: string; sessionState: string; eventsThisHour: number }[] }>(
        `${API}/v1/dashboard/live`,
        { headers: auth },
      );
      const mine = live.people?.find((p) => p.developerId === me);
      expect(mine?.sessionState).toBe("active");
      expect(mine?.eventsThisHour).toBeGreaterThan(0);
    },
    60_000,
  );
});
