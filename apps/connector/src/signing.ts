import * as ed from "@noble/ed25519";
import { createHash } from "node:crypto";

/** Required for @noble/ed25519 in Node (no Web Crypto sha512 sync by default). */
ed.etc.sha512Sync = (...messages: Uint8Array[]) => {
  const h = createHash("sha512");
  for (const msg of messages) h.update(msg);
  return new Uint8Array(h.digest());
};
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getSecret, setSecret } from "./secret-store.js";

const KEY_FILE = join(process.env.HOME ?? ".", ".techlio-connector", "signing.key");

const SIGNING_SECRET = "signing-key";

/** Ed25519 private key, held in the OS credential store (hex). */
export function loadOrCreateSigningKey(hexFromEnv?: string): Uint8Array {
  if (hexFromEnv) return Uint8Array.from(Buffer.from(hexFromEnv, "hex"));
  const stored = getSecret(SIGNING_SECRET);
  if (stored) return Uint8Array.from(Buffer.from(stored, "hex"));
  // Migrate a key written by older builds (plain file, default permissions).
  if (existsSync(KEY_FILE)) {
    const legacy = Uint8Array.from(readFileSync(KEY_FILE));
    setSecret(SIGNING_SECRET, Buffer.from(legacy).toString("hex"));
    try {
      unlinkSync(KEY_FILE);
    } catch {
      /* leave it; the credential store copy is authoritative */
    }
    return legacy;
  }
  const priv = ed.utils.randomPrivateKey();
  setSecret(SIGNING_SECRET, Buffer.from(priv).toString("hex"));
  return priv;
}

export async function signBody(
  privateKey: Uint8Array,
  body: string,
): Promise<string> {
  const sig = await ed.sign(new TextEncoder().encode(body), privateKey);
  return Buffer.from(sig).toString("base64");
}

export async function publicSigningKey(
  privateKey: Uint8Array,
): Promise<string> {
  const key = await ed.getPublicKeyAsync(privateKey);
  return Buffer.from(key).toString("base64");
}
