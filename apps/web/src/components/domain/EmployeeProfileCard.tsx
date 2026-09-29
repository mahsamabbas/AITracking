import Link from "next/link";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { ConnectorBadge } from "@/components/domain/Badges";
import { Card, CardBody } from "@/components/ui/Card";
import { formatDate, formatRelative } from "@/lib/format";
import type { EmployeeDevice, EmployeeProfile } from "@/lib/types";

function ProfileField({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""} rounded-xl border border-line/70 bg-raised px-3.5 py-2.5 dark:bg-white/[0.03]`}>
      <dt className="text-2xs font-medium uppercase tracking-[0.06em] text-ink-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium leading-snug text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * Who this is, in one glance: identity on the left, directory details as a
 * tidy grid, and connectors in their own panel so a long device list never
 * leaves the details floating in empty space.
 */
export function EmployeeProfileCard({
  employee,
  devices,
  isSelf,
  showManageConnectors,
}: {
  employee: EmployeeProfile;
  devices: EmployeeDevice[];
  isSelf: boolean;
  showManageConnectors?: boolean;
}) {
  const subtitle = [employee.title, employee.team].filter(Boolean).join(" · ");
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="relative border-b border-line/70 bg-gradient-to-r from-brand-50 via-card to-card px-5 py-5 dark:from-brand-100/40">
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar
            name={employee.displayName}
            src={employee.avatarUrl}
            size="lg"
            className="ring-4 ring-card"
          />
          <div className="min-w-0 flex-1 basis-[12rem]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight text-ink-900 sm:text-xl">{employee.displayName}</h2>
              {isSelf ? <span className="badge-info">You</span> : null}
              <span className={employee.status === "active" ? "badge-ok capitalize" : "badge-neutral capitalize"}>
                {employee.status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-ink-500">{subtitle || "Directory profile"}</p>
          </div>
          {isSelf ? (
            <Link href="/settings" className="btn-ghost h-9 text-xs">
              Edit profile
            </Link>
          ) : null}
        </div>
      </div>
      <CardBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] lg:items-start">
          <dl className="grid min-w-0 grid-cols-2 gap-2.5 xl:grid-cols-3">
            <ProfileField label="Email" wide>
              {employee.email ?? "—"}
            </ProfileField>
            <ProfileField label="Team">{employee.team ?? "No team"}</ProfileField>
            <ProfileField label="Title">{employee.title ?? "—"}</ProfileField>
            <ProfileField label="Status">
              <span className="capitalize">{employee.status}</span>
            </ProfileField>
            <ProfileField label="Joined">{formatDate(employee.joinedAt)}</ProfileField>
          </dl>

          <aside className="min-w-0 rounded-xl border border-line/70 p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-2xs font-medium uppercase tracking-[0.06em] text-ink-500">Connectors</p>
              {isSelf && showManageConnectors ? (
                <Link href="/my-connectors" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Manage →
                </Link>
              ) : null}
            </div>
            {devices.length === 0 ? (
              <span className="badge-warn">No connector registered</span>
            ) : (
              <ul className="flex max-h-44 flex-col gap-2 overflow-y-auto overscroll-y-contain pr-1">
                {devices.map((dev) => (
                  <li key={dev.deviceId} className="flex min-w-0 items-center gap-2">
                    <ConnectorBadge state={dev.state} />
                    <span className="hint min-w-0 truncate" title={`${dev.label ?? dev.provider} · ${formatRelative(dev.lastHeartbeat)}`}>
                      {dev.label ?? dev.provider} · {formatRelative(dev.lastHeartbeat)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </CardBody>
    </Card>
  );
}
