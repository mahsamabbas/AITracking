#!/usr/bin/env node
/**
 * Builds the downloadable connector installers. Employees never need this repo.
 *
 *   macOS   — techlio-connector-macos.pkg: installs the binary under
 *             /Library/Application Support/Techlio/Connector and a LaunchAgent
 *             in /Library/LaunchAgents, so it runs in the background for every
 *             user who signs in. No app in /Applications, no Dock icon.
 *   Windows — techlio-connector-win-x64.exe: GUI-subsystem build (no console).
 *             Opening it once registers a hidden logon task and exits.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const downloads = join(root, "apps/web/public/downloads");
const out = join(downloads, "build");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const bundle = join(out, "techlio.cjs");
const built = spawnSync(
  "npx",
  [
    "--yes",
    "esbuild@0.25.0",
    join(root, "apps/connector/src/launcher.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node20",
    `--outfile=${bundle}`,
  ],
  { cwd: root, stdio: "inherit" },
);
if (built.status !== 0) process.exit(built.status ?? 1);

const targets = [
  ["bun-darwin-x64", "techlio-connector-macos-x64"],
  ["bun-darwin-arm64", "techlio-connector-macos-arm64"],
  ["bun-windows-x64", "techlio-connector-win-x64.exe"],
];
// Bun only accepts the --windows-* flags when compiling on Windows. Elsewhere
// the PE subsystem patch below gives the same "no console window" result.
const WINDOWS_META = process.platform !== "win32" ? [] : [
  // No console window: the connector is a background service on Windows.
  "--windows-hide-console",
  "--windows-title=Techlio Connector",
  "--windows-publisher=Techlio",
  "--windows-description=Techlio AI activity connector (background service)",
  "--windows-version=0.1.0.0",
];
for (const [target, name] of targets) {
  const compiled = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      `--target=${target}`,
      ...(target.includes("windows") ? WINDOWS_META : []),
      `--outfile=${join(downloads, name)}`,
      bundle,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (compiled.status !== 0) {
    console.error(`Failed to build ${name}`);
    process.exit(compiled.status ?? 1);
  }
}

// Belt and braces: confirm the Windows build really is GUI-subsystem (2), not
// console (3), so no Command Prompt ever opens for the service or its hooks.
{
  const exe = readFileSync(join(downloads, "techlio-connector-win-x64.exe"));
  const pe = exe.readUInt32LE(0x3c);
  const subsystemAt = pe + 24 + 68;
  if (exe.readUInt16LE(subsystemAt) !== 2) {
    exe.writeUInt16LE(2, subsystemAt);
    writeFileSync(join(downloads, "techlio-connector-win-x64.exe"), exe);
    console.log("Patched Windows executable to the GUI subsystem (no console window).");
  }
}

// --- Signing -------------------------------------------------------------
// Local builds are ad-hoc signed ("-"), which macOS Gatekeeper blocks for
// downloaded apps. Distribution builds must pass --release with real
// credentials:
//   APPLE_SIGNING_IDENTITY  "Developer ID Application: Techlio (TEAMID)"
//   APPLE_NOTARY_PROFILE    keychain profile created with `xcrun notarytool store-credentials`
//   WINDOWS_CERT_PFX / WINDOWS_CERT_PASSWORD  Authenticode cert, signed via osslsigncode
const RELEASE = process.argv.includes("--release");
const APPLE_ID = process.env.APPLE_SIGNING_IDENTITY;
const NOTARY = process.env.APPLE_NOTARY_PROFILE;
const WIN_PFX = process.env.WINDOWS_CERT_PFX;
const WIN_PASS = process.env.WINDOWS_CERT_PASSWORD;
//   APPLE_INSTALLER_IDENTITY "Developer ID Installer: Techlio (TEAMID)" — signs the .pkg
const APPLE_INSTALLER_ID = process.env.APPLE_INSTALLER_IDENTITY;

if (RELEASE && (!APPLE_ID || !APPLE_INSTALLER_ID || !NOTARY || !WIN_PFX || !WIN_PASS)) {
  console.error(
    "--release requires APPLE_SIGNING_IDENTITY, APPLE_INSTALLER_IDENTITY, APPLE_NOTARY_PROFILE, WINDOWS_CERT_PFX and WINDOWS_CERT_PASSWORD. Refusing to publish unsigned installers.",
  );
  process.exit(1);
}

function codesignBinary(path) {
  const args = APPLE_ID
    ? ["--force", "--options", "runtime", "--timestamp", "--identifier", "com.techlio.connector", "--sign", APPLE_ID, path]
    : ["--force", "--identifier", "com.techlio.connector", "--sign", "-", path];
  const r = spawnSync("codesign", args, { stdio: "inherit" });
  if (APPLE_ID && r.status !== 0) {
    console.error(`codesign failed for ${path}`);
    process.exit(1);
  }
}

function notarize(path) {
  if (!NOTARY) return;
  const submit = spawnSync("xcrun", ["notarytool", "submit", path, "--keychain-profile", NOTARY, "--wait"], {
    stdio: "inherit",
  });
  if (submit.status !== 0) {
    console.error(`Notarization failed for ${path}`);
    process.exit(1);
  }
  spawnSync("xcrun", ["stapler", "staple", path], { stdio: "inherit" });
}

function signWindows(exePath) {
  if (!WIN_PFX) return;
  const signed = `${exePath}.signed`;
  const r = spawnSync(
    "osslsigncode",
    ["sign", "-pkcs12", WIN_PFX, "-pass", WIN_PASS ?? "", "-h", "sha256", "-t", "http://timestamp.digicert.com", "-in", exePath, "-out", signed],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    console.error(`Authenticode signing failed for ${exePath}`);
    process.exit(1);
  }
  renameSync(signed, exePath);
}

// --- macOS installer package ----------------------------------------------
const MAC_DIR = "/Library/Application Support/Techlio/Connector";
const MAC_LABEL = "com.techlio.connector";

const launchAgentPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${MAC_DIR}/techlio-connector</string><string>--service</string></array>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash; a clean exit (duplicate instance) is not respawned. -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <!-- One instance per signed-in user, in that user's session (Keychain, ~/.claude). -->
  <key>LimitLoadToSessionType</key><string>Aqua</string>
</dict></plist>
`;

// Runs as root. Stops any earlier copy for the signed-in user (including the
// old per-user LaunchAgent) before the payload is replaced.
const preinstall = `#!/bin/sh
USER_NAME=$(stat -f%Su /dev/console)
[ -n "$USER_NAME" ] && [ "$USER_NAME" != "root" ] || exit 0
USER_ID=$(id -u "$USER_NAME")
launchctl bootout "gui/$USER_ID/${MAC_LABEL}" 2>/dev/null || true
exit 0
`;

// Starts the agent for the signed-in user now; every other user gets it at
// their next sign-in (RunAtLoad). The service installs the AI-tool hooks.
const postinstall = `#!/bin/sh
PLIST="/Library/LaunchAgents/${MAC_LABEL}.plist"
chown root:wheel "$PLIST"; chmod 644 "$PLIST"
USER_NAME=$(stat -f%Su /dev/console)
[ -n "$USER_NAME" ] && [ "$USER_NAME" != "root" ] || exit 0
USER_ID=$(id -u "$USER_NAME")
USER_HOME=$(dscl . -read "/Users/$USER_NAME" NFSHomeDirectory | awk '{print $2}')
LEGACY="$USER_HOME/Library/LaunchAgents/${MAC_LABEL}.plist"
[ -f "$LEGACY" ] && rm -f "$LEGACY"
launchctl bootout "gui/$USER_ID/${MAC_LABEL}" 2>/dev/null || true
i=0
until launchctl bootstrap "gui/$USER_ID" "$PLIST" 2>/dev/null; do
  i=$((i+1)); [ $i -ge 5 ] && break; sleep 1
done
launchctl enable "gui/$USER_ID/${MAC_LABEL}" 2>/dev/null || true
launchctl kickstart "gui/$USER_ID/${MAC_LABEL}" 2>/dev/null || true
exit 0
`;

// Shipped next to the binary: sudo "/Library/Application Support/Techlio/Connector/uninstall.sh" [--purge]
const uninstall = `#!/bin/sh
# Removes the Techlio connector for every user. --purge also deletes the
# signed-in user's credentials and unsent events.
if [ "$(id -u)" != "0" ]; then echo "Run with sudo: sudo \\"$0\\" $*"; exit 1; fi
USER_NAME=$(stat -f%Su /dev/console)
if [ -n "$USER_NAME" ] && [ "$USER_NAME" != "root" ]; then
  USER_ID=$(id -u "$USER_NAME")
  # Removes hooks (and with --purge, Keychain items) as that user.
  launchctl asuser "$USER_ID" sudo -H -u "$USER_NAME" env TECHLIO_SYSTEM_UNINSTALL=1 "${MAC_DIR}/techlio-connector" --uninstall "$@" || true
fi
# Stop it for everyone else who is signed in (fast user switching).
for U in $(who | awk '{print $1}' | sort -u); do
  launchctl bootout "gui/$(id -u "$U")/${MAC_LABEL}" 2>/dev/null || true
done
rm -f "/Library/LaunchAgents/${MAC_LABEL}.plist"
rm -rf "${MAC_DIR}"
pkgutil --forget ${MAC_LABEL} >/dev/null 2>&1 || true
echo "Techlio connector removed."
`;

function writePkg(binaryPath, pkgPath) {
  const work = join(out, `pkg-${Math.random().toString(36).slice(2, 8)}`);
  const payload = join(work, "root");
  const scripts = join(work, "scripts");
  const appDir = join(payload, MAC_DIR.slice(1));
  mkdirSync(appDir, { recursive: true });
  mkdirSync(join(payload, "Library/LaunchAgents"), { recursive: true });
  mkdirSync(scripts, { recursive: true });

  const exe = join(appDir, "techlio-connector");
  copyFileSync(binaryPath, exe);
  chmodSync(exe, 0o755);
  codesignBinary(exe);
  writeFileSync(join(appDir, "uninstall.sh"), uninstall, { mode: 0o755 });
  writeFileSync(join(payload, `Library/LaunchAgents/${MAC_LABEL}.plist`), launchAgentPlist, { mode: 0o644 });
  writeFileSync(join(scripts, "preinstall"), preinstall, { mode: 0o755 });
  writeFileSync(join(scripts, "postinstall"), postinstall, { mode: 0o755 });

  // Extended attributes (quarantine, provenance) would ship as ._ AppleDouble files.
  spawnSync("xattr", ["-cr", payload], { stdio: "inherit" });
  const component = join(work, "component.pkg");
  const built = spawnSync(
    "pkgbuild",
    [
      "--root", payload,
      "--scripts", scripts,
      "--identifier", MAC_LABEL,
      "--version", "0.1.0",
      "--install-location", "/",
      "--ownership", "recommended",
      component,
    ],
    { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  if (built.status !== 0) {
    console.error(`pkgbuild failed for ${pkgPath}`);
    process.exit(built.status ?? 1);
  }
  rmSync(pkgPath, { force: true });
  const product = spawnSync(
    "productbuild",
    [...(APPLE_INSTALLER_ID ? ["--sign", APPLE_INSTALLER_ID] : []), "--package", component, pkgPath],
    { stdio: "inherit" },
  );
  if (product.status !== 0) {
    console.error(`productbuild failed for ${pkgPath}`);
    process.exit(product.status ?? 1);
  }
  rmSync(work, { recursive: true, force: true });
  notarize(pkgPath);
}

const arm = join(downloads, "techlio-connector-macos-arm64");
const intel = join(downloads, "techlio-connector-macos-x64");
const universal = join(out, "techlio-connector-macos-universal");
const lipo = spawnSync("lipo", ["-create", arm, intel, "-output", universal], { stdio: "inherit" });
if (lipo.status === 0) {
  writePkg(universal, join(downloads, "techlio-connector-macos.pkg"));
} else {
  console.warn("Universal Mac binary failed; shipping separate Intel and Apple silicon installers.");
}
writePkg(arm, join(downloads, "techlio-connector-macos-arm64.pkg"));
writePkg(intel, join(downloads, "techlio-connector-macos-x64.pkg"));
// The old disk images contained a foreground .app; never serve them again.
for (const stale of ["techlio-connector-macos.dmg", "techlio-connector-macos-arm64.dmg", "techlio-connector-macos-x64.dmg"]) {
  rmSync(join(downloads, stale), { force: true });
}

signWindows(join(downloads, "techlio-connector-win-x64.exe"));

const extBuild = spawnSync("pnpm", ["--filter", "techlio-activity-companion", "run", "build"], {
  cwd: root,
  stdio: "inherit",
});
if (extBuild.status === 0) {
  const vsix = spawnSync(
    "npx",
    ["--yes", "@vscode/vsce", "package", "--no-dependencies", "--allow-missing-repository", "-o", join(downloads, "techlio-companion.vsix")],
    { cwd: join(root, "apps/extension"), stdio: "inherit" },
  );
  if (vsix.status !== 0) console.warn("Companion extension package failed; the connector executable is still usable.");
}

// Published checksums let IT and the installer verify what was downloaded.
const sums = readdirSync(downloads)
  .filter((f) => /\.(pkg|exe|vsix|zip)$|^techlio-connector/.test(f) && !f.endsWith(".txt"))
  .filter((f) => statSync(join(downloads, f)).isFile())
  .map((f) => `${createHash("sha256").update(readFileSync(join(downloads, f))).digest("hex")}  ${f}`);
writeFileSync(join(downloads, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);

console.log("Executables are in", downloads);
if (!APPLE_ID || !APPLE_INSTALLER_ID || !WIN_PFX) {
  console.warn("WARNING: these installers are NOT signed for distribution (ad-hoc/unsigned). Use --release with signing credentials before publishing.");
}
