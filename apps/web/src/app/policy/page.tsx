"use client";

import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { LoadingBlock } from "@/components/ui/States";
import { MetricGrid } from "@/components/domain/MetricGrid";
import { useApi } from "@/lib/use-api";

interface OrgPolicy {
  organizationId: string;
  timezone: string;
  retentionEventsDays: number;
  retentionSummariesDays: number;
  staleHeartbeatMinutes: number;
  idleThresholdMinutes: number;
  monitoringNoticeStatus: string;
  notificationRules: string[];
}

const COLLECTED = [
  "Session start, end, and heartbeat timestamps",
  "Model request timing, status, model name, and token totals when the provider reports them",
  "Tool calls by allowlisted category (file read/write, shell, search, test, build, browser)",
  "Test, build, lint, and type-check start, end, status, and summarised counts",
  "File-change metadata: repository-relative path category, change type, timestamp",
  "Connector health: version, last upload, queue depth, pause state",
  "The project or work item you select for a session",
  "Commits in repositories the agent worked in: files changed, lines added and removed, whether a check ran, and whether the commit reached a remote",
];

const NOT_COLLECTED = [
  "Prompts and model responses",
  "Source code or file contents",
  "Command text and shell output",
  "Keystrokes and screenshots",
  "Commit messages, author names, and commit hashes",
  "Private messages, browser history, or personal activity",
  "Secrets, tokens, and environment values — redacted locally and rejected at the server",
];

export default function PolicyPage() {
  const query = useApi<OrgPolicy>("/v1/org/policy");
  const p = query.data;

  return (
    <AppShell
      title="Collection policy"
      subtitle="What this system observes, what it never touches, and how long it keeps it"
    >
      <div className="mb-5">
        <Callout tone="info" title="Scope boundary">
          This system observes work performed through connected AI coding agents. It does not
          accept developer-submitted hours, compare activity with timesheets, estimate total human
          effort, or approve billing. Administrators and managers can open a ranking of observed
          AI usage; that table is not a performance score. Low observed AI usage is not evidence
          of low effort — planning, meetings, review, and manual coding are invisible to it.
        </Callout>
      </div>

      {query.loading || !p ? (
        <Card>
          <LoadingBlock rows={5} />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <CardHeader icon="shield"
              title="Current configuration"
              subtitle="Applied to every aggregate on every screen"
              action={
                <Badge tone={p.monitoringNoticeStatus === "approved" ? "ok" : "warn"}>
                  Notice: {p.monitoringNoticeStatus}
                </Badge>
              }
            />
            <CardBody>
              <MetricGrid
                columns={5}
                metrics={[
                  {
                    label: "Reporting timezone",
                    value: p.timezone,
                    help: "Hour labels use this timezone; every event timestamp is stored in UTC.",
                  },
                  {
                    label: "Idle threshold",
                    value: `${p.idleThresholdMinutes} min`,
                    help: "Gaps longer than this are excluded from the interactive session span.",
                  },
                  {
                    label: "Stale heartbeat",
                    value: `${p.staleHeartbeatMinutes} min`,
                    help: "A connector that has not checked in for this long is marked stale and raises a coverage warning.",
                  },
                  {
                    label: "Event retention",
                    value: `${p.retentionEventsDays} days`,
                    help: "Detailed events are purged after this period.",
                  },
                  {
                    label: "Summary retention",
                    value: `${p.retentionSummariesDays} days`,
                    help: "Hourly summaries and audit records are kept longer than raw events.",
                  },
                ]}
              />
            </CardBody>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader icon="list" tone="teal" title="What is collected" subtitle="Allowlisted metadata only" />
              <CardBody>
                <ul className="space-y-2">
                  {COLLECTED.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-ink-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon="shield" tone="rose" title="What is never collected" subtitle="Disabled by default and rejected at ingest" />
              <CardBody>
                <ul className="space-y-2">
                  {NOT_COLLECTED.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-ink-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader icon="person" tone="sky" title="Your rights" subtitle="Available to every monitored person" />
              <CardBody>
                <ul className="space-y-2.5 text-sm text-ink-700">
                  <li>
                    <span className="font-medium text-ink-900">See your own data.</span> You can view
                    exactly the events, sessions, and summaries collected about you — the same
                    records a manager can review.
                  </li>
                  <li>
                    <span className="font-medium text-ink-900">Pause collection.</span> Pausing
                    records a visible coverage gap instead of silently dropping data, and is never
                    presented as evidence of inactivity.
                  </li>
                  <li>
                    <span className="font-medium text-ink-900">Leave a session unassigned.</span>{" "}
                    Activity without a project stays explicitly labelled “no task selected” and is
                    never silently attributed elsewhere.
                  </li>
                  <li>
                    <span className="font-medium text-ink-900">Dispute a record.</span> Corrections
                    are versioned; earlier snapshots are retained with the reason for change.
                  </li>
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon="live" tone="amber" title="Health notifications" subtitle="Data-quality conditions only" />
              <CardBody>
                <div className="flex flex-wrap gap-1.5">
                  {p.notificationRules.map((r) => (
                    <Badge key={r} tone="neutral">
                      {r.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
                <p className="hint mt-3">
                  Notifications cover telemetry reliability — stale connectors, upload failures,
                  unsupported versions, prolonged unassigned activity, and summary-generation
                  failures. There are no alerts about a person&apos;s output.
                </p>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
