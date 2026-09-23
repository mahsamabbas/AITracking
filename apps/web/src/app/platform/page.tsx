"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { TableScroll } from "@/components/ui/TableScroll";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";

interface Organization {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  disabled: boolean;
  administrators: number;
  users: number;
  employees: number;
  connectors: number;
  lastActivityAt: string | null;
}

/** Credentials are shown exactly once, right after they are created. */
interface Issued {
  organization: string;
  email: string;
  password: string;
}

const input = "h-9 w-full rounded-md border border-line bg-card px-3 text-sm text-ink-900";

/**
 * Multi-tenant console for the platform super admin: create organisations and
 * their first administrator, add administrators, disable/enable an
 * organisation. Each organisation then manages its own accounts under Access.
 * No organisation's activity is visible here.
 */
export default function PlatformPage() {
  const { user, token } = useAuth();
  const allowed = user?.role === "super_admin";
  const query = useApi<{ organizations: Organization[] }>(allowed ? "/v1/platform/organizations" : null);
  const [form, setForm] = useState({ name: "", timezone: "UTC", adminName: "", adminEmail: "" });
  const [adminFor, setAdminFor] = useState<Organization | null>(null);
  const [adminForm, setAdminForm] = useState({ name: "", email: "" });
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user && !allowed) {
    return (
      <AppShell title="Organizations">
        <Card>
          <EmptyState variant="no-permission" />
        </Card>
      </AppShell>
    );
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      query.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/_/g, " ") : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const createOrg = () =>
    run(async () => {
      const res = await apiPost<{ organization: { name: string }; admin: { email: string; password: string } }>(
        "/v1/platform/organizations",
        token,
        form,
      );
      setIssued({ organization: res.organization.name, ...res.admin });
      setForm({ name: "", timezone: "UTC", adminName: "", adminEmail: "" });
    });

  const addAdmin = () =>
    run(async () => {
      if (!adminFor) return;
      const res = await apiPost<{ admin: { email: string; password: string } }>(
        `/v1/platform/organizations/${adminFor.id}/admins`,
        token,
        adminForm,
      );
      setIssued({ organization: adminFor.name, ...res.admin });
      setAdminFor(null);
      setAdminForm({ name: "", email: "" });
    });

  const toggle = (org: Organization) =>
    run(async () => {
      if (!org.disabled && !window.confirm(`Disable ${org.name}? Nobody in it can sign in and its connectors stop uploading until you enable it again. No data is deleted.`)) return;
      await apiPatch(`/v1/platform/organizations/${org.id}`, token, { disabled: !org.disabled });
    });

  const orgs = query.data?.organizations ?? [];

  return (
    <AppShell title="Organizations" subtitle="Create organisations and their administrators. Each organisation manages its own accounts.">
      {issued ? (
        <div className="mb-5">
          <Callout
            tone="info"
            title={`Administrator ready for ${issued.organization}`}
            action={
              <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setIssued(null)}>
                Done
              </button>
            }
          >
            Send these to the administrator through a private channel. The password is shown only now; they
            can change it after signing in.
            <div className="mt-2 grid gap-1 font-mono text-xs">
              <span>Email: {issued.email}</span>
              <span className="flex items-center gap-2">
                Password: {issued.password}
                <button
                  type="button"
                  className="btn-ghost h-7 px-2 text-2xs"
                  onClick={() => void navigator.clipboard?.writeText(issued.password)}
                >
                  Copy
                </button>
              </span>
            </div>
          </Callout>
        </div>
      ) : null}
      {error ? (
        <div className="mb-5">
          <Callout tone="bad" title="Could not complete that">
            {error}
          </Callout>
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2 card-table">
          <CardHeader title="Organizations" subtitle={`${formatNumber(orgs.length)} organisation${orgs.length === 1 ? "" : "s"}`} />
          {query.error ? (
            <ErrorState title="Could not load organisations" detail={query.error} onRetry={query.reload} />
          ) : query.loading ? (
            <LoadingBlock rows={4} />
          ) : orgs.length === 0 ? (
            <EmptyState compact title="No organisations yet" body="Create the first organisation and its administrator." />
          ) : (
            <TableScroll>
              <table className="tbl min-w-[760px]">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th className="text-right">Admins</th>
                    <th className="text-right">Accounts</th>
                    <th className="text-right">Employees</th>
                    <th className="text-right">Connectors</th>
                    <th>Last activity</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <p className="text-sm font-medium text-ink-900">{o.name}</p>
                        <p className="hint">
                          {o.timezone} · created {formatDate(o.createdAt)}
                        </p>
                      </td>
                      <td className="num text-right">{o.administrators}</td>
                      <td className="num text-right">{o.users}</td>
                      <td className="num text-right">{o.employees}</td>
                      <td className="num text-right">{o.connectors}</td>
                      <td className="text-sm text-ink-500">{o.lastActivityAt ? formatRelative(o.lastActivityAt) : "—"}</td>
                      <td>{o.disabled ? <span className="badge-bad">Disabled</span> : <span className="badge-ok">Active</span>}</td>
                      <td className="whitespace-nowrap text-right">
                        <button
                          type="button"
                          className="btn-ghost h-8 text-xs"
                          disabled={busy || o.disabled}
                          onClick={() => {
                            setAdminFor(o);
                            setAdminForm({ name: "", email: "" });
                          }}
                        >
                          Add admin
                        </button>
                        <button type="button" className="btn-ghost h-8 text-xs" disabled={busy} onClick={() => void toggle(o)}>
                          {o.disabled ? "Enable" : "Disable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>

        <Card>
          <CardHeader
            title={adminFor ? `Add an administrator to ${adminFor.name}` : "New organization"}
            subtitle={adminFor ? "They can then add their own managers, developers, and auditors." : "Creates the organisation and its first administrator."}
          />
          <CardBody>
            {adminFor ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addAdmin();
                }}
              >
                <label className="block text-xs font-medium text-ink-700">
                  Full name
                  <input className={input} required value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Work email
                  <input className={input} type="email" required value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary h-9 px-3 text-xs" disabled={busy}>
                    Add administrator
                  </button>
                  <button type="button" className="btn-ghost h-9 text-xs" onClick={() => setAdminFor(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createOrg();
                }}
              >
                <label className="block text-xs font-medium text-ink-700">
                  Organization name
                  <input className={input} required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Timezone (IANA, e.g. Asia/Karachi)
                  <input className={input} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Administrator name
                  <input className={input} required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Administrator email
                  <input className={input} type="email" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
                </label>
                <button type="submit" className="btn-primary h-9 px-3 text-xs" disabled={busy}>
                  Create organization
                </button>
              </form>
            )}
          </CardBody>
        </Card>
      </section>
    </AppShell>
  );
}
