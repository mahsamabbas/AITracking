#!/usr/bin/env node
/**
 * Portable connector zip for employees (Node.js only — no git clone).
 * Output: apps/web/public/downloads/techlio-connector.zip
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = join(root, "apps/web/public/downloads/techlio-connector");
const zipPath = join(root, "apps/web/public/downloads/techlio-connector.zip");

console.log("Building workspace packages…");
execSync("pnpm --filter @techlio/event-schema --filter @techlio/provider-adapters --filter @techlio/connector run build", {
  cwd: root,
  stdio: "inherit",
});

rmSync(bundleRoot, { recursive: true, force: true });
mkdirSync(bundleRoot, { recursive: true });

cpSync(join(root, "apps/connector/dist"), join(bundleRoot, "dist"), { recursive: true });

function vendorPkg(name, relPath) {
  const src = join(root, relPath);
  const dest = join(bundleRoot, "vendor", name);
  mkdirSync(dest, { recursive: true });
  cpSync(join(src, "package.json"), join(dest, "package.json"));
  cpSync(join(src, "dist"), join(dest, "dist"), { recursive: true });
}

vendorPkg("event-schema", "packages/event-schema");
vendorPkg("provider-adapters", "packages/provider-adapters");

const pkg = {
  name: "techlio-connector-local",
  version: "0.1.0",
  private: true,
  type: "module",
  scripts: { start: "node dist/index.js" },
  dependencies: {
    "@noble/ed25519": "^2.2.3",
    "@techlio/event-schema": "file:./vendor/event-schema",
    "@techlio/provider-adapters": "file:./vendor/provider-adapters",
    "better-sqlite3": "^11.7.0",
    fastify: "^5.2.0",
  },
};
writeFileSync(join(bundleRoot, "package.json"), JSON.stringify(pkg, null, 2));

writeFileSync(
  join(bundleRoot, ".env.example"),
  `TECHLIO_API_URL=https://techlio-api.vercel.app
TECHLIO_DASHBOARD_ORIGINS=https://techlio-web.vercel.app,https://techlio-*-mahsamabbas-projects.vercel.app,https://tracking-app-api-t9yd.vercel.app
CONNECTOR_PORT=9477
`,
);

writeFileSync(
  join(bundleRoot, "run.sh"),
  `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -f .env ]]; then set -a; source .env; set +a; fi
exec node dist/index.js
`,
);

writeFileSync(
  join(bundleRoot, "run.ps1"),
  `# Techlio connector runner
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    Set-Item -Path "env:$key" -Value $val
  }
}
& node (Join-Path $PSScriptRoot "dist\\index.js")
`,
);

try {
  execSync(`chmod +x "${join(bundleRoot, "run.sh")}"`, { stdio: "ignore" });
} catch {
  /* windows */
}

rmSync(zipPath, { force: true });
mkdirSync(dirname(zipPath), { recursive: true });

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${bundleRoot}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );
} else {
  execSync(`cd "${dirname(bundleRoot)}" && zip -rq techlio-connector.zip techlio-connector`, {
    stdio: "inherit",
  });
}

console.log(`\nWrote ${zipPath}`);
console.log("Deploy web so employees can download /downloads/techlio-connector.zip");
