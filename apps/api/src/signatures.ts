import * as ed from "@noble/ed25519";
import { createHash } from "node:crypto";

ed.etc.sha512Sync = (...messages: Uint8Array[]) => {
  const h = createHash("sha512");
  for (const message of messages) h.update(message);
  return new Uint8Array(h.digest());
};

export async function verifyBatchSignature(input: {
  publicKey: string;
  signature: string;
  body: string;
}): Promise<boolean> {
  try {
    const publicKey = Buffer.from(input.publicKey, "base64");
    const signature = Buffer.from(input.signature, "base64");
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    return await ed.verifyAsync(
      signature,
      new TextEncoder().encode(input.body),
      publicKey,
    );
  } catch {
    return false;
  }
}

