"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePlatformOrgOptional } from "@/lib/platform-org";
import { OrgLink } from "@/components/OrgLink";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPost } from "@/lib/api";
import { ORG_ASSIGNABLE_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { providerLabel } from "@/lib/providers";
import type { Role } from "@/lib/types";

interface OrgUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  organizationId: string;
  developerId?: string | null;
  hasConnector?: boolean;
}

const ROLE_TONE: Record<Role, "info" | "ok" | "neutral" | "warn"> = {
  administrator: "warn",
  manager: "info",
  developer: "ok",
  auditor: "neutral",
  super_admin: "warn",
};

const ASSIGNABLE_TOOLS = [
  { id: "cursor", label: "Cursor companion (file and task signals)" },
  { id: "claude_code", label: "Claude Code" },
  { id: "vscode", label: "VS Code companion" },
] as const;

interface IssuedKey {
  displayName: string;
  developerId: string;
  deviceId: string;
  token: string;
  provider: string;
}

export default function UsersPage() {
  const { token } = useAuth();
  const platformView = usePlatformOrgOptional();
  const query = useApi<{ users: OrgUser[] }>("/v1/users");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "developer" as Role,
  });
  const [issueFor, setIssueFor] = useState<OrgUser | null>(null);
  const [issueTool, setIssueTool] = useState("cursor");
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy("create");
    setNotice(null);
    try {
      const res = await apiPost<{ error?: string; user?: OrgUser }>("/v1/users", token, form);
      if (res.error === "invalid_role") {
        throw new Error(
          "Platform super admin accounts are not created under Access. From the repo root run: pnpm admin:create --super --email your@email.com --name \"Name\"",
        );
      }
      if (res.error) throw new Error(res.error.replace(/_/g, " "));
      const createdName = form.displayName;
      const role = form.role;
      const created = res.user;
      setForm({ displayName: "", email: "", password: "", role: "developer" });
      setNotice({
        tone: "info",
        text:
          role === "developer"
            ? `${createdName} can sign in. Issue a connector key next — they cannot add tools themselves.`
            : `${createdName} can sign in. Only developers are monitored.`,
      });
      query.reload();
      if (created?.developerId && created.role === "developer") {
        setIssueFor(created);
        setIssueTool("cursor");
      }
    } catch (err) {
      setNotice({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not create the user",
      });
    } finally {
      setBusy(null);
    }
  }

  async function issueKey() {
    if (!issueFor?.developerId) return;
    setBusy("issue");
    setNotice(null);
    setCopied(false);
    try {
      const res = await apiPost<{
        error?: string;
        deviceId?: string;
        token?: string;
      }>("/v1/connectors/register", token, {
        developerId: issueFor.developerId,
        provider: issueTool,
        label: `${issueFor.displayName} · ${providerLabel(issueTool)}`,
      });
      if (!res.deviceId || !res.token) {
        throw new Error(res.error?.replace(/_/g, " ") ?? "Could not issue key");
      }
      setIssued({
        displayName: issueFor.displayName,
        developerId: issueFor.developerId,
        deviceId: res.deviceId,
        token: res.token,
        provider: issueTool,
      });
      setIssueFor(null);
      setNotice({
        tone: "info",
        text: `Key issued for ${issueFor.displayName}. Copy it now — the token is shown once. Give it to them to enter on My connectors.`,
      });
      query.reload();
    } catch (err) {
      setNotice({
        tone: "bad",
        text: err instanceof Error ? err.message : "Could not issue the key",
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyKeys() {
    if (!issued) return;
    const text = [
      `Device ID: ${issued.deviceId}`,
      `Connector token: ${issued.token}`,
      `AI tool: ${providerLabel(issued.provider)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const users = query.data?.users ?? [];
  const developers = users.filter((u) => u.developerId);

  return (
    <AppShell
      title="Access"
      subtitle="You create logins and issue connector keys. Employees only activate the keys you assign."
    >
      {notice ? (
        <div className="mb-5">
          <Callout tone={notice.tone} title={notice.text} />
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="card-pad">
          <p className="label">1. Create the employee</p>
          <p className="mt-1.5 text-sm text-ink-700">
            A Developer login lets them see their own activity. It does not start tracking.
          </p>
        </div>
        <div className="card-pad">
          <p className="label">2. You issue a connector key</p>
          <p className="mt-1.5 text-sm text-ink-700">
            Assign which AI tool is allowed (Cursor, Claude Code, …). Copy the device ID and token
            and send them privately.
          </p>
        </div>
        <div className="card-pad">
          <p className="label">3. They activate that key</p>
          <p className="mt-1.5 text-sm text-ink-700">
            On their computer they paste the keys into My connectors. They cannot invent extra
            tools or credentials.
          </p>
        </div>
      </section>

      {issued ? (
        <div className="mb-5">
          <Card>
            <CardHeader
              title={`Assigned key for ${issued.displayName}`}
              subtitle={`${providerLabel(issued.provider)} · token is shown once`}
              action={
                <button type="button" className="btn-ghost h-8 text-xs" onClick={() => void copyKeys()}>
                  {copied ? "Copied" : "Copy keys"}
                </button>
              }
            />
            <CardBody>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="label">Device ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-ink-900">{issued.deviceId}</dd>
                </div>
                <div>
                  <dt className="label">Connector token</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-ink-900">{issued.token}</dd>
                </div>
              </dl>
              <p className="hint mt-4">
                Send {issued.displayName} the dashboard link and{" "}
                <Link href="/setup-connector" className="font-medium text-brand-600 underline">
                  Install agent
                </Link>{" "}
                guide. They install the local agent once, then My connectors → paste Device ID and
                token → Activate. Issue another key for a second tool or machine.
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {issueFor?.developerId ? (
        <div className="mb-5">
          <Card>
            <CardHeader
              title={`Issue connector key for ${issueFor.displayName}`}
              subtitle="Choose the AI tool this credential is for"
              action={
                <button type="button" className="btn-quiet h-8 text-xs" onClick={() => setIssueFor(null)}>
                  Cancel
                </button>
              }
            />
            <CardBody>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block min-w-[200px] flex-1">
                  <span className="label mb-1 block">AI tool</span>
                  <select
                    className="field"
                    value={issueTool}
                    onChange={(e) => setIssueTool(e.target.value)}
                  >
                    {ASSIGNABLE_TOOLS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy === "issue"}
                  onClick={() => void issueKey()}
                >
                  {busy === "issue" ? "Issuing…" : "Issue key"}
                </button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {!platformView ? (
        <Card>
          <CardHeader
            title="Add a user"
            subtitle="Developers are monitored; other roles are not. Platform super admins are created with pnpm admin:create --super (not here)."
          />
          <CardBody>
            <form className="space-y-3" onSubmit={onCreate}>
              <label className="block">
                <span className="label mb-1 block">Display name</span>
                <input
                  className="field"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="label mb-1 block">Email</span>
                <input
                  className="field"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="label mb-1 block">Temporary password</span>
                <input
                  className="field"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="label mb-1 block">Role</span>
                <select
                  className="field"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {ORG_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn-primary w-full" disabled={busy === "create"}>
                {busy === "create" ? "Creating…" : "Create user"}
              </button>
            </form>
          </CardBody>
        </Card>
        ) : (
          <Card>
            <CardHeader
              title="Platform view"
              subtitle="Account changes are made by each organisation's administrators. You can review members here."
            />
          </Card>
        )}

        <Card className="card-table xl:col-span-2">
          <CardHeader
            title="Members"
            subtitle={`${users.length} in this organisation · ${developers.length} monitored`}
            href="/connectors"
            hrefLabel="Connector health"
          />
          {query.error ? (
            <ErrorState
              title="Could not load members"
              detail={
                query.status === 403
                  ? "Only administrators can manage organisation access."
                  : query.error
              }
              onRetry={query.reload}
            />
          ) : query.loading ? (
            <LoadingBlock rows={6} />
          ) : users.length === 0 ? (
            <EmptyState variant="no-results" />
          ) : (
            <TableScroll>
              <table className="tbl min-w-[720px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Connector key</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="min-w-[120px] text-sm font-medium text-ink-900">
                        {u.displayName}
                      </td>
                      <td className="min-w-[160px] text-sm text-ink-500">{u.email}</td>
                      <td className="whitespace-nowrap">
                        <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className="min-w-[140px]">
                        {!u.developerId ? (
                          <span className="hint">Not monitored</span>
                        ) : u.hasConnector ? (
                          <Badge tone="ok">Key issued</Badge>
                        ) : (
                          <Badge tone="warn">No key yet</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          {u.developerId ? (
                            <button
                              type="button"
                              className="btn-ghost h-8 text-xs"
                              onClick={() => {
                                setIssueFor(u);
                                setIssueTool("cursor");
                                setIssued(null);
                              }}
                            >
                              {u.hasConnector ? "Issue another key" : "Issue key"}
                            </button>
                          ) : null}
                          {u.developerId ? (
                            <OrgLink
                              href={`/employees/${u.developerId}`}
                              className="inline-flex h-8 items-center text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              Analytics →
                            </OrgLink>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
