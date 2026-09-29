import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { normalizeHookPayload } from "./hook-payload.js";
import { userPort } from "./port.js";

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
/** This user's connector endpoint (the port can differ per OS user; see port.ts). */
function otlpLogsEndpoint(): string {
  return `http://127.0.0.1:${userPort()}/v1/logs`;
}
/** Any endpoint a Techlio connector wrote, on any port in its range. */
const TECHLIO_OTLP = /^http:\/\/127\.0\.0\.1:94(7[7-9]|8[0-6])\/v1\/logs$/;
function claudeOtelEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: "http/json",
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: otlpLogsEndpoint(),
    OTEL_LOG_USER_PROMPTS: "0",
    OTEL_LOG_ASSISTANT_RESPONSES: "0",
    OTEL_LOG_TOOL_DETAILS: "0",
  };
}

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

/**
 * Standalone hook script for unpackaged (node) installs. Its normaliser is the
 * same function the packaged binary runs, written out verbatim, so every
 * install mode reports identical, allowlisted fields.
 */
function hookSource(): string {
  return `#!/usr/bin/env node
// Written by the Techlio connector. Forwards allowlisted hook fields only.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const normalizeHookPayload = ${normalizeHookPayload.toString()};
let port = 9477;
try { const p = Number(readFileSync(join(homedir(), ".techlio-connector", "port"), "utf8").trim()); if (p > 0) port = p; } catch {}
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let raw = {};
  try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { raw = {}; }
  const body = normalizeHookPayload(raw, process.argv[2], process.argv[3], process.env);
  if (!body) { process.stdout.write("{}\\n"); return; }
  fetch("http://127.0.0.1:" + port + "/hooks/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined).finally(() => process.stdout.write("{}\\n"));
});
`;
}

/** A packaged bun/pkg executable runs itself with --hook; dev uses node + script. */
function isPackaged(): boolean {
  if (process.env.TECHLIO_PACKAGED === "1") return true;
  const exec = process.execPath.toLowerCase();
  return !exec.includes("node") && !exec.includes("tsx");
}

type HookProvider = "claude_code" | "cursor" | "antigravity" | "windsurf" | "github_copilot" | "gemini" | "codex";

function commandFor(scriptPath: string, provider: HookProvider, eventName?: string): string {
  const suffix = eventName ? ` ${eventName}` : "";
  if (isPackaged()) {
    return `"${process.execPath}" --hook ${provider}${suffix}`;
  }
  const node = process.execPath.includes("node") ? process.execPath : "node";
  return `"${node}" "${scriptPath}" ${provider}${suffix}`;
}

/** The same command for tools that run hooks through PowerShell on Windows. */
function powershellFor(scriptPath: string, provider: HookProvider, eventName?: string): string {
  return `& ${commandFor(scriptPath, provider, eventName)}`;
}

/** True when a CLI is on PATH (a hook file is only written for tools that are installed). */
function onPath(cmd: string): boolean {
  const probe = spawnSync(platform() === "win32" ? "where" : "which", [cmd], { stdio: "ignore" });
  return probe.status === 0;
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
    /--hook (claude_code|cursor|antigravity|windsurf|github_copilot|gemini|codex)\b/.test(text)
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
  writeFileSync(dest, hookSource());
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
  if (endpoint && !TECHLIO_OTLP.test(endpoint)) return current;
  return { ...current, ...claudeOtelEnv() };
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
    env?.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT === otlpLogsEndpoint() &&
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

/** Windsurf / Devin Desktop Cascade hooks (docs.devin.ai/desktop/cascade/hooks). */
const WINDSURF_EVENTS = [
  "pre_user_prompt",
  "post_cascade_response",
  "pre_read_code",
  "post_read_code",
  "pre_write_code",
  "post_write_code",
  "pre_run_command",
  "post_run_command",
  "pre_mcp_tool_use",
  "post_mcp_tool_use",
] as const;

function windsurfHooksPath(): string {
  return join(homedir(), ".codeium", "windsurf", "hooks.json");
}

/** Installs only when Windsurf is present (~/.codeium/windsurf exists). */
function installWindsurf(scriptPath: string): boolean {
  if (!existsSync(join(homedir(), ".codeium", "windsurf"))) return false;
  const path = windsurfHooksPath();
  const settings = readJson(path);
  const hooks = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
  const entry = {
    command: commandFor(scriptPath, "windsurf"),
    powershell: powershellFor(scriptPath, "windsurf"),
    show_output: false,
  };
  for (const eventName of WINDSURF_EVENTS) {
    const existing = Array.isArray(hooks[eventName]) ? (hooks[eventName] as unknown[]) : [];
    hooks[eventName] = [...existing.filter((e) => !isTechlioHook(e)), entry];
  }
  settings.hooks = hooks;
  writeJson(path, settings);
  return true;
}

/**
 * GitHub Copilot agent hooks. Copilot CLI and VS Code agent mode both load
 * ~/.copilot/hooks/*.json; the PascalCase event names are the format both read.
 * The event is passed as an argument because Copilot CLI does not name it on stdin.
 */
const COPILOT_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
] as const;

function copilotHooksPath(): string {
  return join(homedir(), ".copilot", "hooks", "techlio-connector.json");
}

function installCopilot(scriptPath: string): boolean {
  const path = copilotHooksPath();
  mkdirSync(dirname(path), { recursive: true });
  const hooks: Record<string, unknown> = {};
  for (const eventName of COPILOT_EVENTS) {
    hooks[eventName] = [
      {
        type: "command",
        command: commandFor(scriptPath, "github_copilot", eventName),
        powershell: powershellFor(scriptPath, "github_copilot", eventName),
        timeout: 10,
        timeoutSec: 10,
      },
    ];
  }
  // Our own file: rewritten whole on every start, removed on uninstall.
  writeJson(path, { version: 1, hooks });
  return true;
}

/** Gemini CLI hooks live in ~/.gemini/settings.json (Antigravity uses ~/.gemini/config/hooks.json). */
const GEMINI_TOOL_EVENTS = ["BeforeTool", "AfterTool"] as const;
const GEMINI_PLAIN_EVENTS = ["SessionStart", "SessionEnd", "BeforeModel", "AfterModel"] as const;

function geminiSettingsPath(): string {
  return join(homedir(), ".gemini", "settings.json");
}

function installGemini(scriptPath: string): boolean {
  if (!existsSync(geminiSettingsPath()) && !onPath("gemini")) return false;
  const path = geminiSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  const settings = readJson(path);
  const hooks = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
  const hook = { type: "command", name: "techlio-connector", command: commandFor(scriptPath, "gemini"), timeout: 5000 };
  for (const eventName of [...GEMINI_TOOL_EVENTS, ...GEMINI_PLAIN_EVENTS]) {
    const existing = Array.isArray(hooks[eventName]) ? (hooks[eventName] as unknown[]) : [];
    const group = (GEMINI_TOOL_EVENTS as readonly string[]).includes(eventName)
      ? { matcher: ".*", hooks: [hook] }
      : { hooks: [hook] };
    hooks[eventName] = [...existing.filter((e) => !isTechlioHook(e)), group];
  }
  settings.hooks = hooks;
  writeJson(path, settings);
  return true;
}

/** Codex CLI hooks (~/.codex/hooks.json). Codex asks the user to trust a new hook once via /hooks. */
const CODEX_EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] as const;

function codexHooksPath(): string {
  return join(homedir(), ".codex", "hooks.json");
}

function installCodex(scriptPath: string): boolean {
  if (!existsSync(join(homedir(), ".codex")) && !onPath("codex")) return false;
  const path = codexHooksPath();
  mkdirSync(dirname(path), { recursive: true });
  const settings = readJson(path);
  const hooks = (settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}) as Record<string, unknown>;
  const command = commandFor(scriptPath, "codex");
  for (const eventName of CODEX_EVENTS) {
    const existing = Array.isArray(hooks[eventName]) ? (hooks[eventName] as unknown[]) : [];
    const group = eventName.includes("ToolUse")
      ? { matcher: ".*", hooks: [{ type: "command", command }] }
      : { hooks: [{ type: "command", command }] };
    hooks[eventName] = [...existing.filter((e) => !isTechlioHook(e)), group];
  }
  settings.hooks = hooks;
  writeJson(path, settings);
  return true;
}

export interface AgentHookStatus {
  claude: boolean;
  cursor: boolean;
  antigravity: boolean;
  windsurf: boolean;
  copilot: boolean;
  gemini: boolean;
  codex: boolean;
}

/**
 * Points every supported AI agent on this computer at the local connector:
 * Claude Code (also read by Devin CLI), Cursor, Antigravity, Windsurf,
 * GitHub Copilot, Gemini CLI and Codex CLI. The user's own settings are kept;
 * a tool whose config cannot be read is skipped, never overwritten.
 */
export function ensureAgentHooks(): AgentHookStatus {
  const scriptPath = isPackaged() ? process.execPath : installScript();
  const attempt = (install: () => boolean | void): boolean => {
    try {
      return install() !== false;
    } catch {
      return false;
    }
  };
  return {
    claude: attempt(() => installClaude(scriptPath)),
    cursor: attempt(() => installCursor(scriptPath)),
    antigravity: attempt(() => installAntigravity(scriptPath)),
    windsurf: attempt(() => installWindsurf(scriptPath)),
    copilot: attempt(() => installCopilot(scriptPath)),
    gemini: attempt(() => installGemini(scriptPath)),
    codex: attempt(() => installCodex(scriptPath)),
  };
}

/** Remove every hook this connector installed; user hooks are kept. */
export function removeAgentHooks(): void {
  for (const path of [
    join(homedir(), ".claude", "settings.json"),
    join(homedir(), ".cursor", "hooks.json"),
    windsurfHooksPath(),
    geminiSettingsPath(),
    codexHooksPath(),
  ]) {
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
    if (TECHLIO_OTLP.test(env?.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? "")) {
      for (const key of Object.keys(claudeOtelEnv())) delete env![key];
      settings.env = env;
    }
    writeJson(path, settings);
  }
  try {
    if (existsSync(copilotHooksPath())) unlinkSync(copilotHooksPath());
  } catch {
    /* already gone */
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
