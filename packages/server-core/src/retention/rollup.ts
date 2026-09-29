import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { isAgentReported } from "../activity.js";
import { personIntervals, spread, type MixEvent } from "../work-mix.js";
import { DAY_MS, dayKey } from "./policy.js";
import { SLICE_KEYS, sliceToArray, zeroHourSlice, type HourSlice } from "./hourly-store.js";

/**
 * Write side of activity_hourly. A UTC day is summarised with the same
 * interval rules as the live charts (personIntervals), using the day before
 * and after as context so working periods that cross midnight are split the
 * way the charts split them. Idempotent: re-running a day replaces its rows.
 */

const HOUR = 3_600_000;
const FILE_TYPES = new Set(["file_created", "file_modified", "file_deleted"]);

type RollupEvent = MixEvent & { developer_id: string; provider: string | null };

interface PersonHours {
  all: HourSlice[];
  byProvider: Map<string, HourSlice[]>;
  /** hour index → workspace → agent file changes */
  workspaces: Map<string, number>[];
}

const emptyDay = (): HourSlice[] => Array.from({ length: 24 }, zeroHourSlice);

/** Time slices for one set of events, keeping only the 24 hours of `day`. */
function timeSlices(events: RollupEvent[], day: number, into: HourSlice[]): void {
  const origin = day - DAY_MS;
  const { active, idle, working, verify, writing, research } = personIntervals(events);
  const put = (list: { start: number; end: number }[], key: (typeof SLICE_KEYS)[number]) =>
    spread(list, origin, 48, (idx, ms) => {
      if (idx >= 24) into[idx - 24][key] += ms;
    });
  put(active, "activeMs");
  put(idle, "idleMs");
  put(working, "workingMs");
  put(verify, "verifyMs");
  put(writing, "writingMs");
  put(research, "researchMs");
}

/** Counts on the hour each event happened (same definitions as the calendar and charts). */
function countEvent(e: RollupEvent, day: number, into: HourSlice[]): "model" | "tool" | "file" | null {
  const at = new Date(e.occurred_at).getTime();
  if (at < day || at >= day + DAY_MS) return null;
  const h = into[Math.floor((at - day) / HOUR)];
  if (e.event_type === "model_request_completed") {
    h.modelRequests += 1;
    return "model";
  }
  if (e.event_type === "tool_completed") {
    h.toolCalls += 1;
    return "tool";
  }
  if (FILE_TYPES.has(e.event_type) && isAgentReported({ event_type: e.event_type, metadata: e.metadata as never })) {
    h.fileChanges += 1;
    return "file";
  }
  return null;
}

/** Summaries for one UTC day of one organisation. Returns raw events read for that day. */
export async function rollupDay(
  organizationId: string,
  day: Date,
  mode: "replace" | "add" = "replace",
): Promise<{ events: number; rows: number }> {
  const start = day.getTime();
  // Context: the day before (open working periods) and after (calls finishing late).
  const res = await db.execute<Record<string, unknown> & RollupEvent>(sql`
    SELECT e.developer_id, e.occurred_at, e.event_type, e.payload->>'duration_ms' AS duration_ms,
           e.payload->'metadata' AS metadata, e.payload->>'provider' AS provider
    FROM activity_events e
    WHERE e.organization_id = ${organizationId}
      AND e.occurred_at >= ${new Date(start - DAY_MS)} AND e.occurred_at < ${new Date(start + 2 * DAY_MS)}
      AND e.event_type NOT IN ('heartbeat_sent', 'session_heartbeat', 'commit_created', 'commit_pushed')
    ORDER BY e.developer_id, e.occurred_at
  `);

  const byPerson = new Map<string, RollupEvent[]>();
  let dayEvents = 0;
  for (const row of res.rows) {
    const at = new Date(row.occurred_at).getTime();
    if (at >= start && at < start + DAY_MS) dayEvents += 1;
    const list = byPerson.get(row.developer_id) ?? [];
    list.push(row);
    byPerson.set(row.developer_id, list);
  }

  const hours = new Map<string, PersonHours>();
  for (const [developerId, events] of byPerson) {
    const person: PersonHours = {
      all: emptyDay(),
      byProvider: new Map(),
      workspaces: Array.from({ length: 24 }, () => new Map<string, number>()),
    };
    timeSlices(events, start, person.all);
    const perProvider = new Map<string, RollupEvent[]>();
    for (const e of events) {
      if (countEvent(e, start, person.all) === "file") {
        const idx = Math.floor((new Date(e.occurred_at).getTime() - start) / HOUR);
        const name = String((e.metadata as { path_category?: unknown } | null)?.path_category || "Unassigned workspace");
        person.workspaces[idx].set(name, (person.workspaces[idx].get(name) ?? 0) + 1);
      }
      if (!e.provider) continue;
      const list = perProvider.get(e.provider) ?? [];
      list.push(e);
      perProvider.set(e.provider, list);
    }
    for (const [provider, list] of perProvider) {
      const slices = emptyDay();
      timeSlices(list, start, slices);
      for (const e of list) countEvent(e, start, slices);
      person.byProvider.set(provider, slices);
    }
    hours.set(developerId, person);
  }

  const rows: {
    developerId: string;
    hour: Date;
    slice: HourSlice;
    byProvider: Record<string, number[]>;
    workspaces: Record<string, number>;
  }[] = [];
  for (const [developerId, person] of hours) {
    for (let i = 0; i < 24; i++) {
      const slice = person.all[i];
      const byProvider: Record<string, number[]> = {};
      for (const [p, slices] of person.byProvider) {
        if (SLICE_KEYS.some((k) => slices[i][k] > 0)) byProvider[p] = sliceToArray(slices[i]);
      }
      if (!SLICE_KEYS.some((k) => slice[k] > 0) && Object.keys(byProvider).length === 0) continue;
      rows.push({
        developerId,
        hour: new Date(start + i * HOUR),
        slice,
        byProvider,
        workspaces: Object.fromEntries(person.workspaces[i]),
      });
    }
  }

  await db.transaction(async (tx) => {
    if (mode === "replace") {
      await tx.execute(sql`
        DELETE FROM activity_hourly
        WHERE organization_id = ${organizationId}
          AND hour_start >= ${day} AND hour_start < ${new Date(start + DAY_MS)}
      `);
    }
    for (const r of rows) {
      const s = sliceToArray(r.slice);
      // "add" folds late-arriving events into a day whose raw rows are already archived.
      await tx.execute(sql`
        INSERT INTO activity_hourly (organization_id, developer_id, hour_start, active_ms, idle_ms, working_ms,
          verify_ms, writing_ms, research_ms, model_requests, tool_calls, file_changes, by_provider, workspaces)
        VALUES (${organizationId}, ${r.developerId}, ${r.hour}, ${s[0]}, ${s[1]}, ${s[2]}, ${s[3]}, ${s[4]},
          ${s[5]}, ${s[6]}, ${s[7]}, ${s[8]}, ${JSON.stringify(r.byProvider)}::jsonb, ${JSON.stringify(r.workspaces)}::jsonb)
        ON CONFLICT (organization_id, hour_start, developer_id) DO UPDATE SET
          active_ms = activity_hourly.active_ms + EXCLUDED.active_ms,
          idle_ms = activity_hourly.idle_ms + EXCLUDED.idle_ms,
          working_ms = activity_hourly.working_ms + EXCLUDED.working_ms,
          verify_ms = activity_hourly.verify_ms + EXCLUDED.verify_ms,
          writing_ms = activity_hourly.writing_ms + EXCLUDED.writing_ms,
          research_ms = activity_hourly.research_ms + EXCLUDED.research_ms,
          model_requests = activity_hourly.model_requests + EXCLUDED.model_requests,
          tool_calls = activity_hourly.tool_calls + EXCLUDED.tool_calls,
          file_changes = activity_hourly.file_changes + EXCLUDED.file_changes,
          -- Late additions keep the per-tool split already recorded (approximate, rare).
          by_provider = activity_hourly.by_provider,
          workspaces = activity_hourly.workspaces
      `);
    }
    await tx.execute(sql`
      INSERT INTO retention_days (organization_id, day, rolled_up_at, rollup_events)
      VALUES (${organizationId}, ${dayKey(day)}::date, NOW(), ${dayEvents})
      ON CONFLICT (organization_id, day) DO UPDATE SET
        rolled_up_at = NOW(),
        rollup_events = CASE WHEN ${mode} = 'add' THEN COALESCE(retention_days.rollup_events, 0) + EXCLUDED.rollup_events
                             ELSE EXCLUDED.rollup_events END
    `);
  });
  return { events: dayEvents, rows: rows.length };
}
