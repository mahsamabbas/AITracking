import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { removeAgentHooks } from "./agent-hooks.js";
import { deleteSecret } from "./secret-store.js";

/**
 * Registers the connector as a per-user background service so it starts at
 * sign-in, restarts after a crash, and runs as a single instance:
 *
 *   macOS   — LaunchAgent (~/Library/LaunchAgents/com.techlio.connector.plist),
 *             bootstrapped immediately, KeepAlive only on abnormal exit
 *   Windows — Task Scheduler task at logon with restart-on-failure, started now
 *   Linux   — systemd user unit, enabled and started now
 *
 * The installer process hands off to the service and exits; it never keeps a
 * second copy running in the foreground.
 */
const LABEL = "com.techlio.connector";
const WIN_TASK = "TechlioConnector";
const LINUX_UNIT = "techlio-connector.service";
const PORT = Number(process.env.CONNECTOR_PORT ?? 9477);

// Defaults baked into the packaged build; overridable at install time.
const API_URL = process.env.TECHLIO_API_URL ?? "https://tracking-app-api-three.vercel.app";
const DASHBOARD = process.env.TECHLIO_DASHBOARD_ORIGINS ?? "https://tracking-app-api-t9yd.vercel.app";
const VSIX_URL = `${DASHBOARD.split(",")[0]}/downloads/techlio-companion.vsix`;

export function installDir(): string {
  return join(homedir(), ".techlio", "connector");
}

function dataDir(): string {
  return join(homedir(), ".techlio-connector");
}

function exeName(): string {
  return platform() === "win32" ? "techlio-connector.exe" : "techlio-connector";
}

function writeEnv(dir: string): void {
  const envPath = join(dir, ".env");
  if (existsSync(envPath)) return;
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  writeFileSync(
    envPath,
    [
      `TECHLIO_API_URL=${API_URL}`,
      `TECHLIO_DASHBOARD_ORIGINS=${DASHBOARD}`,
      `CONNECTOR_PORT=${PORT}`,
      `CONNECTOR_DB=${join(dataDir(), "queue.db")}`,
      "",
    ].join(platform() === "win32" ? "\r\n" : "\n"),
    { mode: 0o600 },
  );
}

// ---------------------------------------------------------------- macOS ---

function macPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function macDomain(): string {
  return `gui/${process.getuid?.() ?? 501}`;
}

function registerMac(dest: string): boolean {
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  writeFileSync(
    macPlistPath(),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${dest}</string><string>--service</string></array>
  <key>WorkingDirectory</key><string>${installDir()}</string>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash; a clean exit (duplicate instance) is not respawned. -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${join(dataDir(), "connector.log")}</string>
  <key>StandardErrorPath</key><string>${join(dataDir(), "connector.err.log")}</string>
</dict></plist>
`,
  );
  spawnSync("launchctl", ["bootout", `${macDomain()}/${LABEL}`], { stdio: "ignore" });
  const boot = spawnSync("launchctl", ["bootstrap", macDomain(), macPlistPath()], { stdio: "ignore" });
  spawnSync("launchctl", ["enable", `${macDomain()}/${LABEL}`], { stdio: "ignore" });
  spawnSync("launchctl", ["kickstart", "-k", `${macDomain()}/${LABEL}`], { stdio: "ignore" });
  return boot.status === 0;
}

function unregisterMac(): void {
  spawnSync("launchctl", ["bootout", `${macDomain()}/${LABEL}`], { stdio: "ignore" });
  if (existsSync(macPlistPath())) unlinkSync(macPlistPath());
}

// -------------------------------------------------------------- Windows ---

function registerWindows(dest: string): boolean {
  // conhost --headless (Windows 10 1903+) keeps the console window hidden.
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Techlio AI activity connector</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
    <Hidden>true</Hidden>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>conhost.exe</Command>
      <Arguments>--headless "${dest}" --service</Arguments>
      <WorkingDirectory>${installDir()}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
  const xmlPath = join(tmpdir(), "techlio-connector-task.xml");
  // Task Scheduler requires UTF-16 LE with BOM for XML definitions.
  writeFileSync(xmlPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]));
  try {
    execFileSync("schtasks", ["/Create", "/TN", WIN_TASK, "/XML", xmlPath, "/F"], { stdio: "ignore" });
    execFileSync("schtasks", ["/Run", "/TN", WIN_TASK], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(xmlPath, { force: true });
  }
}

function unregisterWindows(): void {
  spawnSync("schtasks", ["/End", "/TN", WIN_TASK], { stdio: "ignore" });
  spawnSync("schtasks", ["/Delete", "/TN", WIN_TASK, "/F"], { stdio: "ignore" });
}

// ---------------------------------------------------------------- Linux ---

function linuxUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", LINUX_UNIT);
}

function registerLinux(dest: string): boolean {
  mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
  writeFileSync(
    linuxUnitPath(),
    `[Unit]
Description=Techlio AI activity connector
After=network-online.target

[Service]
ExecStart=${dest} --service
WorkingDirectory=${installDir()}
Restart=on-failure
RestartSec=10
# 78 = port owned by another program; do not crash-loop on it.
RestartPreventExitStatus=78

[Install]
WantedBy=default.target
`,
  );
  const reload = spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  const enable = spawnSync("systemctl", ["--user", "enable", "--now", LINUX_UNIT], { stdio: "ignore" });
  return reload.status === 0 && enable.status === 0;
}

function unregisterLinux(): void {
  spawnSync("systemctl", ["--user", "disable", "--now", LINUX_UNIT], { stdio: "ignore" });
  if (existsSync(linuxUnitPath())) unlinkSync(linuxUnitPath());
  spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
}

// ------------------------------------------------------------ companions ---

function which(cmd: string): boolean {
  const probe = platform() === "win32" ? "where" : "which";
  return spawnSync(probe, [cmd], { stdio: "ignore" }).status === 0;
}

function connectIdes(): void {
  const file = join(installDir(), "techlio-companion.vsix");
  try {
    execFileSync(platform() === "win32" ? "curl.exe" : "curl", ["-fsSL", VSIX_URL, "-o", file], {
      stdio: "ignore",
    });
  } catch {
    return; // companion is optional
  }
  if (!existsSync(file)) return;
  for (const cmd of ["cursor", "code"]) {
    if (!which(cmd)) continue;
    const result = spawnSync(cmd, ["--install-extension", file, "--force"], { stdio: "ignore" });
    if (result.status === 0) console.log(`Connected ${cmd}. Restart that app if it is already open.`);
  }
}

// ---------------------------------------------------------------- public ---

async function waitForHealth(timeoutMs = 15_000): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

/**
 * Installs and starts the background service. Returns true when the service
 * is confirmed running (the caller should then exit), false when the platform
 * could not register a service (the caller runs in the foreground instead).
 */
export async function installBackgroundService(): Promise<boolean> {
  const dir = installDir();
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, exeName());
  try {
    if (process.execPath !== dest) copyFileSync(process.execPath, dest);
    if (platform() !== "win32") chmodSync(dest, 0o755);
  } catch {
    /* already running from the installed copy, or file in use during update */
  }
  writeEnv(dir);

  console.log("Installing the Techlio connector as a background service…");
  const os = platform();
  const registered =
    os === "darwin" ? registerMac(dest) : os === "win32" ? registerWindows(dest) : registerLinux(dest);
  connectIdes();

  if (!registered) {
    console.log("Could not register a background service on this system; running in this window instead.");
    return false;
  }
  const health = await waitForHealth();
  if (health) {
    console.log(`Techlio connector is running (v${health.version}). It will start automatically when you sign in.`);
    console.log(health.paired ? "This computer is paired." : "Next: open the Techlio dashboard → My connectors → Activate.");
    return true;
  }
  console.log("The service was registered but has not answered yet. Check the log in ~/.techlio-connector/.");
  return true;
}

export function uninstallBackgroundService(options: { purgeData?: boolean } = {}): void {
  const os = platform();
  if (os === "darwin") unregisterMac();
  else if (os === "win32") unregisterWindows();
  else unregisterLinux();
  removeAgentHooks();
  if (options.purgeData) {
    for (const name of ["device-token", "signing-key", "queue-key"]) deleteSecret(name);
    rmSync(dataDir(), { recursive: true, force: true });
  }
  rmSync(installDir(), { recursive: true, force: true });
  console.log(
    options.purgeData
      ? "Techlio connector removed, including its credentials and queued events."
      : "Techlio connector service removed. Credentials and unsent events were kept; use --uninstall --purge to remove them.",
  );
}

export async function printStatus(): Promise<void> {
  const health = await waitForHealth(2_000);
  if (!health) {
    console.log("Techlio connector is not running.");
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(health, null, 2));
}
