import type { IconName, Tone } from "@/components/ui/Icon";
import { formatDuration, formatNumber } from "./format";
import { providerLabel } from "./providers";
import type { OrganizationAnalytics } from "./types";

/** The slice of an analytics payload highlights need — org, person, or tool. */
export type HighlightInput = Pick<OrganizationAnalytics, "totals" | "hourPattern" | "dailyTrend" | "tools" | "weekdayPattern"> & {
  commits?: OrganizationAnalytics["commits"] | null;
  teams?: OrganizationAnalytics["teams"];
  scope?: OrganizationAnalytics["scope"];
  models?: { model: string; sessions: number }[];
};

export interface Highlight {
  id: string;
  icon: IconName;
  tone: Tone;
  label: string;
  value: string;
  detail: string;
}

/** Same 24-hour labels as the working-hour chart. */
function hourLabel(h: number): string {
  const hh = (x: number) => `${String(x % 24).padStart(2, "0")}:00`;
  return `${hh(h)} – ${hh(h + 1)}`;
}

function maxBy<T>(items: T[], key: (t: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) if (key(item) > 0 && (!best || key(item) > key(best))) best = item;
  return best;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Plain-language facts derived from the analytics payload — no extra request.
 * Each one is only produced when its data exists, so a quiet period shows
 * fewer highlights instead of zeros.
 */
export function deriveHighlights(d: HighlightInput): Highlight[] {
  const out: Highlight[] = [];
  const t = d.totals;

  const peak = maxBy(d.hourPattern, (h) => h.activeMs);
  if (peak) {
    const total = d.hourPattern.reduce((s, h) => s + h.activeMs, 0);
    out.push({
      id: "peak-hour",
      icon: "sun",
      tone: "amber",
      label: "Peak hour",
      value: hourLabel(peak.hour),
      detail: `${pct(peak.activeMs, total)}% of agent active time`,
    });
  }

  const day = maxBy(d.dailyTrend, (p) => p.activeMs);
  if (day && d.dailyTrend.length > 1) {
    out.push({
      id: "busiest-day",
      icon: "calendar",
      tone: "sky",
      label: "Busiest day",
      value: new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      detail: `${formatDuration(day.activeMs)} active · ${formatNumber(day.sessions)} sessions`,
    });
  }

  const tool = d.tools.length > 1 || !d.models?.length ? maxBy(d.tools, (x) => x.activeMs) : undefined;
  const model = !tool ? maxBy(d.models ?? [], (m) => m.sessions) : undefined;
  if (model) {
    const total = (d.models ?? []).reduce((s, m) => s + m.sessions, 0);
    out.push({
      id: "top-model",
      icon: "model",
      tone: "violet",
      label: "Most used model",
      value: model.model,
      detail: `${pct(model.sessions, total)}% of sessions`,
    });
  }
  if (tool) {
    const total = d.tools.reduce((s, x) => s + x.activeMs, 0);
    out.push({
      id: "top-tool",
      icon: "model",
      tone: "violet",
      label: "Most used AI tool",
      value: providerLabel(tool.provider),
      detail:
        d.scope === "organization"
          ? `${pct(tool.activeMs, total)}% of active time · ${tool.employees} ${tool.employees === 1 ? "person" : "people"}`
          : `${pct(tool.activeMs, total)}% of active time · ${formatNumber(tool.sessions)} sessions`,
    });
  }

  if (d.commits && d.commits.commits > 0) {
    out.push({
      id: "ship-rate",
      icon: "ship",
      tone: "teal",
      label: "Ship rate",
      value: `${pct(d.commits.shipped, d.commits.commits)}%`,
      detail: `${formatNumber(d.commits.shipped)} of ${formatNumber(d.commits.commits)} commits pushed`,
    });
  }

  if (t.sessions > 0 && t.toolCalls > 0) {
    out.push({
      id: "depth",
      icon: "tool",
      tone: "brand",
      label: "Tool calls per session",
      value: formatNumber(Math.round(t.toolCalls / t.sessions)),
      detail: `${formatNumber(Math.round(t.modelRequests / t.sessions))} model calls · avg ${formatDuration(t.avgSessionMs)}`,
    });
  }

  const team = d.scope === "organization" && (d.teams?.length ?? 0) > 1 ? maxBy(d.teams ?? [], (x) => x.activeMs) : undefined;
  if (team) {
    out.push({
      id: "top-team",
      icon: "team",
      tone: "slate",
      label: "Most active team",
      value: team.team,
      detail: `${formatDuration(team.activeMs)} · ${team.employees} ${team.employees === 1 ? "person" : "people"}`,
    });
  } else {
    const weekday = maxBy(d.weekdayPattern, (w) => w.activeMs);
    if (weekday) {
      out.push({
        id: "top-weekday",
        icon: "calendar",
        tone: "slate",
        label: "Busiest weekday",
        value: weekday.label,
        detail: `${formatDuration(weekday.activeMs)} across the period`,
      });
    }
  }

  return out;
}
