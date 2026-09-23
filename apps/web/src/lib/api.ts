const LOCAL_API = "http://localhost:3001";

function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return LOCAL_API;
  if (raw === "[SENSITIVE]" || /\[SENSITIVE\]/i.test(raw)) return LOCAL_API;
  if (!/^https?:\/\//i.test(raw)) return LOCAL_API;
  return raw.replace(/\/$/, "");
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, token: string | null): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ApiError(
      (json as { message?: string }).message ?? `Request failed (${r.status})`,
      r.status,
    );
  }
  return json as T;
}

export async function apiPost<T>(
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // Fastify rejects Content-Type: application/json with an empty body.
    body: JSON.stringify(body ?? {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const raw = (json as { message?: string | string[] }).message;
    const message = Array.isArray(raw)
      ? raw.join(", ")
      : raw ?? `Request failed (${r.status})`;
    throw new ApiError(message, r.status);
  }
  return json as T;
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
