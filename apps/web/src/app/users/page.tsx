"use client";

import { useState } from "react";
import Link from "next/link";
import { Formik, Form, Field, ErrorMessage, type FormikHelpers } from "formik";
import { usePlatformOrgOptional } from "@/lib/platform-org";
import { OrgLink } from "@/components/OrgLink";
import { AppShell } from "@/components/AppShell";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { TableScroll } from "@/components/ui/TableScroll";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { PasswordField } from "@/components/ui/PasswordField";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { apiPost } from "@/lib/api";
import { ORG_ASSIGNABLE_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { ASSIGNABLE_AI_TOOLS, providerLabel } from "@/lib/providers";
import {
  createUserInitialValues,
  createUserSchema,
} from "@/lib/user-form-schema";
import { FIELD_LIMITS, PASSWORD_REQUIREMENTS_HINT, passwordErrorMessage } from "@/lib/validation";
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

const ASSIGNABLE_TOOLS = ASSIGNABLE_AI_TOOLS.map((id) => ({ id, label: providerLabel(id) }));

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
  const [issueFor, setIssueFor] = useState<OrgUser | null>(null);
  const [issueTool, setIssueTool] = useState("cursor");
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function onCreate(
    values: typeof createUserInitialValues,
    helpers: FormikHelpers<typeof createUserInitialValues>,
  ) {
    setNotice(null);
    try {
      const res = await apiPost<{ error?: string; user?: OrgUser }>("/v1/users", token, values);
      if (res.error === "invalid_role") {
        throw new Error(
          "Platform super admin accounts are not created under Access. From the repo root run: pnpm admin:create --super --email your@email.com --name \"Name\"",
        );
      }
      if (res.error?.startsWith("password_")) {
        throw new Error(passwordErrorMessage(res.error));
      }
      if (res.error) throw new Error(res.error.replace(/_/g, " "));
      const createdName = values.displayName.trim();
      const role = values.role;
      const created = res.user;
      helpers.resetForm();
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
      helpers.setSubmitting(false);
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
            <CardHeader icon="plug" tone="teal"
              title={`Assigned key for ${issued.displayName}`}
              subtitle={`${providerLabel(issued.provider)} · token is shown once`}
              action={
                <button type="button" className="btn-ghost h-8 text-xs" onClick={() => void copyKeys()} disabled={copied}>
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
            <CardHeader icon="plug" tone="teal"
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
                <Button
                  type="button"
                  loading={busy === "issue"}
                  loadingLabel="Issuing…"
                  onClick={() => void issueKey()}
                >
                  Issue key
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {!platformView ? (
        <Card>
          <CardHeader icon="person"
            title="Add a user"
            subtitle="Developers are monitored; other roles are not. Platform super admins are created with pnpm admin:create --super (not here)."
          />
          <CardBody>
            <Formik
              initialValues={createUserInitialValues}
              validationSchema={createUserSchema}
              onSubmit={onCreate}
            >
              {({ isSubmitting, values, setFieldValue, setFieldTouched }) => (
                <Form className="space-y-3">
                  <label className="block">
                    <span className="label mb-1 block">Display name</span>
                    <Field
                      name="displayName"
                      className="field"
                      maxLength={FIELD_LIMITS.displayName}
                      autoComplete="name"
                    />
                    <ErrorMessage name="displayName">
                      {(msg) => <p className="mt-1 text-2xs text-rose-700 dark:text-rose-300">{msg}</p>}
                    </ErrorMessage>
                  </label>
                  <label className="block">
                    <span className="label mb-1 block">Email</span>
                    <Field
                      name="email"
                      type="email"
                      className="field"
                      maxLength={FIELD_LIMITS.email}
                      autoComplete="email"
                    />
                    <ErrorMessage name="email">
                      {(msg) => <p className="mt-1 text-2xs text-rose-700 dark:text-rose-300">{msg}</p>}
                    </ErrorMessage>
                  </label>
                  <label className="block">
                    <span className="label mb-1 block">Temporary password</span>
                    <PasswordField
                      name="password"
                      value={values.password}
                      maxLength={FIELD_LIMITS.password}
                      autoComplete="new-password"
                      onChange={(e) => {
                        void setFieldValue("password", e.target.value);
                        void setFieldTouched("password", true, false);
                      }}
                      onBlur={() => void setFieldTouched("password", true)}
                      required
                    />
                    <p className="hint mt-1">{PASSWORD_REQUIREMENTS_HINT}</p>
                    <ErrorMessage name="password">
                      {(msg) => <p className="mt-1 text-2xs text-rose-700 dark:text-rose-300">{msg}</p>}
                    </ErrorMessage>
                  </label>
                  <label className="block">
                    <span className="label mb-1 block">Role</span>
                    <Field as="select" name="role" className="field">
                      {ORG_ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Field>
                    <ErrorMessage name="role">
                      {(msg) => <p className="mt-1 text-2xs text-rose-700 dark:text-rose-300">{msg}</p>}
                    </ErrorMessage>
                  </label>
                  <Button type="submit" className="w-full" loading={isSubmitting} loadingLabel="Creating…">
                    Create user
                  </Button>
                </Form>
              )}
            </Formik>
          </CardBody>
        </Card>
        ) : (
          <Card>
            <CardHeader icon="team" tone="slate"
              title="Platform view"
              subtitle="Account changes are made by each organisation's administrators. You can review members here."
            />
          </Card>
        )}

        <Card className="card-table xl:col-span-2">
          <CardHeader icon="people"
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
