"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet } from "./api";
import { useAuth } from "./auth-context";
import { useDisplayTimezoneVersion } from "./display-timezone";

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  status: number | null;
  loading: boolean;
  refreshing: boolean;
  /** When the current `data` was received — shown as "Data as of …". */
  fetchedAt: Date | null;
  reload: () => void;
}

/**
 * Small fetch hook with the four states every screen must handle:
 * loading, error, empty (callers check the payload), and data.
 * `refreshing` distinguishes a background poll from a first paint.
 */
export function useApi<T>(
  path: string | null,
  options?: { pollMs?: number },
): QueryState<T> {
  const { token, ready } = useAuth();
  const displayTzVersion = useDisplayTimezoneVersion();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);
  const hasData = useRef(false);
  const lastPath = useRef<string | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!ready || !token || !path) return;
    let cancelled = false;
    const ac = new AbortController();

    // New path (e.g. a filter changed): drop the old payload so stale numbers
    // are never shown under new filter labels, and show the loading skeleton.
    if (lastPath.current !== path) {
      lastPath.current = path;
      hasData.current = false;
      setData(null);
      setFetchedAt(null);
    }

    const run = async (background: boolean) => {
      if (background) setRefreshing(true);
      else if (!hasData.current) setLoading(true);
      try {
        const result = await apiGet<T>(path, token, ac.signal);
        if (cancelled) return;
        setData(result);
        setFetchedAt(new Date());
        hasData.current = true;
        setError(null);
        setStatus(200);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Request failed");
        setStatus(err instanceof ApiError ? err.status : null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    // A reload with data already on screen is a refresh, not a first paint.
    void run(hasData.current);
    if (options?.pollMs) {
      // No background polling while the tab is hidden; refresh on return.
      const tick = () => {
        if (document.visibilityState === "visible") void run(true);
      };
      const id = setInterval(tick, options.pollMs);
      document.addEventListener("visibilitychange", tick);
      return () => {
        cancelled = true;
        ac.abort();
        clearInterval(id);
        document.removeEventListener("visibilitychange", tick);
      };
    }
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [path, token, ready, nonce, options?.pollMs, displayTzVersion]);

  return { data, error, status, loading, refreshing, fetchedAt, reload };
}
