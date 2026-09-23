import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "report-hook.mjs";
const CLAUDE_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
] as const;
/** Google Antigravity hook events (antigravity.google/docs/hooks). */
const ANTIGRAVITY_TOOL_EVENTS = ["PreToolUse", "PostToolUse"] as const;
const ANTIGRAVITY_PLAIN_EVENTS = ["PreInvocation", "PostInvocation", "Stop"] as const;
const ANTIGRAVITY_HOOK_NAME = "techlio-connector";

/**
 * Claude Code OpenTelemetry → this connector, for token totals and per-call
 * model timing. Prompts and responses stay redacted (explicitly forced off).
 */
const OTLP_LOGS_ENDPOINT = `http://127.0.0.1:${Number(process.env.CONNECTOR_PORT ?? 9477)}/v1/logs`;
const CLAUDE_OTEL_ENV: Record<string, string> = {
  CLAUDE_CODE_ENABLE_TELEMETRY: "1",
  OTEL_LOGS_EXPORTER: "otlp",
  OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "http/json",
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: OTLP_LOGS_ENDPOINT,
  OTEL_LOG_USER_PROMPTS: "0",
  OTEL_LOG_ASSISTANT_RESPONSES: "0",
  OTEL_LOG_TOOL_DETAILS: "0",
};

const CURSOR_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "afterFileEdit",
  "stop",
] as const;

function installDir(): string {
  return join(homedir(), ".techlio", "connector");
}

const HOOK_SOURCE = `#!/usr/bin/env node
const fallback = process.argv[2] || "claude_code";
function detectProvider() {
  if (fallback === "antigravity") return "antigravity"; // only Antigravity reads ~/.gemini hooks
  if (process.env.CURSOR_AGENT || process.env.CURSOR_CONVERSATION_ID || process.env.CURSOR_TRACE_ID || process.env.CURSOR_REQUEST_ID) return "cursor";
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude_code";
  return fallback;
}
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let raw = {};
  try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { raw = {}; }
  const roots = Array.isArray(raw.workspace_roots) ? raw.workspace_roots : Array.isArray(raw.workspacePaths) ? raw.workspacePaths : [];
  // Antigravity: only toolCall.name is read; toolCall.args (commands, file
  // content) never leaves this process.
  const toolCall = raw.toolCall && typeof raw.toolCall === "object" ? raw.toolCall : {};
  const cwd = typeof raw.cwd === "string" ? raw.cwd : typeof roots[0] === "string" ? roots[0] : undefined;
  const body = {
    provider: detectProvider(),
    // Antigravity does not name the event on stdin; the installer passes it as argv[3].
    hook_event_name: raw.hook_event_name || process.argv[3],
    session_id: raw.session_id || raw.conversation_id ||
      raw.conversationId || raw.generation_id || process.env.CURSOR_CONVERSATION_ID,
    tool_name: raw.tool_name || raw.tool || toolCall.name,
    tool_use_id: raw.tool_use_id || raw.toolUseId || toolCall.id,
    cwd,
    file_path: typeof raw.file_path === "string" ? raw.file_path : undefined,
    model: raw.model || raw.model_name || raw.modelName,
    status: raw.status || (typeof raw.error === "string" && raw.error ? "failed" : undefined),
  };
  fetch("http://127.0.0.1:9477/hooks/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined).finally(() => process.stdout.write("{}\\n"));
});
`;

/** A packaged bun/pkg executable runs itself with --hook; dev uses node + script. */
function isPackaged(): boolean {
  if (process.env.TECHLIO_PACKAGED === "1") return true;
  const exec = process.execPath.toLowerCase();
  return !exec.includes("node") && !exec.includes("tsx");
}

function bundledScript(): string | undefined {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), "../hook/report-hook.mjs");
  } catch {
    return undefined;
  }
}

function commandFor(
  scriptPath: string,
  provider: "claude_code" | "cursor" | "antigravity",
  eventName?: string,
): string {
  const suffix = eventName ? ` ${eventName}` : "";
  if (isPackaged()) {
    return `"${process.execPath}" --hook ${provider}${suffix}`;
  }
  const node = process.execPath.includes("node") ? process.execPath : "node";
  return `"${node}" "${scriptPath}" ${provider}${suffix}`;
}

/**
 * True only for hook entries this connector wrote (script or packaged form).
 * Matching a bare "--hook" would also delete unrelated user hooks such as
 * "husky --hook pre-commit".
 */
function isTechlioHook(entry: unknown): boolean {
  const text = JSON.stringify(entry);
  return (
    text.includes(SCRIPT_NAME) ||
    text.includes("techlio-connector") ||
    /--hook (claude_code|cursor|antigravity)\b/.test(text)
  );
}

/**
 * Reads a user's tool config. A file that exists but does not parse (e.g. a
 * trailing comma the user typed) throws, so the caller skips it instead of
 * replacing the user's settings with ours.
 */
function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown; // throws on invalid JSON
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object; left unchanged`);
  }
  return parsed as Record<string, unknown>;
}

/** Write via a temp file + rename so a crash mid-write never truncates the user's config. */
function writeJson(path: string, value: unknown): void {
  const tmp = `${path}.techlio-${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

function installScript(): string {
  const dir = installDir();
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, SCRIPT_NAME);
  const source = bundledScript();
  if (source && existsSync(source)) copyFileSync(source, dest);
  else writeFileSync(dest, HOOK_SOURCE);
  chmodSync(dest, 0o755);
  return dest;
}

function installClaude(scriptPath: string): void {
  const path = join(homedir(), ".claude", "settings.json");
  mkdirSync(dirname(path), { recursive: true });
  const settings = readJson(path);
  const hooks = (settings.hooks && typeof settings.hooks === "object"
    ? settings.hooks
    : {}) as Record<string, unknown>;
  const command = commandFor(scriptPath, "claude_code");
  for (const eventName of CLAUDE_EVENTS) {
    const existing = Array.isArray(hooks[eventName]) ? (hooks[eventName] as unknown[]) : [];
    // Replace (never append) our entry, so restarts and path changes cannot
    // register the reporter twice and double-count every agent action.
    hooks[eventName] = [
      ...existing.filter((entry) => !isTechlioHook(entry)),
      { matcher: ".*", hooks: [{ type: "command", command }] },
    ];
  }
  settings.hooks = hooks;
  settings.env = withClaudeOtel(settings.env);
  writeJson(path, settings);
}

/**
 * Adds our OTLP settings unless the user or their organisation already sends
 * Claude Code telemetry somewhere else — we never hijack an existing pipeline.
 */
function withClaudeOtel(env: unknown): Record<string, string> {
  const current = (env && typeof env === "object" ? env : {}) as Record<string, string>;
  const endpoint = current.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? current.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint && endpoint !== OTLP_LOGS_ENDPOINT) return current;
  return { ...current, ...CLAUDE_OTEL_ENV };
}

/** True when Claude Code is configured to export telemetry to this connector. */
export function claudeOtelConfigured(): boolean {
  let env: Record<string, string> | undefined;
  try {
    env = readJson(join(homedir(), ".claude", "settings.json")).env as Record<string, string> | undefined;
  } catch {
    return false;
  }
  return (
    env?.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT === OTLP_LOGS_ENDPOINT &&
    env?.CLAUDE_CODE_ENABLE_TELEMETRY === "1"
  );
}

function antigravityHooksPath(): string {
  return join(homedir(), ".gemini", "config", "hooks.json");
}

/** Installs only when Antigravity is present (~/.gemini exists). */
function installAntigravity(scriptPath: string): boolean {
  if (!existsSync(join(homedir(), ".gemini"))) return false;
  const path = antigravityHooksPath();
  mkdirSync(dirname(path), { recursive: true });
  const config = readJson(path);
  const entry: Record<string, unknown> = { enabled: true };
  for (const eventName of ANTIGRAVITY_TOOL_EVENTS) {
    const command = { type: "command", command: commandFor(scriptPath, "antigravity", eventName), timeout: 5 };
    entry[eventName] = [{ matcher: ".*", hooks: [command] }];
  }
  for (const eventName of ANTIGRAVITY_PLAIN_EVENTS) {
    entry[eventName] = [{ type: "command", command: commandFor(scriptPath, "antigravity", eventName), timeout: 5 }];
  }
  // One named entry, replaced on every start — never duplicated.
  config[ANTIGRAVITY_HOOK_NAME] = entry;
  writeJson(path, config);
  return true;
}

function installCursor(scriptPath: string): void {
  const path = join(homedir(), ".cursor", "hooks.json");
  mkdirSync(dirname(path), { recursive: true });
  const settings = readJson(path);
  const hooks = (settings.hooks && typeof settings.hooks === "object"
    ? settings.hooks
    : {}) as Record<string, unknown>;
  const command = commandFor(scriptPath, "cursor");
  for (const eventName of CURSOR_EVENTS) {
    const existing = Array.isArray(hooks[eventName]) ? (hooks[eventName] as unknown[]) : [];
    hooks[eventName] = [...existing.filter((entry) => !isTechlioHook(entry)), { command }];
  }
  settings.version = 1;
  settings.hooks = hooks;
  writeJson(path, settings);
}

/** Point Claude Code, Cursor, and Antigravity at the local connector. Existing settings are kept. */
export function ensureAgentHooks(): { claude: boolean; cursor: boolean; antigravity: boolean } {
  const scriptPath = isPackaged() ? process.execPath : installScript();
  let claude = false;
  let cursor = false;
  try {
    installClaude(scriptPath);
    claude = true;
  } catch {
    claude = false;
  }
  try {
    installCursor(scriptPath);
    cursor = true;
  } catch {
    cursor = false;
  }
  let antigravity = false;
  try {
    antigravity = installAntigravity(scriptPath);
  } catch {
    antigravity = false;
  }
  return { claude, cursor, antigravity };
}

/** Remove every hook this connector installed; user hooks are kept. */
export function removeAgentHooks(): void {
  for (const path of [join(homedir(), ".claude", "settings.json"), join(homedir(), ".cursor", "hooks.json")]) {
    if (!existsSync(path)) continue;
    let settings: Record<string, unknown>;
    try {
      settings = readJson(path);
    } catch {
      continue; // unreadable: leave the user's file exactly as it is
    }
    const hooks = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
    for (const [name, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter((entry) => !isTechlioHook(entry));
      if (kept.length) hooks[name] = kept;
      else delete hooks[name];
    }
    settings.hooks = hooks;
    // Remove our OTel settings only if they still point at this connector.
    const env = settings.env as Record<string, string> | undefined;
    if (env?.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT === OTLP_LOGS_ENDPOINT) {
      for (const key of Object.keys(CLAUDE_OTEL_ENV)) delete env[key];
      settings.env = env;
    }
    writeJson(path, settings);
  }
  const ag = antigravityHooksPath();
  if (existsSync(ag)) {
    try {
      const config = readJson(ag);
      delete config[ANTIGRAVITY_HOOK_NAME];
      writeJson(ag, config);
    } catch {
      /* unreadable: leave it */
    }
  }
}
