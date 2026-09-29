"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { FirstActivityStatus } from "@/components/domain/FirstActivityStatus";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { Callout } from "@/components/ui/Callout";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ConnectorBadge, ProviderBadge } from "@/components/domain/Badges";
import { ActivateConnectorForm } from "@/components/domain/AddConnectorForm";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { ThisComputerStatus } from "@/components/domain/ConnectThisComputer";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { showConnectorInstallStepper, useConnectorSetupPhase } from "@/lib/connector-local";
import { apiPost } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { homePathForRole } from "@/lib/permissions";
import type { LiveStatus } from "@/lib/types";

export default function MyConnectorsPage() {
  const { token, user } = useAuth();
  const live = useApi<LiveStatus>("/v1/dashboard/live?limit=1", { pollMs: 15_000 });
  const assigned = useApi<{
    devices: { deviceId: string; provider: string | null; label: string | null }[];
  }>(user?.role === "developer" ? "/v1/connectors/mine" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { phase: connectorPhase, installedHere } = useConnectorSetupPhase(4_000);
  const showInstallStepper = showConnectorInstallStepper(connectorPhase, installedHere);

  const developerId = user?.developerId;
  const mine = (live.data?.connectors ?? []).filter(
    (c) => !developerId || c.developerId === developerId,
  );
  const assignedKeys = assigned.data?.devices ?? [];

  async function toggle(deviceId: string, paused: boolean) {
    setBusy(deviceId);
    setNotice(null);
    try {
      await apiPost(`/v1/connectors/${deviceId}/${paused ? "resume" : "pause"}`, token);
      setNotice(paused ? "Collection resumed." : "Collection paused. A coverage gap was recorded.");
      live.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update the connector");
    } finally {
      setBusy(null);
    }
  }

  if (user && user.role !== "developer") {
    return (
      <AppShell title="My connectors">
        <Callout
          tone="info"
          title="Connector keys are issued on Access"
          action={
            <Link href="/users" className="btn-ghost h-8 text-xs">
              Access →
            </Link>
          }
        >
          Administrators assign device IDs and tokens to each employee. Employees only activate
          those keys.
        </Callout>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="My connectors"
      subtitle="Activating your key here is required — the rest of the dashboard stays locked until pairing succeeds."
    >
      {notice ? (
        <div className="mb-5">
          <Callout tone="info" title={notice} />
        </div>
      ) : null}

      <div className="mb-5 space-y-4">
        {showInstallStepper ? <OnboardingStepper /> : null}
        <ThisComputerStatus />
        <FirstActivityStatus live={live.data} developerId={developerId} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div data-onboarding="onboard-activate-form">
        <Card>
          <CardHeader icon="plug" tone="teal"
            title="Activate assigned key"
            subtitle="Paste the device ID and token from your administrator"
          />
          <CardBody>
            {developerId ? (
              <ActivateConnectorForm
                displayName={user?.displayName}
                onActivated={() => {
                  live.reload();
                  assigned.reload();
                }}
              />
            ) : (
              <p className="hint">This login is not a monitored developer account.</p>
            )}
          </CardBody>
        </Card>
        </div>

        <Card className="card-table xl:col-span-2">
          <CardHeader icon="plug"
            title="Keys assigned to you"
            subtitle={
              assignedKeys.length
                ? `${assignedKeys.length} issued by your administrator`
                : "None yet — ask admin to issue a key on Access"
            }
            href={developerId ? `/employees/${developerId}` : homePathForRole("developer")}
            hrefLabel="My activity"
          />
          {assigned.error ? (
            <ErrorState title="Could not load assigned keys" detail={assigned.error} onRetry={assigned.reload} />
          ) : assigned.loading ? (
            <LoadingBlock rows={4} />
          ) : assignedKeys.length === 0 ? (
            <EmptyState
              variant="connector-offline"
              title="No key assigned"
              body="Your administrator must issue a connector key for a specific AI tool. You cannot create one here."
            />
          ) : live.error ? (
            <ErrorState title="Could not load connector health" detail={live.error} onRetry={live.reload} />
          ) : live.loading ? (
            <LoadingBlock rows={5} />
          ) : (
            <TableScroll>
              <table className="tbl min-w-[520px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>AI tool</th>
                    <th>State</th>
                    <th>Last heartbeat</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {assignedKeys.map((k) => {
                    const liveRow = mine.find((c) => c.deviceId === k.deviceId);
                    return (
                      <tr key={k.deviceId}>
                        <td className="text-sm font-medium text-ink-900">
                          {k.label ?? "Assigned connector"}
                          <span className="hint block font-mono">{k.deviceId.slice(0, 8)}…</span>
                        </td>
                        <td>
                          <ProviderBadge provider={k.provider} size="sm" />
                        </td>
                        <td>
                          {liveRow ? (
                            <ConnectorBadge state={liveRow.state} />
                          ) : (
                            <span className="hint">Not activated on this computer</span>
                          )}
                        </td>
                        <td className="num text-sm text-ink-500">
                          {liveRow ? formatRelative(liveRow.lastHeartbeat) : "—"}
                        </td>
                        <td className="text-right">
                          {liveRow ? (
                            <button
                              type="button"
                              className="btn-ghost h-8 text-xs"
                              disabled={busy === k.deviceId}
                              onClick={() => void toggle(k.deviceId, liveRow.paused)}
                            >
                              {liveRow.paused ? "Resume" : "Pause"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
