import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { dataDir } from "./paths.js";

/**
 * Connector secrets (device token, Ed25519 signing key, queue key) live in the
 * operating system's credential store:
 *
 *   macOS   — login Keychain via `security` (generic password, service "techlio-connector")
 *   Windows — DPAPI (CurrentUser scope) via PowerShell; the protected blob is
 *             stored under %USERPROFILE%\.techlio-connector\secrets\
 *   Linux   — Secret Service via `secret-tool` when available
 *
 * When no store is usable (headless Linux without a keyring), secrets fall back
 * to 0600 files, and `backend()` reports "file" so health can say so.
 */
const SERVICE = "techlio-connector";
const DIR = join(dataDir(), "secrets");

export type SecretBackend = "keychain" | "dpapi" | "secret-service" | "file";

let cachedBackend: SecretBackend | null = null;

function run(cmd: string, args: string[], input?: string) {
  // windowsHide: the service has no console, so PowerShell must not open one.
  return spawnSync(cmd, args, { input, encoding: "utf8", timeout: 10_000, windowsHide: true });
}

export function backend(): SecretBackend {
  if (cachedBackend) return cachedBackend;
  const os = platform();
  if (os === "darwin" && run("security", ["help"]).error == null) cachedBackend = "keychain";
  else if (os === "win32") cachedBackend = "dpapi";
  else if (os === "linux" && run("secret-tool", ["--version"]).status === 0) cachedBackend = "secret-service";
  else cachedBackend = "file";
  return cachedBackend;
}

function filePath(name: string, ext = "secret"): string {
  return join(DIR, `${name}.${ext}`);
}

function writePrivate(path: string, data: string): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, path);
}

const PS_PROTECT = `Add-Type -AssemblyName System.Security;
$in = [Console]::In.ReadToEnd();
$b = [Text.Encoding]::UTF8.GetBytes($in);
[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b, $null, 'CurrentUser'))`;
const PS_UNPROTECT = `Add-Type -AssemblyName System.Security;
$in = [Console]::In.ReadToEnd().Trim();
$b = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($in), $null, 'CurrentUser');
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($b))`;

export function setSecret(name: string, value: string): void {
  switch (backend()) {
    case "keychain": {
      // -U updates in place. The value is passed via argv to `security`, which
      // is the documented interface; it is never written to disk by us.
      const r = run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", name, "-w", value]);
      if (r.status === 0) return;
      break;
    }
    case "dpapi": {
      const r = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_PROTECT], value);
      if (r.status === 0 && r.stdout.trim()) {
        writePrivate(filePath(name, "dpapi"), r.stdout.trim());
        return;
      }
      break;
    }
    case "secret-service": {
      const r = run("secret-tool", ["store", `--label=Techlio connector ${name}`, "service", SERVICE, "account", name], value);
      if (r.status === 0) return;
      break;
    }
    default:
      break;
  }
  writePrivate(filePath(name), value);
}

/**
 * The secret exists but could not be read right now (locked Keychain, DPAPI
 * timing out at sign-in). Callers must not treat this as "missing" — creating
 * a new key would silently break the device's signature and queued rows.
 * The service exits and its supervisor retries shortly.
 */
export class SecretUnavailableError extends Error {}

const KEYCHAIN_ITEM_NOT_FOUND = 44;

export function getSecret(name: string): string | null {
  switch (backend()) {
    case "keychain": {
      const r = run("security", ["find-generic-password", "-s", SERVICE, "-a", name, "-w"]);
      if (r.status === 0) return r.stdout.replace(/\n$/, "");
      if (r.status !== KEYCHAIN_ITEM_NOT_FOUND) {
        throw new SecretUnavailableError(`Keychain read failed for ${name} (status ${r.status})`);
      }
      break;
    }
    case "dpapi": {
      const p = filePath(name, "dpapi");
      if (existsSync(p)) {
        const blob = readFileSync(p, "utf8");
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_UNPROTECT], blob);
          if (r.status === 0) return r.stdout;
        }
        throw new SecretUnavailableError(`DPAPI could not decrypt ${name}`);
      }
      break;
    }
    case "secret-service": {
      const r = run("secret-tool", ["lookup", "service", SERVICE, "account", name]);
      if (r.status === 0 && r.stdout) return r.stdout.replace(/\n$/, "");
      break;
    }
    default:
      break;
  }
  const p = filePath(name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function deleteSecret(name: string): void {
  if (backend() === "keychain") run("security", ["delete-generic-password", "-s", SERVICE, "-a", name]);
  if (backend() === "secret-service") run("secret-tool", ["clear", "service", SERVICE, "account", name]);
  for (const p of [filePath(name), filePath(name, "dpapi")]) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* already gone */
    }
  }
}
