"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { TableScroll } from "@/components/ui/TableScroll";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPatch, apiPost } from "@/lib/api";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { readLogoFile } from "@/lib/image-upload";

interface Organization {
  id: string;
  name: string;
  timezone: string;
  logoUrl: string | null;
  createdAt: string;
  disabled: boolean;
  administrators: number;
  users: number;
  employees: number;
  connectors: number;
  lastActivityAt: string | null;
}

interface Issued {
  organization: string;
  email: string;
  password: string;
}

const input =
  "h-10 w-full rounded-lg border border-line bg-card px-3 text-base text-ink-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:text-sm";

export default function PlatformPage() {
  const { user, token } = useAuth();
  const allowed = user?.role === "super_admin";
  const query = useApi<{ organizations: Organization[] }>(allowed ? "/v1/platform/organizations" : null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", timezone: "Asia/Karachi", adminName: "", adminEmail: "" });
  const [adminFor, setAdminFor] = useState<Organization | null>(null);
  const [adminForm, setAdminForm] = useState({ name: "", email: "" });
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const orgs = query.data?.organizations ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q) || o.timezone.toLowerCase().includes(q));
  }, [orgs, search]);

  const totals = useMemo(
    () => ({
      orgs: orgs.length,
      active: orgs.filter((o) => !o.disabled).length,
      people: orgs.reduce((s, o) => s + o.employees, 0),
      connectors: orgs.reduce((s, o) => s + o.connectors, 0),
    }),
    [orgs],
  );

  if (user && !allowed) {
    return (
      <AppShell title="Platform">
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
      setForm({ name: "", timezone: "Asia/Karachi", adminName: "", adminEmail: "" });
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
      if (
        !org.disabled &&
        !window.confirm(
          `Disable ${org.name}? Sign-in and connector uploads stop until you enable it again. Data is kept.`,
        )
      ) {
        return;
      }
      await apiPatch(`/v1/platform/organizations/${org.id}`, token, { disabled: !org.disabled });
    });

  const uploadOrgLogo = (org: Organization, file: File) =>
    run(async () => {
      const logoUrl = await readLogoFile(file);
      await apiPatch(`/v1/platform/organizations/${org.id}`, token, { logoUrl });
    });

  return (
    <AppShell
      title="Platform console"
      subtitle="Manage customer organisations, then open any tenant to inspect its dashboards and access settings."
    >
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
            Send these through a private channel. The password is shown only once.
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

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Organisations", value: formatNumber(totals.orgs) },
          { label: "Active tenants", value: formatNumber(totals.active) },
          { label: "Monitored people", value: formatNumber(totals.people) },
          { label: "Live connectors", value: formatNumber(totals.connectors) },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-line bg-card px-4 py-3 shadow-sm"
          >
            <p className="label">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{tile.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="card-table order-2 lg:order-1 lg:col-span-2">
          <CardHeader
            title="Customer organisations"
            subtitle={`${formatNumber(filtered.length)} shown`}
            action={
              <input
                className="field h-9 w-full min-w-0 sm:w-44 text-xs"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            }
          />
          {query.error ? (
            <ErrorState title="Could not load organisations" detail={query.error} onRetry={query.reload} />
          ) : query.loading ? (
            <LoadingBlock rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState compact title="No organisations yet" body="Create the first tenant on the right." />
          ) : (
            <TableScroll className="overflow-x-auto">
              <table className="tbl min-w-[640px] w-full">
                <thead>
                  <tr>
                    <th>Organisation</th>
                    <th className="text-right">People</th>
                    <th className="text-right">Connectors</th>
                    <th>Last activity</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id}>
                      <td className="min-w-[140px] max-w-[220px]">
                        <div className="flex min-w-0 items-center gap-2">
                          {o.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={o.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain ring-1 ring-line" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-2xs text-ink-400 dark:bg-white/5">
                              —
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-900">{o.name}</p>
                            <p className="hint truncate">
                              {o.timezone} · {formatNumber(o.users)} accounts · {formatNumber(o.administrators)} admins
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="num whitespace-nowrap text-right">{o.employees}</td>
                      <td className="num whitespace-nowrap text-right">{o.connectors}</td>
                      <td className="whitespace-nowrap text-sm text-ink-500">
                        {o.lastActivityAt ? formatRelative(o.lastActivityAt) : "—"}
                      </td>
                      <td className="whitespace-nowrap">
                        {o.disabled ? (
                          <span className="badge-bad">Disabled</span>
                        ) : (
                          <span className="badge-ok">Active</span>
                        )}
                      </td>
                      <td className="max-w-[min(100%,20rem)] text-right align-top">
                        <div className="flex flex-wrap items-center justify-end gap-1 py-0.5">
                        <Link
                          href={`/platform/${o.id}/overview`}
                          className="btn-primary h-8 shrink-0 px-2.5 text-2xs sm:px-3 sm:text-xs"
                        >
                          Open workspace
                        </Link>
                        <button
                          type="button"
                          className="btn-ghost h-8 shrink-0 px-2 text-2xs sm:text-xs"
                          disabled={busy || o.disabled}
                          onClick={() => {
                            setAdminFor(o);
                            setAdminForm({ name: "", email: "" });
                          }}
                        >
                          Add admin
                        </button>
                        <label className="btn-ghost h-8 shrink-0 cursor-pointer px-2 text-2xs sm:text-xs">
                          Logo
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadOrgLogo(o, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-ghost h-8 shrink-0 px-2 text-2xs sm:text-xs"
                          disabled={busy}
                          onClick={() => void toggle(o)}
                        >
                          {o.disabled ? "Enable" : "Disable"}
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>

        <Card className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <CardHeader
            title={adminFor ? `Administrator · ${adminFor.name}` : "New organisation"}
            subtitle={
              adminFor
                ? "They manage people and connectors inside that tenant."
                : "Creates the tenant and its first administrator login."
            }
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
                  <input
                    className={input}
                    required
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Work email
                  <input
                    className={input}
                    type="email"
                    required
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
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
                  Organisation name
                  <input
                    className={input}
                    required
                    minLength={2}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Timezone (IANA)
                  <input
                    className={input}
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Administrator name
                  <input
                    className={input}
                    required
                    value={form.adminName}
                    onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Administrator email
                  <input
                    className={input}
                    type="email"
                    required
                    value={form.adminEmail}
                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  />
                </label>
                <button type="submit" className="btn-primary h-9 w-full text-xs" disabled={busy}>
                  Create organisation
                </button>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
