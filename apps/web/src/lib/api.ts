const LOCAL_API = "http://localhost:3001";

function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return LOCAL_API;
  if (raw === "[SENSITIVE]" || /\[SENSITIVE\]/i.test(raw)) return LOCAL_API;
  if (!/^https?:\/\//i.test(raw)) return LOCAL_API;
  return raw.replace(/\/$/, "");
}

export const API_BASE = resolveApiBase();

const TECHLIO_ORG_HEADER = "x-techlio-org-id";
const TECHLIO_DISPLAY_TZ_HEADER = "x-techlio-display-timezone";

let activeOrgContextId: string | null = null;
let activeDisplayTimezone = "Asia/Karachi";
const displayTzListeners = new Set<() => void>();

/** Set while a platform super admin views a customer organisation workspace. */
export function setApiOrgContext(orgId: string | null): void {
  activeOrgContextId = orgId;
}

/** Viewer-selected IANA timezone — sent on API requests for reporting buckets. */
export function setApiDisplayTimezone(timeZone: string): void {
  // Unchanged → no refetch of every open query.
  if (timeZone === activeDisplayTimezone) return;
  activeDisplayTimezone = timeZone;
  for (const fn of displayTzListeners) fn();
}

/** The viewer's display timezone (formatters default to it). */
export function apiDisplayTimezone(): string {
  return activeDisplayTimezone;
}

export function subscribeDisplayTimezone(listener: () => void): () => void {
  displayTzListeners.add(listener);
  return () => displayTzListeners.delete(listener);
}

function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    [TECHLIO_DISPLAY_TZ_HEADER]: activeDisplayTimezone,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (activeOrgContextId) headers[TECHLIO_ORG_HEADER] = activeOrgContextId;
  return headers;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(
  path: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(token),
    signal,
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
  return apiSend<T>("POST", path, token, body);
}

export async function apiPatch<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  return apiSend<T>("PATCH", path, token, body);
}

export async function apiDelete<T>(path: string, token: string | null): Promise<T> {
  return apiSend<T>("DELETE", path, token);
}

async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(method !== "DELETE" ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(token),
    },
    body: method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
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

/** Authenticated file download (CSV/NDJSON exports and archives). */
export async function apiDownload(path: string, token: string | null, filename: string): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
  if (!r.ok) {
    const json = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(json.message ?? json.error ?? `Download failed (${r.status})`, r.status);
  }
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking in the same tick can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
