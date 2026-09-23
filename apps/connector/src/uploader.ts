import type { ActivityEvent } from "@techlio/event-schema";
import { signBody } from "./signing.js";

/**
 * delivered — the API stored what it could (per-event rejections are logged).
 * invalid   — the API refused the whole batch as malformed; retrying cannot
 *             succeed, so the caller drops it and records the loss.
 * retry     — network error, auth hiccup, or 5xx: keep the rows.
 */
export type UploadResult = { status: "delivered"; rejected: number; reasons: string[] } | { status: "invalid" } | { status: "retry" };

export async function uploadBatch(
  apiBase: string,
  deviceToken: string,
  privateKey: Uint8Array,
  events: ActivityEvent[],
): Promise<UploadResult> {
  const body = JSON.stringify({ events });
  const signature = await signBody(privateKey, body);
  try {
    const res = await fetch(`${apiBase}/v1/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deviceToken}`,
        "X-Signature": signature,
        "X-Device-Id": events[0]?.device_id ?? "",
      },
      body,
    });
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as { rejected?: number; reasons?: string[] };
      return { status: "delivered", rejected: json.rejected ?? 0, reasons: json.reasons ?? [] };
    }
    if (res.status === 400) return { status: "invalid" };
    return { status: "retry" };
  } catch {
    return { status: "retry" };
  }
}
