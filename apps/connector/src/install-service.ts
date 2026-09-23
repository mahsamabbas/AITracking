import { execFileSync, spawn, spawnSync, type SpawnSyncOptions } from "node:child_process";
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
 * sign-in, restarts after a crash, and runs as a single instance. It never has
 * a window, Dock icon, or taskbar button:
 *
 *   macOS   — LaunchAgent. The .pkg installer puts it in /Library/LaunchAgents
 *             (every user, see scripts/pack-connector.mjs); running the bare
 *             executable registers ~/Library/LaunchAgents instead.
 *   Windows — hidden Task Scheduler task at logon with restart-on-failure; the
 *             executable is built for the GUI subsystem, so no console opens.
 *             Falls back to the HKCU Run key when Task Scheduler is blocked.
 *             Listed in Settings → Apps for uninstall.
 *   Linux   — systemd user unit, enabled and started now
 *
 * It is a per-user agent rather than a machine service on purpose: the AI
 * tools it observes, their hook configs, and the credential store (Keychain,
 * DPAPI CurrentUser) all belong to the signed-in user.
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

/** Paths written by the macOS .pkg installer (pack-connector.mjs). */
export const MAC_SYSTEM_DIR = "/Library/Application Support/Techlio/Connector";
export const MAC_SYSTEM_PLIST = `/Library/LaunchAgents/${LABEL}.plist`;

// Every child process is hidden: on Windows a console program started from
// the GUI-subsystem connector would otherwise flash a window.
const QUIET: SpawnSyncOptions = { stdio: "ignore", windowsHide: true };

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function installDir(): string {
  return join(homedir(), ".techlio", "connector");
}

function dataDir(): string {
  return join(homedir(), ".techlio-connector");
}

export function logPath(): string {
  return join(dataDir(), "connector.log");
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

function macLoaded(): boolean {
  return spawnSync("launchctl", ["print", `${macDomain()}/${LABEL}`], QUIET).status === 0;
}

function registerMac(dest: string): boolean {
  if (existsSync(MAC_SYSTEM_PLIST)) {
    // Installed by the .pkg for every user; a second per-user copy would
    // fight it for the label and the port.
    if (existsSync(macPlistPath())) unlinkSync(macPlistPath());
    if (!macLoaded()) spawnSync("launchctl", ["bootstrap", macDomain(), MAC_SYSTEM_PLIST], QUIET);
    spawnSync("launchctl", ["kickstart", `${macDomain()}/${LABEL}`], QUIET);
    return macLoaded();
  }
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
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>StandardErrorPath</key><string>${join(dataDir(), "connector.err.log")}</string>
</dict></plist>
`,
  );
  spawnSync("launchctl", ["bootout", `${macDomain()}/${LABEL}`], QUIET);
  // bootout is asynchronous; bootstrapping too soon fails with
  // "Bootstrap failed: 5: Input/output error". Wait for the old job to go, then retry.
  for (let i = 0; i < 20 && macLoaded(); i++) sleepMs(250);
  for (let attempt = 0; attempt < 4 && !macLoaded(); attempt++) {
    spawnSync("launchctl", ["bootstrap", macDomain(), macPlistPath()], QUIET);
    if (!macLoaded()) sleepMs(1_000);
  }
  spawnSync("launchctl", ["enable", `${macDomain()}/${LABEL}`], QUIET);
  spawnSync("launchctl", ["kickstart", `${macDomain()}/${LABEL}`], QUIET);
  return macLoaded();
}

function unregisterMac(): void {
  spawnSync("launchctl", ["bootout", `${macDomain()}/${LABEL}`], QUIET);
  if (existsSync(macPlistPath())) unlinkSync(macPlistPath());
  if (existsSync(MAC_SYSTEM_PLIST) && process.env.TECHLIO_SYSTEM_UNINSTALL !== "1") {
    console.log(
      `Stopped for this user. To remove it for every user, run:\n  sudo "${MAC_SYSTEM_DIR}/uninstall.sh"`,
    );
  }
}

// -------------------------------------------------------------- Windows ---

const WIN_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WIN_UNINSTALL_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${WIN_TASK}`;

function reg(args: string[]): boolean {
  return spawnSync("reg", args, QUIET).status === 0;
}

/** Settings → Apps → Installed apps entry, so IT and employees can remove it normally. */
function registerWindowsUninstall(dest: string): void {
  const values: Array<[string, string, string]> = [
    ["DisplayName", "REG_SZ", "Techlio Connector"],
    ["DisplayVersion", "REG_SZ", "0.1.0"],
    ["Publisher", "REG_SZ", "Techlio"],
    ["DisplayIcon", "REG_SZ", dest],
    ["InstallLocation", "REG_SZ", installDir()],
    ["UninstallString", "REG_SZ", `"${dest}" --uninstall`],
    ["QuietUninstallString", "REG_SZ", `"${dest}" --uninstall`],
    ["NoModify", "REG_DWORD", "1"],
    ["NoRepair", "REG_DWORD", "1"],
  ];
  for (const [name, type, data] of values) reg(["add", WIN_UNINSTALL_KEY, "/v", name, "/t", type, "/d", data, "/f"]);
}

function registerWindows(dest: string): boolean {
  registerWindowsUninstall(dest);
  // The executable is GUI-subsystem (bun --windows-hide-console), so the task
  // runs it directly with no console window.
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
      <Command>${dest}</Command>
      <Arguments>--service</Arguments>
      <WorkingDirectory>${installDir()}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
  const xmlPath = join(tmpdir(), "techlio-connector-task.xml");
  // Task Scheduler requires UTF-16 LE with BOM for XML definitions.
  writeFileSync(xmlPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]));
  try {
    execFileSync("schtasks", ["/Create", "/TN", WIN_TASK, "/XML", xmlPath, "/F"], QUIET);
    execFileSync("schtasks", ["/Run", "/TN", WIN_TASK], QUIET);
    reg(["delete", WIN_RUN_KEY, "/v", WIN_TASK, "/f"]);
    return true;
  } catch {
    // Some managed PCs block Task Scheduler for standard users. Start at
    // sign-in from the Run key instead and launch it now, detached.
    if (!reg(["add", WIN_RUN_KEY, "/v", WIN_TASK, "/t", "REG_SZ", "/d", `"${dest}" --service`, "/f"])) return false;
    startDetached(dest);
    return true;
  } finally {
    rmSync(xmlPath, { force: true });
  }
}

function unregisterWindows(): void {
  spawnSync("schtasks", ["/End", "/TN", WIN_TASK], QUIET);
  spawnSync("schtasks", ["/Delete", "/TN", WIN_TASK, "/F"], QUIET);
  reg(["delete", WIN_RUN_KEY, "/v", WIN_TASK, "/f"]);
  reg(["delete", WIN_UNINSTALL_KEY, "/f"]);
  // A Run-key copy is not owned by Task Scheduler; stop it by image name.
  spawnSync("taskkill", ["/F", "/IM", exeName()], QUIET);
}

/** Last resort: run the service for this session, detached and windowless. */
function startDetached(dest: string): void {
  const child = spawn(dest, ["--service"], {
    cwd: installDir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
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
  const reload = spawnSync("systemctl", ["--user", "daemon-reload"], QUIET);
  const enable = spawnSync("systemctl", ["--user", "enable", "--now", LINUX_UNIT], QUIET);
  return reload.status === 0 && enable.status === 0;
}

function unregisterLinux(): void {
  spawnSync("systemctl", ["--user", "disable", "--now", LINUX_UNIT], QUIET);
  if (existsSync(linuxUnitPath())) unlinkSync(linuxUnitPath());
  spawnSync("systemctl", ["--user", "daemon-reload"], QUIET);
}

// ------------------------------------------------------------ companions ---

function which(cmd: string): boolean {
  const probe = platform() === "win32" ? "where" : "which";
  return spawnSync(probe, [cmd], QUIET).status === 0;
}

function connectIdes(): void {
  const file = join(installDir(), "techlio-companion.vsix");
  try {
    execFileSync(platform() === "win32" ? "curl.exe" : "curl", ["-fsSL", VSIX_URL, "-o", file], QUIET);
  } catch {
    return; // companion is optional
  }
  if (!existsSync(file)) return;
  for (const cmd of ["cursor", "code"]) {
    if (!which(cmd)) continue;
    // On Windows both CLIs are .cmd shims, which only run through a shell.
    const result = spawnSync(cmd, ["--install-extension", file, "--force"], {
      ...QUIET,
      shell: platform() === "win32",
    });
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
 * Tells the person what happened. Double-clicked from Finder/Explorer there is
 * no terminal, so a native dialog is shown instead of console text.
 */
function announce(message: string, isError = false): void {
  if (isError) console.error(message);
  else console.log(message);
  if (process.stdout.isTTY || process.env.TECHLIO_SILENT_INSTALL === "1") return;
  const os = platform();
  if (os === "darwin") {
    const icon = isError ? "caution" : "note";
    spawnSync(
      "osascript",
      [
        "-e",
        `display dialog ${JSON.stringify(message)} buttons {"OK"} default button 1 with title "Techlio Connector" with icon ${icon}`,
      ],
      QUIET,
    );
  } else if (os === "win32") {
    // Single-quoted PowerShell literal: only ' needs escaping; newlines are joined explicitly.
    const text = message
      .split("\n")
      .map((line) => `'${line.replace(/'/g, "''")}'`)
      .join(" + [Environment]::NewLine + ");
    const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show((${text}), 'Techlio Connector', 'OK', '${isError ? "Warning" : "Information"}') | Out-Null`;
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps], QUIET);
  }
}

/**
 * Installs and starts the background service, then returns so the caller can
 * exit. The connector is never left running as a foreground program: if the
 * OS service manager refuses, it is started detached for this session.
 */
export async function installBackgroundService(): Promise<void> {
  const os = platform();
  const dir = installDir();
  mkdirSync(dir, { recursive: true });
  // The .pkg already placed the binary in /Library; do not copy a second one.
  const dest =
    os === "darwin" && existsSync(MAC_SYSTEM_PLIST) ? join(MAC_SYSTEM_DIR, exeName()) : join(dir, exeName());
  try {
    if (process.execPath !== dest && !dest.startsWith(MAC_SYSTEM_DIR)) copyFileSync(process.execPath, dest);
    if (os !== "win32" && !dest.startsWith(MAC_SYSTEM_DIR)) chmodSync(dest, 0o755);
  } catch {
    /* already running from the installed copy, or file in use during update */
  }
  writeEnv(dir);

  console.log("Installing the Techlio connector as a background service…");
  const registered =
    os === "darwin" ? registerMac(dest) : os === "win32" ? registerWindows(dest) : registerLinux(dest);
  if (!registered) startDetached(dest);
  connectIdes();

  const health = await waitForHealth();
  if (!health) {
    announce(
      `The Techlio connector was installed but has not started yet. Sign out and back in, or see the log at ${logPath()}.`,
      true,
    );
    process.exitCode = 1;
    return;
  }
  const next = health.paired
    ? "This computer is paired and reporting."
    : "Next: open the Techlio dashboard → My connectors → Activate.";
  announce(
    registered
      ? `Techlio connector is running in the background (v${health.version}). There is no window to keep open; it starts automatically when you sign in.\n\n${next}`
      : `Techlio connector is running in the background for this session, but this computer did not allow it to start automatically at sign-in. Ask IT to allow it.\n\n${next}`,
  );
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
