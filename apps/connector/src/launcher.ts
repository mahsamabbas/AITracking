import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Downloadable connector: start the agent immediately, then keep it running
 * at sign-in. Developers never need the git repo or pnpm.
 *
 * Two extra modes let the same executable act as the IDE hook runner, so the
 * download works even when Node.js is not installed:
 *   <exe> --hook [fallbackProvider]   read a hook payload on stdin and report it
 *   <exe> --service                    run in the background without re-installing
 *   <exe> --status                     print local connector health
 *   <exe> --uninstall [--purge]        remove the service and hooks (and credentials with --purge)
 */
function detectProvider(fallback: string): string {
  // Only Antigravity reads ~/.gemini/config/hooks.json, so its explicit
  // argument is trusted even when launched from a Claude Code terminal.
  if (fallback === "antigravity") return "antigravity";
  // Cursor markers win first — Cursor also runs Claude-format hooks, and real
  // Claude Code never sets CURSOR_* — so Cursor work is never seen as Claude.
  if (
    process.env.CURSOR_AGENT ||
    process.env.CURSOR_CONVERSATION_ID ||
    process.env.CURSOR_TRACE_ID ||
    process.env.CURSOR_REQUEST_ID
  ) {
    return "cursor";
  }
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude_code";
  return fallback;
}

async function runHook(): Promise<void> {
  const fallback = process.argv[process.argv.indexOf("--hook") + 1] || "claude_code";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    raw = {};
  }
  const roots = Array.isArray(raw.workspace_roots)
    ? (raw.workspace_roots as unknown[])
    : Array.isArray(raw.workspacePaths)
      ? (raw.workspacePaths as unknown[])
      : [];
  // Antigravity: only toolCall.name is read; toolCall.args never leaves here.
  const toolCall =
    raw.toolCall && typeof raw.toolCall === "object" ? (raw.toolCall as Record<string, unknown>) : {};
  // Antigravity does not name the event on stdin; the installer passes it after the provider.
  const argEvent = process.argv[process.argv.indexOf("--hook") + 2];
  const cwd =
    typeof raw.cwd === "string"
      ? raw.cwd
      : typeof roots[0] === "string"
        ? (roots[0] as string)
        : undefined;
  const body = {
    provider: detectProvider(
      fallback === "cursor" || fallback === "claude_code" || fallback === "antigravity" ? fallback : "claude_code",
    ),
    hook_event_name: raw.hook_event_name ?? argEvent,
    session_id:
      (raw.session_id as string) ||
      (raw.conversation_id as string) ||
      (raw.conversationId as string) ||
      (raw.generation_id as string) ||
      process.env.CURSOR_CONVERSATION_ID,
    tool_name: (raw.tool_name as string) || (raw.tool as string) || (toolCall.name as string),
    cwd,
    file_path: typeof raw.file_path === "string" ? raw.file_path : undefined,
    model: (raw.model as string) || (raw.model_name as string) || (raw.modelName as string),
    status: raw.status ?? (typeof raw.error === "string" && raw.error ? "failed" : undefined),
  };
  try {
    await fetch("http://127.0.0.1:9477/hooks/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* connector may be starting up; the next event will report */
  }
  process.stdout.write("{}\n");
}

/**
 * A background service has no terminal (and on Windows no valid stdout at
 * all), so its console output goes to ~/.techlio-connector/connector.log,
 * rotated once at 5 MB.
 */
function logToFile(path: string): void {
  const MAX_BYTES = 5 * 1024 * 1024;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    if (statSync(path).size > MAX_BYTES) renameSync(path, `${path}.1`);
  } catch {
    /* no log yet */
  }
  const write = (level: string, args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.stack ?? a.message : JSON.stringify(a))).join(" ");
    try {
      appendFileSync(path, `${new Date().toISOString()} ${level} ${line}\n`, { mode: 0o600 });
    } catch {
      /* disk full or permissions: never crash the service over logging */
    }
  };
  console.log = (...args: unknown[]) => write("info ", args);
  console.info = console.log;
  console.warn = (...args: unknown[]) => write("warn ", args);
  console.error = (...args: unknown[]) => write("error", args);
}

/**
 * Windows service loop: run the connector as a hidden child and start it again
 * 10 s after any exit (crash, or port held by another connector — exit 75).
 * Ends only when the task is stopped or the process is killed on uninstall.
 */
async function superviseWorker(): Promise<never> {
  const { spawn } = await import("node:child_process");
  for (;;) {
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, ["--service", "--worker"], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("exit", (exitCode) => resolve(exitCode));
      child.on("error", () => resolve(null));
    });
    console.log(`Connector worker exited (code ${code}); restarting in 10s.`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--hook")) {
    await runHook();
    return;
  }
  process.env.TECHLIO_PACKAGED = "1";
  const service = await import("./install-service.js");
  if (process.argv.includes("--uninstall")) {
    service.uninstallBackgroundService({ purgeData: process.argv.includes("--purge") });
    return;
  }
  if (process.argv.includes("--status")) {
    await service.printStatus();
    return;
  }
  if (process.argv.includes("--service") && process.platform === "win32" && !process.argv.includes("--worker")) {
    // Task Scheduler's RestartOnFailure only covers a task that fails to
    // launch, not a process that exits or crashes later (the Run-key fallback
    // has no restart at all). So on Windows the service supervises itself.
    if (!process.stdout.isTTY) logToFile(service.logPath());
    await superviseWorker();
    return;
  }
  if (!process.argv.includes("--service")) {
    // Install, hand off to the OS service manager, and exit. The connector
    // never stays open as a foreground program.
    await service.installBackgroundService();
    return;
  }
  if (!process.stdout.isTTY) logToFile(service.logPath());
  await import("./index.js");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
