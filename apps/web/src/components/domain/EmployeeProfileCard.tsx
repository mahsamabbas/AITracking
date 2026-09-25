import Link from "next/link";
import type { ReactNode } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { ConnectorBadge } from "@/components/domain/Badges";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDate, formatRelative } from "@/lib/format";
import type { EmployeeDevice, EmployeeProfile } from "@/lib/types";

function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label mb-1">{label}</dt>
      <dd className="text-sm leading-snug text-ink-700">{children}</dd>
    </div>
  );
}

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
  return (
    <Card className="mb-5">
      <CardHeader
        title="Employee profile"
        subtitle="Directory details and portal photo (from the linked sign-in account)"
        action={
          isSelf ? (
            <Link href="/settings" className="btn-ghost h-8 text-xs text-brand-700 dark:text-brand-300">
              Edit profile →
            </Link>
          ) : null
        }
      />
      <CardBody className="pt-1">
        <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(11rem,14rem)] lg:items-start">
          <div className="flex justify-center lg:justify-start">
            <UserAvatar
              name={employee.displayName}
              src={employee.avatarUrl}
              size="lg"
              className="ring-2 ring-line ring-offset-2 ring-offset-card"
            />
          </div>

          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            <ProfileField label="Name">
              <span className="font-medium text-ink-900">
                {employee.displayName}
                {isSelf ? (
                  <span className="badge-info ml-2 align-middle text-2xs">You</span>
                ) : null}
              </span>
            </ProfileField>
            <ProfileField label="Email">{employee.email ?? "—"}</ProfileField>
            <ProfileField label="Team">{employee.team ?? "No team"}</ProfileField>
            <ProfileField label="Title">{employee.title ?? "—"}</ProfileField>
            <ProfileField label="Status">
              <span className="capitalize">{employee.status}</span>
            </ProfileField>
            <ProfileField label="Joined">{formatDate(employee.joinedAt)}</ProfileField>
          </dl>

          <aside className="flex min-w-0 flex-col gap-3 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="label">Connectors</p>
            {isSelf && showManageConnectors ? (
              <Link href="/my-connectors" className="btn-ghost h-8 w-fit text-xs">
                My connectors
              </Link>
            ) : null}
            {devices.length === 0 ? (
              <span className="badge-warn w-fit">No connector registered</span>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {devices.map((dev) => (
                  <li key={dev.deviceId} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <ConnectorBadge state={dev.state} />
                    <span className="hint truncate" title={`${dev.label ?? dev.provider} · ${formatRelative(dev.lastHeartbeat)}`}>
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
