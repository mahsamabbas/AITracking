import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  EventTypes,
  isKnownProvider,
  SCHEMA_VERSION,
  providerCapability,
  providerFromHostApp,
  type ActivityEvent,
} from "@techlio/event-schema";
import {
  claudeHookToEvents,
  claudeOtlpLogsToEvents,
  type ClaudeHookPayload,
  type OtlpLogsPayload,
} from "@techlio/provider-adapters";
import { randomBytes } from "node:crypto";
import { getSecret, setSecret, backend as secretBackend } from "./secret-store.js";
import { claudeOtelConfigured, ensureAgentHooks } from "./agent-hooks.js";
import { config } from "./config.js";
import { PACKAGED_DASHBOARD_ORIGINS, KNOWN_API_BASES } from "./production-hosts.js";
import {
  clearIdentity,
  identityDir,
  loadIdentity,
  publicIdentity,
  saveIdentity,
  type ConnectorIdentity,
} from "./identity.js";
import { claimFromPortal } from "./pairing.js";
import { EncryptedQueue } from "./queue.js";
import { loadOrCreateSigningKey, publicSigningKey } from "./signing.js";
import { sanitizeEvent } from "./redaction.js";
import { uploadBatch } from "./uploader.js";
import { BASE_PORT, PORT_COUNT, choosePort, osUser, recordUserPort } from "./port.js";
import { createGitWatcher } from "./git-watch.js";
import { createServer } from "node:net";
import { uuidFromSeed } from "./os-utils.js";

// Pause is the employee's choice and must survive restarts and reboots.
const STATE_FILE = join(identityDir(), "state.json");
function loadPaused(): boolean {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")).paused === true;
  } catch {
    return false;
  }
}
function savePaused(value: boolean): void {
  try {
    mkdirSync(identityDir(), { recursive: true, mode: 0o700 });
    writeFileSync(STATE_FILE, JSON.stringify({ paused: value, at: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    /* best effort; in-memory state still applies */
  }
}
let paused = loadPaused();
/** Actual host agent — declared by the IDE companion, not hardcoded as Claude. */
let hostProvider = config.provider;
let contextLabel: string | undefined;

function bareUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function isLoopbackApi(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(bareUrl(url));
}

/** Packaged/upgraded installs follow the installer API; local dev pairing is left alone. */
function syncIdentityApiHost(current: ConnectorIdentity | null): ConnectorIdentity | null {
  if (!current) return current;
  const next = bareUrl(config.apiBaseUrl);
  const cur = bareUrl(current.apiBaseUrl);
  if (next === cur) return current;
  const followPackaged = process.env.TECHLIO_PACKAGED === "1" || Boolean(process.env.TECHLIO_API_URL);
  if (!followPackaged) return current;
  if (isLoopbackApi(next) && !process.env.TECHLIO_API_URL) return current;
  const updated = { ...current, apiBaseUrl: next };
  saveIdentity(updated);
  return updated;
}

let identity: ConnectorIdentity | null = syncIdentityApiHost(loadIdentity());
let activeSessionId: string | undefined = identity ? crypto.randomUUID() : undefined;
/** Commits / CI signals when no agent session is active. */
let localWorkflowSessionId: string | undefined;

function workflowSessionId(): string {
  if (activeSessionId) return activeSessionId;
  if (!localWorkflowSessionId) localWorkflowSessionId = crypto.randomUUID();
  return localWorkflowSessionId;
}
let flushing = false;
const modelStartedAt = new Map<string, number>();
const toolStartedAt = new Map<string, number>();

function note(message: string): void {
  const clock = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`${clock}  ${message}`);
}

function asSessionId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }
  return uuidFromSeed(value);
}

function describeEvent(event: ActivityEvent): string {
  const who = event.provider === "claude_code" ? "Claude Code" : event.provider === "cursor" ? "Cursor" : event.provider;
  const where = event.metadata?.path_category ? ` · ${event.metadata.path_category}` : "";
  const file = event.metadata?.file_path ? ` · ${event.metadata.file_path}` : "";
  const tool = event.metadata?.tool_name ? ` · ${event.metadata.tool_name}` : "";
  const seconds = event.duration_ms ? ` · ${Math.max(1, Math.round(event.duration_ms / 1000))}s` : "";
  if (event.event_type === "model_request_started") return `${who} · model request started${where}`;
  if (event.event_type === "model_request_completed") return `${who} · model request finished${seconds}${where}`;
  if (event.event_type === "tool_started") return `${who} · tool started${tool}${where}`;
  if (event.event_type === "tool_completed") return `${who} · tool finished${tool}${seconds}${file}`;
  if (event.event_type === "file_modified" || event.event_type === "file_created" || event.event_type === "file_deleted") {
    return `${who} · ${event.event_type.replace("file_", "file ")}${file}${where}`;
  }
  if (event.event_type === "commit_created") {
    const m = event.metadata ?? {};
    return `commit${where} · ${m.files_changed ?? 0} files +${m.lines_added ?? 0}/-${m.lines_deleted ?? 0}${m.verified ? " · verified" : ""}`;
  }
  if (event.event_type === "commit_pushed") return `commit shipped (pushed)${where}`;
  if (event.event_type === "session_started") return `${who} · session started${where}`;
  if (event.event_type === "session_ended") return `${who} · session ended${where}`;
  if (event.event_type === "session_heartbeat") return `${who} · session still open${where}`;
  return `${who} · ${event.event_type.replaceAll("_", " ")}${where}`;
}

function defaultStatus(
  eventType: ActivityEvent["event_type"],
): ActivityEvent["status"] | undefined {
  if (eventType === "heartbeat_sent") return "succeeded";
  if (eventType.endsWith("_completed")) return "succeeded";
  if (eventType.endsWith("_started")) return "started";
  if (eventType === "connector_paused" || eventType === "session_paused") {
    return "unknown";
  }
  return undefined;
}

const signingKey = loadOrCreateSigningKey(config.signingKeyHex);
mkdirSync(dirname(config.dbPath), { recursive: true });
function queueSecret(): string {
  const existing = getSecret("queue-key");
  if (existing) return existing;
  const fresh = randomBytes(32).toString("hex");
  setSecret("queue-key", fresh);
  return fresh;
}
// "techlio-local-queue" was a shared literal in older builds; it is accepted
// only to read rows queued before this upgrade, never to write new ones.
const queue = new EncryptedQueue(config.dbPath, queueSecret(), ["techlio-local-queue"]);

function apiBase(): string {
  return identity?.apiBaseUrl ?? config.apiBaseUrl;
}

function connectorCtx(provider: string) {
  if (!identity) {
    throw new Error("unpaired");
  }
  return {
    organizationId: identity.organizationId,
    developerId: identity.developerId,
    deviceId: identity.deviceId,
    connectorVersion: config.connectorVersion,
    consentVersion: config.consentVersion,
    provider,
  };
}

function stamp(event: ActivityEvent): ActivityEvent {
  if (!identity) return event;
  return {
    ...event,
    organization_id: identity.organizationId,
    developer_id: identity.developerId,
    device_id: identity.deviceId,
  };
}

/** Connector/coverage events describe the device, not an agent session. */
const DEVICE_LEVEL_EVENTS = new Set<string>([
  "heartbeat_sent",
  "connector_started",
  "connector_stopped",
  "connector_paused",
  "connector_resumed",
  "telemetry_gap_started",
  "telemetry_gap_ended",
  "upload_failed",
  // Commits belong to a repo, not to an agent session.
  "commit_created",
  "commit_pushed",
]);

function baseEvent(
  eventType: ActivityEvent["event_type"],
  extra?: Partial<ActivityEvent>,
): ActivityEvent | null {
  if (!identity) return null;
  const meta = { ...(extra?.metadata ?? {}) };
  if (contextLabel && !meta.path_category) {
    meta.path_category = contextLabel.slice(0, 64);
  }
  return {
    event_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    organization_id: identity.organizationId,
    developer_id: identity.developerId,
    device_id: identity.deviceId,
    provider: hostProvider,
    connector_version: config.connectorVersion,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    consent_version: config.consentVersion,
    // Heartbeats etc. must not inherit the last agent session, or that session
    // appears to last for as long as the laptop stays on.
    session_id: extra?.session_id ?? (DEVICE_LEVEL_EVENTS.has(eventType) ? undefined : activeSessionId),
    status: extra?.status ?? defaultStatus(eventType),
    ...extra,
    metadata: Object.keys(meta).length ? meta : extra?.metadata,
  };
}

let reportedLostRows = 0;

async function flushQueue(): Promise<void> {
  // Pausing stops *collection*, not upload: the coverage-gap and pause events
  // queued at pause time must still reach the server (FR-005). No new agent
  // events are queued while paused.
  if (!identity || flushing) return;
  const pending = queue.peekBatch();
  if (queue.lostRows > reportedLostRows) {
    // Queued events that could not be read are gone; say so instead of
    // letting the interval look like inactivity (FR-019).
    reportedLostRows = queue.lostRows;
    const lost = baseEvent(EventTypes.upload_failed, { status: "failed" });
    if (lost) queue.enqueue([lost]);
  }
  const batch = pending.events.map(stamp);
  if (batch.length === 0) return;
  flushing = true;
  try {
    const result = await uploadBatch(
      apiBase(),
      identity.deviceToken,
      signingKey,
      batch,
    );
    if (result.status === "invalid") {
      // The API can never accept this batch; drop it but make the loss visible.
      queue.acknowledge(pending.rowIds);
      console.error(`dropped ${batch.length} event(s) the API rejected as malformed`);
      const lost = baseEvent(EventTypes.upload_failed, { status: "failed" });
      if (lost) queue.enqueue([lost]);
      return;
    }
    if (result.status === "delivered") {
      if (result.rejected > 0) {
        const kinds = [...new Set(result.reasons.filter((r) => r !== "duplicate" && r !== "replay"))];
        if (kinds.length) console.error(`API rejected ${result.rejected} event(s): ${kinds.join(", ")}`);
      }
      queue.acknowledge(pending.rowIds);
      const agentEvents = batch.filter((event) => event.event_type !== "heartbeat_sent");
      if (agentEvents.length) {
        note(`uploaded ${agentEvents.length} event${agentEvents.length === 1 ? "" : "s"} to the dashboard`);
      }
    }
  } catch {
    // Keep the original queue rows for at-least-once delivery.
  } finally {
    flushing = false;
  }
}

async function postApiHeartbeat(): Promise<void> {
  if (!identity) return;
  const caps = providerCapability(hostProvider);
  try {
    const res = await fetch(`${apiBase()}/v1/connectors/${identity.deviceId}/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${identity.deviceToken}`,
      },
      body: JSON.stringify({
        version: config.connectorVersion,
        queueDepth: queue.depth(),
        paused,
        provider: hostProvider,
        capabilities: {
          hourly: caps?.hourly ?? false,
          missing: caps?.missing ?? [],
          tier: caps?.tier ?? "B",
          ...capabilityReport(),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    // Follow a pause/resume made on the dashboard. A pause the employee set
    // here (tray / local API) is theirs and is never lifted by the dashboard.
    const reply = (await res.json().catch(() => ({}))) as { remotePaused?: boolean };
    if (reply.remotePaused === true && !paused) {
      pauseCollection();
      pausedByDashboard = true;
      note("paused from the dashboard");
    } else if (reply.remotePaused === false && paused && pausedByDashboard) {
      resumeCollection();
      pausedByDashboard = false;
      note("resumed from the dashboard");
    }
  } catch {
    /* API may be down; event queue still retries */
  }
}

function enqueueHeartbeat(): void {
  if (paused || !identity) return;
  const caps = providerCapability(hostProvider);
  const event = baseEvent(EventTypes.heartbeat_sent, {
    metadata: {
      tool_category: "other",
      queue_depth: queue.depth(),
      connector_paused: paused,
      provider_name: caps?.label,
      tier: caps?.tier,
      daily_only: caps ? !caps.hourly : true,
      capabilities_missing: caps?.missing?.slice(0, 8).join(","),
    },
  });
  if (event) queue.enqueue([event]);
  void flushQueue();
  void postApiHeartbeat();
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const DEFAULT_DASHBOARD_ORIGINS = PACKAGED_DASHBOARD_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Dashboards the API this connector reports to vouches for
 * (GET /v1/connectors/config). Cached on disk so a restart while offline still
 * accepts the dashboard, and so moving the website to a new domain needs an
 * API setting instead of reinstalling every connector.
 */
const ORIGINS_FILE = join(identityDir(), "trusted-origins.json");
const ORIGIN_PATTERN = /^https:\/\/[a-z0-9*.-]+(:\d+)?$/i;
let apiTrustedOrigins: string[] = (() => {
  try {
    const list = JSON.parse(readFileSync(ORIGINS_FILE, "utf8")) as unknown;
    return Array.isArray(list) ? list.filter((o): o is string => typeof o === "string" && ORIGIN_PATTERN.test(o)) : [];
  } catch {
    return [];
  }
})();

async function refreshTrustedOrigins(): Promise<void> {
  try {
    const r = await fetch(`${apiBase().replace(/\/+$/, "")}/v1/connectors/config`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return;
    const body = (await r.json()) as { dashboardOrigins?: unknown };
    const list = Array.isArray(body.dashboardOrigins)
      ? body.dashboardOrigins.filter((o): o is string => typeof o === "string" && ORIGIN_PATTERN.test(o)).slice(0, 20)
      : [];
    apiTrustedOrigins = list;
    mkdirSync(identityDir(), { recursive: true, mode: 0o700 });
    writeFileSync(ORIGINS_FILE, JSON.stringify(list), { mode: 0o600 });
  } catch {
    /* offline or an older API: keep the cached list */
  }
}

/** Localhost, TECHLIO_DASHBOARD_ORIGINS / built-in defaults, and dashboards the API vouches for. */
function dashboardOriginAllowed(origin: string): boolean {
  if (LOCAL_ORIGIN.test(origin)) return true;
  const allowed = [
    ...(process.env.TECHLIO_DASHBOARD_ORIGINS ?? DEFAULT_DASHBOARD_ORIGINS.join(",")).split(","),
    ...apiTrustedOrigins,
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.some((pattern) => originMatches(pattern, origin));
}

/** Exact origin, or a pattern where `*` stands for one or more host characters. */
function originMatches(pattern: string, origin: string): boolean {
  if (!pattern.includes("*")) return pattern === origin;
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]+");
  return new RegExp(`^${expression}$`).test(origin);
}

const app = Fastify({ logger: false });
// Windows PowerShell (the tray) POSTs with an empty form-encoded body; Fastify
// would answer 415 and Pause/Stop silently did nothing. Accept it as {}.
app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, _body, done) => done(null, {}));

// Commit → Verified → Shipped for repos the agents work in (see git-watch.ts).
const gitWatch = createGitWatcher({
  stateDir: identityDir(),
  isActive: () => Boolean(identity) && !paused,
  warn: (message) => note(`⚠ ${message}`),
  emit: (signal) => {
    const event = baseEvent(signal.type as ActivityEvent["event_type"], {
      event_id: signal.eventId,
      occurred_at: signal.occurredAt,
      status: "succeeded",
      metadata: {
        commit_ref: signal.ref,
        path_category: signal.repo,
        tool_name: "git",
        telemetry_source: "connector",
        ...(signal.type === "commit_created"
          ? {
              files_changed: signal.filesChanged ?? 0,
              lines_added: signal.linesAdded ?? 0,
              lines_deleted: signal.linesDeleted ?? 0,
              verified: signal.verified ?? false,
            }
          : {}),
      },
    });
    const clean = event ? sanitizeEvent(event) : null;
    if (!clean) return;
    queue.enqueue([clean]);
    note(describeEvent(clean));
    void flushQueue();
  },
});

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

app.addHook("onRequest", async (req, reply) => {
  // DNS-rebinding guard: only loopback Host headers reach this API.
  if (!LOOPBACK_HOST.test(String(req.headers.host ?? ""))) {
    return reply.code(403).send({ error: "host_not_allowed" });
  }
  const origin = req.headers.origin;
  // CSRF guard: a browser always sends Origin on cross-site requests, so any
  // request from a website that is not the Techlio dashboard is refused —
  // including "simple" form POSTs that skip CORS preflight. Local tools (the
  // hook runner, the IDE companion) send no Origin and are unaffected.
  if (typeof origin === "string" && !dashboardOriginAllowed(origin)) {
    return reply.code(403).send({ error: "origin_not_allowed" });
  }
  if (typeof origin === "string" && dashboardOriginAllowed(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    // Chrome blocks a public HTTPS page from calling 127.0.0.1 without this.
    reply.header("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

app.get("/health", async () => {
  const caps = providerCapability(hostProvider);
  return {
    paused,
    queueDepth: queue.depth(),
    lostQueueRows: queue.lostRows,
    credentialStore: secretBackend(),
    version: config.connectorVersion,
    provider: hostProvider,
    // Which OS user this connector serves, so a second user on the same
    // computer never adopts it (see port.ts).
    osUser: osUser(),
    port: config.port,
    ...publicIdentity(identity),
    capabilities: {
      hourly: caps?.hourly ?? false,
      otlp: hostProvider === "claude_code",
      hooks: hostProvider !== "vscode",
      companion: hostProvider === "cursor" || hostProvider === "vscode" || hostProvider === "windsurf",
      missing: caps?.missing ?? [],
      emptyState: caps?.emptyState ?? "",
    },
  };
});

app.get("/identity", async () => publicIdentity(identity));

/**
 * The API the device token is sent to. A page may only point the connector at
 * a different API in local development (both page and API on localhost);
 * otherwise a local web page could redirect credentials and activity elsewhere.
 */
function trustedApiBase(requested: string | undefined, origin: string | string[] | undefined): string {
  const bare = (url: string) => url.replace(/\/+$/, "");
  if (!requested || bare(requested) === bare(config.apiBaseUrl)) return config.apiBaseUrl;
  if (KNOWN_API_BASES.includes(bare(requested))) return bare(requested);
  // A dashboard the current API vouches for (see refreshTrustedOrigins) may
  // name its own API — how a deployment moves hosts without reinstalling.
  if (
    typeof origin === "string" &&
    /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(bare(requested)) &&
    apiTrustedOrigins.some((pattern) => originMatches(pattern, origin))
  ) {
    return bare(requested);
  }
  const local = (url: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.replace(/\/$/, ""));
  if (typeof origin === "string" && local(origin) && local(requested)) return requested;
  throw new Error("api_not_allowed");
}

app.post("/claim", async (req, reply) => {
  const body = (req.body ?? {}) as {
    accessToken?: string;
    deviceId?: string;
    deviceToken?: string;
    displayName?: string;
    apiBaseUrl?: string;
    consentAccepted?: boolean;
  };
  if (!body.accessToken) {
    return reply.code(400).send({ error: "access_token_required" });
  }
  if (!body.deviceId || !body.deviceToken) {
    return reply.code(400).send({ error: "admin_issued_keys_required" });
  }
  if (body.consentAccepted !== true) {
    return reply.code(400).send({ error: "collection_notice_required" });
  }
  try {
    identity = await claimFromPortal({
      accessToken: body.accessToken,
      deviceId: body.deviceId,
      deviceToken: body.deviceToken,
      publicKey: await publicSigningKey(signingKey),
      displayName: body.displayName,
      apiBaseUrl: trustedApiBase(body.apiBaseUrl, req.headers.origin),
      consentAccepted: true,
      consentVersion: config.consentVersion,
    });
    activeSessionId = crypto.randomUUID();
    queue.clear();
    if (identity.provider) hostProvider = identity.provider;
    enqueueHeartbeat();
    void refreshTrustedOrigins();
    return publicIdentity(identity);
  } catch (err) {
    const message = err instanceof Error ? err.message : "claim_failed";
    const code =
      message === "not_signed_in"
        ? 401
        : message === "invalid_connector_key" || message === "not_your_key"
          ? 403
          : message === "admin_issued_keys_required" || message === "api_not_allowed"
            ? 400
            : 502;
    return reply.code(code).send({ error: message });
  }
});

app.post("/unpair", async () => {
  clearIdentity();
  identity = null;
  activeSessionId = undefined;
  queue.clear();
  return { paired: false as const };
});

/** IDE companion declares the real host (Cursor, VS Code, …). */
app.post("/host", async (req) => {
  const body = req.body as { provider?: string; appName?: string };
  hostProvider =
    body.provider ??
    providerFromHostApp(body.appName) ??
    hostProvider;
  enqueueHeartbeat();
  return { provider: hostProvider, ...publicIdentity(identity) };
});

function enqueueCoverageGap(reason: "paused" | "offline"): void {
  const started = baseEvent(EventTypes.telemetry_gap_started, {
    metadata: { gap_reason: reason, connector_paused: reason === "paused" },
  });
  const pausedEv = baseEvent(EventTypes.connector_paused, {
    metadata: { connector_paused: true, queue_depth: queue.depth() },
  });
  const batch = [started, pausedEv].filter((e): e is ActivityEvent => e !== null);
  if (batch.length) queue.enqueue(batch);
  void flushQueue();
}

/** True while collection is paused because the dashboard asked (not the employee). */
let pausedByDashboard = false;

function pauseCollection(): void {
  paused = true;
  savePaused(true);
  enqueueCoverageGap("paused");
}

function resumeCollection(): void {
  paused = false;
  savePaused(false);
  const resumed = baseEvent(EventTypes.connector_resumed, {
    metadata: { connector_paused: false },
  });
  const ended = baseEvent(EventTypes.telemetry_gap_ended, {
    metadata: { gap_reason: "paused" },
  });
  const batch = [resumed, ended].filter((e): e is ActivityEvent => e !== null);
  if (batch.length) queue.enqueue(batch);
  void flushQueue();
}

app.post("/pause", async () => {
  pauseCollection();
  pausedByDashboard = false;
  void postApiHeartbeat();
  return { paused: true };
});

app.post("/resume", async () => {
  resumeCollection();
  pausedByDashboard = false;
  void postApiHeartbeat();
  return { paused: false };
});

// ---------------------------------------------------------------------------
// Stop — the employee turns the connector off from the tray / menu bar. The
// stop is recorded as a coverage gap (never as idle time), queued events are
// flushed, and the process exits 0 so launchd / the Windows supervisor /
// systemd leave it stopped until the employee starts it or signs in again.
// ---------------------------------------------------------------------------
const STOPPED_MARKER = join(identityDir(), "stopped-at");

app.post("/stop", async (req, reply) => {
  // Only local apps (tray, menu bar) may stop collection; websites cannot.
  if (req.headers.origin) return reply.code(403).send({ error: "origin_not_allowed" });
  const gap = baseEvent(EventTypes.telemetry_gap_started, { metadata: { gap_reason: "stopped" } });
  const stopped = baseEvent(EventTypes.connector_stopped, { metadata: { queue_depth: queue.depth() } });
  const batch = [gap, stopped].filter((e): e is ActivityEvent => e !== null);
  if (batch.length) queue.enqueue(batch);
  await Promise.race([flushQueue(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  writeFileSync(STOPPED_MARKER, new Date().toISOString(), { mode: 0o600 });
  console.log("Stopped by the employee from the tray / menu bar.");
  setTimeout(() => process.exit(0), 250);
  return { stopping: true };
});

/** Started again after an employee stop: close the recorded gap. */
function closeStoppedGap(): void {
  if (!existsSync(STOPPED_MARKER)) return;
  const started = baseEvent(EventTypes.connector_started, {});
  const ended = baseEvent(EventTypes.telemetry_gap_ended, { metadata: { gap_reason: "stopped" } });
  const batch = [started, ended].filter((e): e is ActivityEvent => e !== null);
  if (batch.length) queue.enqueue(batch);
  try {
    unlinkSync(STOPPED_MARKER);
  } catch {
    /* already removed */
  }
  void flushQueue();
}

app.post("/hooks/extension", async (req) => {
  if (paused) return { accepted: 0, unpaired: !identity };
  if (!identity) return { accepted: 0, unpaired: true };
  const body = req.body as Record<string, unknown>;
  if (typeof body.appName === "string" || typeof body.provider === "string") {
    hostProvider =
      (typeof body.provider === "string" ? body.provider : undefined) ??
      providerFromHostApp(
        typeof body.appName === "string" ? body.appName : undefined,
      );
  }
  const eventType = String(body.event_type ?? "file_modified");
  // The IDE companion sees a person's editor, not the AI agent: saves, typing,
  // task runs and editor sessions are the person's own work and must never be
  // reported as AI activity. Agent file edits come from the agents' hooks
  // (Claude Code Write/Edit, Cursor afterFileEdit). The companion only names
  // the workspace / task the person is working in.
  const allowed = new Set<string>([EventTypes.task_context_changed]);
  if (!allowed.has(eventType)) {
    return { accepted: 0 };
  }

  if (typeof body.session_id === "string") {
    activeSessionId = body.session_id;
  }
  const workspaceLabel =
    typeof body.workspace === "string"
      ? body.workspace.slice(0, 64)
      : typeof body.label === "string"
        ? body.label.slice(0, 64)
        : undefined;
  // Only task_context_changed passes the allowlist above.
  if (workspaceLabel) contextLabel = workspaceLabel;

  const caps = providerCapability(hostProvider);
  const event = baseEvent(EventTypes.task_context_changed, {
    provider: hostProvider,
    session_id: activeSessionId,
    status: "succeeded",
    metadata: {
      provider_name: caps?.label,
      tier: caps?.tier,
      daily_only: caps ? !caps.hourly : true,
      ...(workspaceLabel ? { path_category: workspaceLabel } : {}),
      ...(typeof body.file_path === "string"
        ? { file_path: String(body.file_path).slice(0, 512) }
        : {}),
    },
  });
  const clean = event ? sanitizeEvent(event) : null;
  if (clean) {
    queue.enqueue([clean]);
    void flushQueue();
    note(describeEvent(clean));
    return { accepted: 1, provider: hostProvider };
  }
  return { accepted: 0 };
});

function measuredDuration(
  kind: "model" | "tool",
  provider: string,
  sessionId: string | undefined,
  toolName: string | undefined,
  callId?: string,
): number | undefined {
  const map = kind === "model" ? modelStartedAt : toolStartedAt;
  if (callId) {
    const started = map.get(`call:${callId}`);
    map.delete(`call:${callId}`);
    if (started) return Math.max(1, Date.now() - started);
  }
  const specific = `${provider}:${sessionId ?? "default"}:${kind === "tool" ? toolName ?? "tool" : "model"}`;
  const fallback = `${provider}:default:${kind === "tool" ? toolName ?? "tool" : "model"}`;
  const started = map.get(specific) ?? map.get(fallback);
  map.delete(specific);
  map.delete(fallback);
  if (!started) return undefined;
  return Math.max(1, Date.now() - started);
}

function rememberStart(
  kind: "model" | "tool",
  provider: string,
  sessionId: string | undefined,
  toolName: string | undefined,
  callId?: string,
): void {
  // Parallel calls of the same tool each have their own id; never overwrite one with another.
  if (callId) {
    (kind === "model" ? modelStartedAt : toolStartedAt).set(`call:${callId}`, Date.now());
    return;
  }
  const key = `${provider}:${sessionId ?? "default"}:${kind === "tool" ? toolName ?? "tool" : "model"}`;
  (kind === "model" ? modelStartedAt : toolStartedAt).set(key, Date.now());
}

// ---------------------------------------------------------------------------
// FR-012 — what each provider on this machine can actually supply, reported
// with every heartbeat and persisted server-side. Derived from what has been
// observed, not only from the static catalog.
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const providerSeen = new Map<string, { lastEventAt: number; sources: Set<string> }>();
/** Claude sessions whose model calls arrive over OpenTelemetry. */
const otelSessions = new Map<string, number>();
let claudeOtelSeenAt = 0;

function noteProvider(provider: string, source: string): void {
  const entry = providerSeen.get(provider) ?? { lastEventAt: 0, sources: new Set<string>() };
  entry.lastEventAt = Date.now();
  entry.sources.add(source);
  providerSeen.set(provider, entry);
}

function capabilityReport() {
  for (const [id, at] of otelSessions) if (Date.now() - at > DAY_MS) otelSessions.delete(id);
  const providers: Record<string, { missing: string[]; sources: string[]; lastEventAt: string | null; tier: string; hourly: boolean }> = {};
  const ids = new Set<string>([hostProvider, ...providerSeen.keys()]);
  for (const id of ids) {
    const caps = providerCapability(id);
    if (!caps) continue;
    const seen = providerSeen.get(id);
    let missing = [...caps.missing];
    // With OpenTelemetry flowing, Claude Code reports tokens and per-call timing.
    if (id === "claude_code" && Date.now() - claudeOtelSeenAt < DAY_MS) {
      missing = missing.filter((m) => m !== "token_totals" && m !== "model_call_timing");
    }
    providers[id] = {
      missing,
      sources: seen ? [...seen.sources] : [],
      lastEventAt: seen ? new Date(seen.lastEventAt).toISOString() : null,
      tier: caps.tier,
      hourly: caps.hourly,
    };
  }
  return { reportedAt: new Date().toISOString(), claudeOtelConfigured: claudeOtelConfigured(), providers };
}

const recentAgentEvents = new Map<string, number>();
// Cross-provider echo suppression. Cursor also runs the Claude-format hooks with
// a full Claude environment, so one Cursor action arrives as both a Cursor event
// and a Claude event that is impossible to tell apart at the hook. When Cursor
// reports an action, we drop a matching Claude event that lands nearby. Real
// Claude Code (Cursor not running) produces no Cursor event, so it is kept.
const CROSS_ECHO_MS = 3_000;
const CLAUDE_HOLD_MS = 500;
const recentCursorAction = new Map<string, number>();
const pendingClaude = new Map<string, ReturnType<typeof setTimeout>>();

function actionKey(event: ActivityEvent): string {
  return `${event.event_type}:${event.metadata?.tool_name ?? ""}:${event.metadata?.file_path ?? ""}`;
}

function emitAgentEvent(event: ActivityEvent): void {
  if (event.metadata?.path_category) contextLabel = event.metadata.path_category;
  if (event.session_id) activeSessionId = event.session_id;
  queue.enqueue([event]);
  note(describeEvent(event));
  void flushQueue();
}

function routeAgentEvent(event: ActivityEvent): boolean {
  const key = actionKey(event);
  if (event.provider === "cursor") {
    recentCursorAction.set(key, Date.now());
    const pending = pendingClaude.get(key);
    if (pending) {
      clearTimeout(pending);
      pendingClaude.delete(key);
    }
    emitAgentEvent(event);
    return true;
  }
  if (event.provider === "claude_code") {
    const seen = recentCursorAction.get(key) ?? 0;
    if (Date.now() - seen < CROSS_ECHO_MS) return false; // Cursor already reported this
    if (pendingClaude.has(key)) return false;
    const timer = setTimeout(() => {
      pendingClaude.delete(key);
      const echoed = recentCursorAction.get(key) ?? 0;
      if (Date.now() - echoed < CROSS_ECHO_MS) return; // Cursor reported during the hold
      emitAgentEvent(event);
    }, CLAUDE_HOLD_MS);
    if (typeof timer.unref === "function") timer.unref();
    pendingClaude.set(key, timer);
    return true;
  }
  emitAgentEvent(event);
  return true;
}

function acceptAgentHook(payload: ClaudeHookPayload, fallbackProvider: string) {
  if (paused || !identity) return { accepted: 0, unpaired: !identity };
  // Any tool in the provider catalogue (Claude Code, Cursor, Antigravity,
  // Windsurf, Copilot, Gemini CLI, Codex CLI, Devin CLI, …).
  const provider = isKnownProvider(payload.provider) ? payload.provider : fallbackProvider;
  const sessionId = asSessionId(payload.session_id ?? payload.conversation_id);
  if (payload.hook_event_name === "model_request_started" || payload.hook_event_name === "UserPromptSubmit" || payload.hook_event_name === "beforeSubmitPrompt" || payload.hook_event_name === "PreInvocation") {
    rememberStart("model", provider, sessionId, undefined);
  }
  if (payload.hook_event_name === "tool_started" || payload.hook_event_name === "PreToolUse" || payload.hook_event_name === "preToolUse") {
    rememberStart("tool", provider, sessionId, payload.tool_name ?? payload.tool, payload.tool_use_id);
  }
  const events = claudeHookToEvents(
    { ...payload, session_id: sessionId, provider },
    connectorCtx(provider),
  ).map((event) => {
    if (event.duration_ms || (event.event_type !== "model_request_completed" && event.event_type !== "tool_completed")) {
      return event;
    }
    const duration = measuredDuration(
      event.event_type === "model_request_completed" ? "model" : "tool",
      provider,
      sessionId,
      event.metadata?.tool_name,
      event.event_type === "tool_completed" ? payload.tool_use_id : undefined,
    );
    return duration ? { ...event, duration_ms: duration } : event;
  });
  gitWatch.observe(payload.cwd).catch(() => undefined); // a failed state write must not crash the service
  let clean = events
    .map(sanitizeEvent)
    .filter((event): event is NonNullable<typeof event> => event !== null);
  // When Claude Code's OpenTelemetry is flowing, real per-call model events
  // come from /v1/logs. The hook's prompt→stop "turn" would double count, so
  // it is dropped. Before the first OTel batch of a session arrives, a Stop is
  // held briefly and dropped if OTel reports that session meanwhile.
  if (provider === "claude_code") {
    const otelLive = Date.now() - claudeOtelSeenAt < DAY_MS;
    clean = clean.filter((event) => {
      if (event.event_type !== "model_request_started" && event.event_type !== "model_request_completed") return true;
      if (otelLive || (event.session_id && otelSessions.has(event.session_id))) return false;
      if (event.event_type === "model_request_completed" && claudeOtelConfigured()) {
        const held = event;
        const timer = setTimeout(() => {
          if (held.session_id && otelSessions.has(held.session_id)) return;
          if (Date.now() - claudeOtelSeenAt < DAY_MS) return;
          emitAgentEvent(held);
        }, 8_000);
        timer.unref?.();
        return false;
      }
      return true;
    });
  }
  const firstSighting = clean.some((event) => !providerSeen.has(event.provider));
  for (const event of clean) noteProvider(event.provider, "hook");
  if (firstSighting) void postApiHeartbeat();
  if (!clean.length) return { accepted: 0, provider };
  // A passing agent-run test or build marks the repo as verified for the next commit.
  if (
    clean.some(
      (e) =>
        e.event_type === "tool_completed" &&
        e.status !== "failed" &&
        (e.metadata?.tool_category === "test" || e.metadata?.tool_category === "build"),
    )
  ) {
    gitWatch.markCheck(payload.cwd).catch(() => undefined); // a failed state write must not crash the service
  }
  const fresh = clean.filter((event) => {
    // Same-provider repeat guard (e.g. native + Claude-format both under Cursor).
    const key = `${event.provider}:${event.session_id ?? ""}:${payload.tool_use_id ?? ""}:${actionKey(event)}`;
    const seen = recentAgentEvents.get(key) ?? 0;
    if (Date.now() - seen < 2_500) return false;
    recentAgentEvents.set(key, Date.now());
    return true;
  });
  if (!fresh.length) return { accepted: 0, provider, duplicate: true };
  let accepted = 0;
  for (const event of fresh) {
    if (routeAgentEvent(event)) accepted += 1;
  }
  return { accepted, provider };
}

app.post("/hooks/agent", async (req) => {
  return acceptAgentHook((req.body ?? {}) as ClaudeHookPayload, "claude_code");
});

/**
 * Local repo CI gate (husky pre-commit, etc.). Emits test_completed with
 * allowlisted metadata only — no command output or commit messages.
 */
app.post("/hooks/ci-gate", async (req) => {
  if (paused || !identity) return { accepted: 0, unpaired: !identity };
  const body = (req.body ?? {}) as { status?: string; cwd?: string };
  if (body.status === "failed") return { accepted: 0 };
  gitWatch.markCheck(typeof body.cwd === "string" ? body.cwd : undefined).catch(() => undefined); // a failed state write must not crash the service
  const event = baseEvent(EventTypes.test_completed, {
    session_id: workflowSessionId(),
    status: "succeeded",
    metadata: {
      tool_name: "ci_gate",
      tool_category: "test",
      telemetry_source: "connector",
    },
  });
  const clean = event ? sanitizeEvent(event) : null;
  if (!clean) return { accepted: 0 };
  emitAgentEvent(clean);
  return { accepted: 1 };
});

/**
 * Local git post-commit hook: scan that repo now. The commit is reported by
 * the git watcher (counts only — no hash, message, or code), exactly once.
 */
app.post("/hooks/git-commit", async (req) => {
  if (paused || !identity) return { accepted: 0, unpaired: !identity };
  const body = (req.body ?? {}) as { cwd?: string };
  await gitWatch.scanNow(typeof body.cwd === "string" ? body.cwd : undefined);
  return { accepted: 1 };
});

app.post("/hooks/claude", async (req) => {
  const body = (req.body ?? {}) as ClaudeHookPayload;
  return acceptAgentHook({ ...body, provider: "claude_code" }, "claude_code");
});

const rejectUnavailableOtlp = async (
  _request: FastifyRequest,
  reply: FastifyReply,
) =>
  reply.code(501).send({
    error: "otlp_adapter_not_enabled",
    message:
      "This connector build does not normalize OTLP payloads. No telemetry was accepted.",
  });

app.post("/v1/traces", rejectUnavailableOtlp);
app.post("/v1/metrics", rejectUnavailableOtlp);

/**
 * Claude Code OpenTelemetry logs (OTLP/HTTP JSON). Only api_request/api_error
 * are kept — model id, per-call duration, token counts. Prompt and response
 * events are ignored by the adapter. Paused or unpaired: accepted and dropped,
 * so Claude does not retry, and nothing is collected.
 */
app.post("/v1/logs", async (req, reply) => {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.includes("json")) {
    return reply.code(415).send({
      error: "otlp_json_only",
      message: "Set OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/json for Claude Code.",
    });
  }
  if (paused || !identity) return { partialSuccess: {} };
  const mapped = claudeOtlpLogsToEvents((req.body ?? {}) as OtlpLogsPayload, connectorCtx("claude_code"));
  // First OTel data in a day changes what Claude Code can report — tell the
  // API now instead of waiting for the next 30s heartbeat (FR-012).
  const capabilityChanged = mapped.length > 0 && Date.now() - claudeOtelSeenAt >= DAY_MS;
  for (const { sessionKey, event } of mapped) {
    const sessionId = asSessionId(sessionKey);
    const withSession = sessionId ? { ...event, session_id: sessionId } : event;
    const clean = sanitizeEvent(withSession);
    if (!clean) continue;
    claudeOtelSeenAt = Date.now();
    if (sessionId) otelSessions.set(sessionId, Date.now());
    noteProvider("claude_code", "otel");
    emitAgentEvent(clean);
  }
  if (capabilityChanged) void postApiHeartbeat();
  return { partialSuccess: {} };
});

/** Dedupe windows are seconds long; older entries can never match again. */
function pruneStaleEntries(map: Map<string, number>, maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, at] of map) if (at < cutoff) map.delete(key);
}

setInterval(() => {
  void flushQueue();
  // These maps gained an entry per hook event and were never pruned.
  pruneStaleEntries(recentAgentEvents, 60_000);
  pruneStaleEntries(recentCursorAction, 60_000);
  // Calls that never reported completion (agent crashed, hook lost).
  pruneStaleEntries(modelStartedAt, 3_600_000);
  pruneStaleEntries(toolStartedAt, 3_600_000);
}, 15_000);

setInterval(() => {
  enqueueHeartbeat();
}, 30_000);

/** True when nothing is listening on 127.0.0.1:port. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

void (async () => {
  const port = await choosePort({
    preferred: config.port,
    me: osUser(),
    isFree: portFree,
    ownerOf: async (candidate) => {
      try {
        const r = await fetch(`http://127.0.0.1:${candidate}/health`, { signal: AbortSignal.timeout(1_500) });
        const body = (await r.json()) as { version?: string; osUser?: string };
        if (!body.version) return undefined;
        return body.osUser ?? null;
      } catch {
        return undefined;
      }
    },
  });
  config.port = port;
  if (!process.env.CONNECTOR_PORT) recordUserPort(port);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() => {
      if (identity) {
        app.log.info(
          { developerId: identity.developerId, displayName: identity.displayName },
          "Connector paired",
        );
        setTimeout(() => enqueueHeartbeat(), 3_000);
      } else {
        app.log.info(
          "Connector unpaired — developer can add tools from My connectors in the portal",
        );
      }
      console.log(`Techlio connector is running at http://127.0.0.1:${port} for ${osUser()}`);
      closeStoppedGap();
      gitWatch.start();
      void refreshTrustedOrigins();
      setInterval(() => void refreshTrustedOrigins(), 30 * 60_000).unref?.();
      const hooks = ensureAgentHooks();
      console.log("Dashboard pings are hidden. Agent events print below as they happen.");
      if (hooks.claude) console.log("Claude Code hooks are installed. Restart Claude Code if it is already open.");
      if (hooks.cursor) console.log("Cursor agent hooks are installed. Cursor reloads them automatically.");
      if (hooks.antigravity) console.log("Antigravity hooks are installed (~/.gemini/config/hooks.json).");
      if (hooks.windsurf) console.log("Windsurf (Devin Desktop) Cascade hooks are installed (~/.codeium/windsurf/hooks.json).");
      if (hooks.copilot) console.log("GitHub Copilot agent hooks are installed (~/.copilot/hooks) for Copilot CLI and VS Code agent mode.");
      if (hooks.gemini) console.log("Gemini CLI hooks are installed (~/.gemini/settings.json).");
      if (hooks.codex) console.log("Codex CLI hooks are installed (~/.codex/hooks.json). Run /hooks in Codex once to trust them.");
      if (hooks.claude) console.log("Devin CLI reads the Claude Code hooks, so Devin CLI sessions are reported too.");
      if (claudeOtelConfigured()) console.log("Claude Code telemetry is routed here for token totals (prompts stay redacted).");
      console.log("The Claude website chat is not Claude Code, so that chat stays off this log until it runs in Claude Code.");
    })
    .catch(async (err: NodeJS.ErrnoException) => {
      if (err?.code === "EADDRINUSE") {
        // Another process owns the port. If it is a Techlio connector, this copy
        // is a duplicate (e.g. launched manually while the service runs) and
        // exits cleanly; exit code 0 tells launchd/systemd not to respawn it.
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health`);
          const body = (await r.json()) as { version?: string; osUser?: string };
          // Same user's connector (e.g. `pnpm dev` while the service runs): a duplicate.
          if (body.version && (!body.osUser || body.osUser === osUser())) {
            if (process.argv.includes("--service")) {
              // Another copy (e.g. `pnpm dev`) holds the port. The service must
              // take over when it stops, so exit non-zero after a pause and let
              // launchd / Task Scheduler / systemd start it again.
              console.log(`Another Techlio connector owns 127.0.0.1:${port}; retrying in 30s.`);
              setTimeout(() => process.exit(75), 30_000); // EX_TEMPFAIL
              return;
            }
            console.log(`Techlio connector is already running on 127.0.0.1:${port}. Nothing to do.`);
            process.exit(0);
          }
        } catch {
          /* not ours */
        }
        console.error(`Port ${port} is used by another program and no free port was found in ${BASE_PORT}–${BASE_PORT + PORT_COUNT - 1}.`);
        process.exit(78); // EX_CONFIG: do not respawn
      }
      console.error(err);
      process.exit(1);
    });
})();
