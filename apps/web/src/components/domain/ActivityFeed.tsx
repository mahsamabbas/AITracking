"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EventTimeline } from "@/components/domain/EventTimeline";
import { ListTimeSortButton, sortEventsByTime, type SortDirection } from "@/components/ui/SortControl";
import { LoadingBlock } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";
import { rangeLabel, rangeParams, type RangeValue } from "@/components/filters/RangePicker";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiDisplayTimezone, apiGet, qs } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { rangeIncludesNow, analyticsPollMs } from "@/lib/live-poll";
import type { ActivityEventRow } from "@/lib/types";

interface FeedPage {
  events: ActivityEventRow[];
  nextCursor: string | null;
  total: number;
  range: { from: string; to: string };
}

const PAGE = 50;

function dayKey(iso: string): string {
  // Group by the display timezone's day, the same day the range was bucketed by.
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: apiDisplayTimezone(),
  });
}

/**
 * Every agent event in the page's selected range, newest first — "Today"
 * shows the whole day, "7 days" the whole week — with "Load older" paging.
 * Heartbeats are not activity and never appear. Follows the page filter.
 */
export function ActivityFeed({
  range,
  developerId,
  provider,
  team,
  showPerson = false,
  title = "Activity feed",
}: {
  range: RangeValue;
  developerId?: string;
  provider?: string;
  team?: string;
  /** Organisation-wide feeds name the person on each row. */
  showPerson?: boolean;
  title?: string;
}) {
  const { token } = useAuth();
  const base = useMemo(
    () => ({ ...rangeParams(range), developerId, provider, team }),
    [range, developerId, provider, team],
  );
  const path = `/v1/activity${qs({ ...base, limit: PAGE })}`;
  const live = rangeIncludesNow(range);
  const first = useApi<FeedPage>(path, { pollMs: analyticsPollMs(range) });

  // Everything loaded for this filter, merged by event id so live polling and
  // "Load older" never duplicate or skip events.
  const [loaded, setLoaded] = useState<Map<string, ActivityEventRow>>(new Map());
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [pagedOlder, setPagedOlder] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [timeSort, setTimeSort] = useState<SortDirection>("desc");

  useEffect(() => {
    setLoaded(new Map());
    setOlderCursor(null);
    setPagedOlder(false);
  }, [path]);

  useEffect(() => {
    const page = first.data;
    if (!page) return;
    setLoaded((prev) => {
      const next = new Map(prev);
      for (const e of page.events) next.set(e.event_id, e);
      return next;
    });
    if (!pagedOlder) setOlderCursor(page.nextCursor);
  }, [first.data, pagedOlder]);

  async function loadOlder() {
    if (!olderCursor || !token) return;
    setLoadingMore(true);
    try {
      const page = await apiGet<FeedPage>(`/v1/activity${qs({ ...base, limit: PAGE, cursor: olderCursor })}`, token);
      setLoaded((prev) => {
        const next = new Map(prev);
        for (const e of page.events) next.set(e.event_id, e);
        return next;
      });
      setOlderCursor(page.nextCursor);
      setPagedOlder(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const events = useMemo(() => {
    const list = [...loaded.values()];
    return sortEventsByTime(list, timeSort);
  }, [loaded, timeSort]);
  const groups = useMemo(() => {
    const out: { day: string; events: ActivityEventRow[] }[] = [];
    for (const e of events) {
      const day = dayKey(e.occurred_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.events.push(e);
      else out.push({ day, events: [e] });
    }
    return out;
  }, [events]);
  const total = first.data?.total ?? 0;

  return (
    <Card>
      <CardHeader
        icon="list"
        title={title}
        subtitle={
          first.data
            ? `${formatNumber(total)} agent event${total === 1 ? "" : "s"} · ${rangeLabel(range)}${live ? " · updates live" : ""} · heartbeats hidden`
            : `Agent events · ${rangeLabel(range)}`
        }
        action={
          events.length > 0 ? (
            <ListTimeSortButton
              direction={timeSort}
              onToggle={() => setTimeSort((d) => (d === "asc" ? "desc" : "asc"))}
            />
          ) : null
        }
      />
      <CardBody className="pt-1">
        {first.error ? (
          <p className="hint">Could not load activity: {first.error}</p>
        ) : first.loading && events.length === 0 ? (
          <LoadingBlock rows={5} />
        ) : events.length === 0 ? (
          <EventTimeline
            events={[]}
            emptyBody={`No agent activity in ${rangeLabel(range).toLowerCase()}. Events from Claude Code, Cursor, and other connected agents appear here as they happen.`}
          />
        ) : (
          <div className="max-h-[560px] overflow-y-auto pr-1">
            {groups.map((g) => (
              <section key={g.day}>
                {groups.length > 1 || range.preset !== "today" ? (
                  <h4 className="sticky top-0 z-[1] bg-card py-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                    {g.day} · {formatNumber(g.events.length)}
                  </h4>
                ) : null}
                <EventTimeline events={g.events} scroll={false} showPerson={showPerson} showProvider />
              </section>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-xs text-ink-500">
              <span>
                Showing {formatNumber(events.length)} of {formatNumber(Math.max(total, events.length))}
              </span>
              {olderCursor ? (
                <Button type="button" variant="ghost" className="h-8 text-xs" loading={loadingMore} loadingLabel="Loading…" onClick={() => void loadOlder()}>
                  Load older
                </Button>
              ) : (
                <span>Start of range</span>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
