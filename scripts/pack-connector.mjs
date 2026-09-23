#!/usr/bin/env node
/**
 * Builds downloadable connector executables (Windows and macOS).
 * Double-click starts the local connector. Employees never need this repo.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
for (const [target, name] of targets) {
  const compiled = spawnSync(
    "bun",
    ["build", "--compile", `--target=${target}`, `--outfile=${join(downloads, name)}`, bundle],
    { cwd: root, stdio: "inherit" },
  );
  if (compiled.status !== 0) {
    console.error(`Failed to build ${name}`);
    process.exit(compiled.status ?? 1);
  }
}

function writeMacApp(binaryPath, stageDir) {
  rmSync(stageDir, { recursive: true, force: true });
  const macOs = join(stageDir, "Techlio Connector.app", "Contents", "MacOS");
  mkdirSync(macOs, { recursive: true });
  const exe = join(macOs, "techlio-connector");
  copyFileSync(binaryPath, exe);
  chmodSync(exe, 0o755);
  writeFileSync(
    join(stageDir, "Techlio Connector.app", "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Techlio Connector</string>
  <key>CFBundleDisplayName</key><string>Techlio Connector</string>
  <key>CFBundleIdentifier</key><string>com.techlio.connector</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleExecutable</key><string>techlio-connector</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`,
  );
  codesignApp(join(stageDir, "Techlio Connector.app"));
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

if (RELEASE && (!APPLE_ID || !NOTARY || !WIN_PFX || !WIN_PASS)) {
  console.error(
    "--release requires APPLE_SIGNING_IDENTITY, APPLE_NOTARY_PROFILE, WINDOWS_CERT_PFX and WINDOWS_CERT_PASSWORD. Refusing to publish unsigned installers.",
  );
  process.exit(1);
}

function codesignApp(appPath) {
  const args = APPLE_ID
    ? ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", APPLE_ID, appPath]
    : ["--force", "--sign", "-", appPath];
  const r = spawnSync("codesign", args, { stdio: "inherit" });
  if (APPLE_ID && r.status !== 0) {
    console.error(`codesign failed for ${appPath}`);
    process.exit(1);
  }
}

function notarize(dmgPath) {
  if (!NOTARY) return;
  const submit = spawnSync("xcrun", ["notarytool", "submit", dmgPath, "--keychain-profile", NOTARY, "--wait"], {
    stdio: "inherit",
  });
  if (submit.status !== 0) {
    console.error(`Notarization failed for ${dmgPath}`);
    process.exit(1);
  }
  spawnSync("xcrun", ["stapler", "staple", dmgPath], { stdio: "inherit" });
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

function writeDmg(stageDir, dmgPath) {
  rmSync(dmgPath, { force: true });
  const created = spawnSync(
    "hdiutil",
    [
      "create",
      "-volname",
      "Techlio Connector",
      "-srcfolder",
      stageDir,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ],
    { stdio: "inherit" },
  );
  if (created.status !== 0) {
    console.error(`Failed to create ${dmgPath}`);
    process.exit(created.status ?? 1);
  }
  notarize(dmgPath);
}

const arm = join(downloads, "techlio-connector-macos-arm64");
const intel = join(downloads, "techlio-connector-macos-x64");
const universal = join(out, "techlio-connector-macos-universal");
const lipo = spawnSync("lipo", ["-create", arm, intel, "-output", universal], { stdio: "inherit" });
if (lipo.status === 0) {
  const stage = join(out, "dmg-universal");
  writeMacApp(universal, stage);
  writeDmg(stage, join(downloads, "techlio-connector-macos.dmg"));
} else {
  console.warn("Universal Mac binary failed; shipping separate Intel and Apple silicon disk images.");
}
for (const [binary, dmgName, stageName] of [
  [arm, "techlio-connector-macos-arm64.dmg", "dmg-arm"],
  [intel, "techlio-connector-macos-x64.dmg", "dmg-intel"],
]) {
  const stage = join(out, stageName);
  writeMacApp(binary, stage);
  writeDmg(stage, join(downloads, dmgName));
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
  .filter((f) => /\.(dmg|exe|vsix|zip)$|^techlio-connector/.test(f) && !f.endsWith(".txt"))
  .map((f) => `${createHash("sha256").update(readFileSync(join(downloads, f))).digest("hex")}  ${f}`);
writeFileSync(join(downloads, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);

console.log("Executables are in", downloads);
if (!APPLE_ID || !WIN_PFX) {
  console.warn("WARNING: these installers are NOT signed for distribution (ad-hoc/unsigned). Use --release with signing credentials before publishing.");
}
