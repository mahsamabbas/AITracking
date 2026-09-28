"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PlatformOrgList, type PlatformOrganization } from "@/components/platform/PlatformOrgList";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { IconChip } from "@/components/ui/Icon";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPatch, apiPost } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { readLogoFile } from "@/lib/image-upload";
import { Button } from "@/components/ui/Button";
import { FIELD_LIMITS } from "@/lib/validation";

type Organization = PlatformOrganization & { createdAt: string };

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
        {(
          [
            { label: "Organisations", value: formatNumber(totals.orgs), icon: "team" as const, tone: "brand" as const },
            { label: "Active tenants", value: formatNumber(totals.active), icon: "live" as const, tone: "teal" as const },
            { label: "Monitored people", value: formatNumber(totals.people), icon: "people" as const, tone: "violet" as const },
            { label: "Live connectors", value: formatNumber(totals.connectors), icon: "plug" as const, tone: "sky" as const },
          ] as const
        ).map((tile) => (
          <div
            key={tile.label}
            className="flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3.5 shadow-sm"
          >
            <IconChip name={tile.icon} tone={tile.tone} size="sm" />
            <div className="min-w-0">
              <p className="label">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{tile.value}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="order-2 lg:order-1 lg:col-span-2">
          <CardHeader icon="team"
            title="Customer organisations"
            subtitle={`${formatNumber(filtered.length)} shown`}
            action={
              <div className="relative w-full min-w-0 sm:w-52">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
                  aria-hidden
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="7" cy="7" r="4.5" />
                    <path d="m10.5 10.5 3 3" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="search"
                  className="field h-9 w-full pl-9 text-xs"
                  placeholder="Search organisations…"
                  maxLength={FIELD_LIMITS.searchQuery}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            }
          />
          {query.error ? (
            <ErrorState title="Could not load organisations" detail={query.error} onRetry={query.reload} />
          ) : query.loading ? (
            <LoadingBlock rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState compact title="No organisations yet" body="Create the first tenant on the right." />
          ) : (
            <PlatformOrgList
              organizations={filtered}
              busy={busy}
              onAddAdmin={(o) => {
                setAdminFor(o);
                setAdminForm({ name: "", email: "" });
              }}
              onToggle={(o) => void toggle(o)}
              onUploadLogo={(o, file) => void uploadOrgLogo(o, file)}
            />
          )}
        </Card>

        <Card className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <CardHeader icon="person"
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
                    maxLength={FIELD_LIMITS.displayName}
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
                    maxLength={FIELD_LIMITS.email}
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" className="h-9 px-3 text-xs" loading={busy} loadingLabel="Adding…">
                    Add administrator
                  </Button>
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
                    maxLength={FIELD_LIMITS.orgName}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Timezone (IANA)
                  <input
                    className={input}
                    maxLength={FIELD_LIMITS.timezone}
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-ink-700">
                  Administrator name
                  <input
                    className={input}
                    required
                    maxLength={FIELD_LIMITS.displayName}
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
                    maxLength={FIELD_LIMITS.email}
                    value={form.adminEmail}
                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  />
                </label>
                <Button type="submit" className="h-9 w-full text-xs" loading={busy} loadingLabel="Creating…">
                  Create organisation
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
