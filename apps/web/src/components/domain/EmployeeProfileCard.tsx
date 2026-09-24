import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import { ConnectorBadge } from "@/components/domain/Badges";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatDate, formatRelative } from "@/lib/format";
import type { EmployeeDevice, EmployeeProfile } from "@/lib/types";

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
            <Link href="/settings" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Edit profile →
            </Link>
          ) : null
        }
      />
      <CardBody className="pt-2">
        <div className="flex flex-wrap items-start gap-5">
          <UserAvatar name={employee.displayName} src={employee.avatarUrl} size="lg" />
          <dl className="grid min-w-[200px] flex-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="label">Name</dt>
              <dd className="text-sm font-medium text-ink-900">
                {employee.displayName}
                {isSelf ? <span className="badge-info ml-2">You</span> : null}
              </dd>
            </div>
            <div>
              <dt className="label">Email</dt>
              <dd className="text-sm text-ink-700">{employee.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Team</dt>
              <dd className="text-sm text-ink-700">{employee.team ?? "No team"}</dd>
            </div>
            <div>
              <dt className="label">Title</dt>
              <dd className="text-sm text-ink-700">{employee.title ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Status</dt>
              <dd className="text-sm capitalize text-ink-700">{employee.status}</dd>
            </div>
            <div>
              <dt className="label">Joined</dt>
              <dd className="text-sm text-ink-700">{formatDate(employee.joinedAt)}</dd>
            </div>
          </dl>
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-4 sm:w-auto sm:border-0 sm:pt-0">
            {isSelf && showManageConnectors ? (
              <Link href="/my-connectors" className="btn-ghost h-8 text-xs">
                My connectors
              </Link>
            ) : null}
            {devices.length === 0 ? (
              <span className="badge-warn">No connector registered</span>
            ) : (
              devices.map((dev) => (
                <span key={dev.deviceId} className="flex items-center gap-1.5">
                  <ConnectorBadge state={dev.state} />
                  <span className="hint">
                    {dev.label ?? dev.provider} · {formatRelative(dev.lastHeartbeat)}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
