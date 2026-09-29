import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeHookPayload } from "./hook-payload.js";

/**
 * Downloadable connector: start the agent immediately, then keep it running
 * at sign-in. Developers never need the git repo or pnpm.
 *
 * Two extra modes let the same executable act as the IDE hook runner, so the
 * download works even when Node.js is not installed:
 *   <exe> --hook <provider> [event]    read a hook payload on stdin and report it
 *   <exe> --service                    run in the background without re-installing
 *   <exe> --status                     print local connector health
 *   <exe> --uninstall [--purge]        remove the service and hooks (and credentials with --purge)
 */
async function runHook(): Promise<void> {
  const at = process.argv.indexOf("--hook");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    raw = {};
  }
  // The installer passes the tool (and, where stdin lacks it, the event name).
  const body = normalizeHookPayload(raw, process.argv[at + 1], process.argv[at + 2], process.env);
  if (body) {
    try {
      // This OS user's own connector (port recorded per user; see port.ts).
      const { userPort } = await import("./port.js");
      await fetch(`http://127.0.0.1:${userPort()}/hooks/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* connector may be starting up; the next event will report */
    }
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
async function superviseWorker(): Promise<void> {
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
    if (code === 0) {
      // Exit 0 = stopped on purpose (tray "Stop connector"). Stay stopped until
      // the employee starts it again or signs in again.
      console.log("Connector stopped by the employee; not restarting.");
      process.exit(0);
    }
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
  if (process.argv.includes("--tray")) {
    // Windows notification-area icon (macOS uses the Swift menu-bar app).
    const { runWindowsTray } = await import("./windows-tray.js");
    await runWindowsTray();
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
