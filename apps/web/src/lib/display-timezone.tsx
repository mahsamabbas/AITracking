"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setApiDisplayTimezone, subscribeDisplayTimezone } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_OPTIONS,
  timezoneLabel,
} from "@/lib/timezone-options";

const STORAGE_KEY = "techlio-display-timezone";

type DisplayTimezoneContextValue = {
  timezone: string;
  label: string;
  options: typeof TIMEZONE_OPTIONS;
  setTimezone: (id: string) => void;
  orgTimezone: string | null;
};

const DisplayTimezoneContext = createContext<DisplayTimezoneContextValue | null>(null);

function readStoredTimezone(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (!raw) return null;
    new Intl.DateTimeFormat("en", { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

export function DisplayTimezoneProvider({ children }: { children: ReactNode }) {
  const policy = useApi<{ timezone?: string }>("/v1/org/policy");
  const orgTimezone = policy.data?.timezone?.trim() || null;

  const [timezone, setTimezoneState] = useState(DEFAULT_TIMEZONE);
  const [userChosen, setUserChosen] = useState(false);

  useEffect(() => {
    const stored = readStoredTimezone();
    if (stored) {
      setTimezoneState(stored);
      setApiDisplayTimezone(stored);
      setUserChosen(true);
    } else {
      setApiDisplayTimezone(DEFAULT_TIMEZONE);
    }
  }, []);

  useEffect(() => {
    if (userChosen || !orgTimezone) return;
    setTimezoneState(orgTimezone);
    setApiDisplayTimezone(orgTimezone);
  }, [orgTimezone, userChosen]);

  const setTimezone = useCallback((id: string) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: id });
    } catch {
      return;
    }
    localStorage.setItem(STORAGE_KEY, id);
    setApiDisplayTimezone(id);
    setTimezoneState(id);
    setUserChosen(true);
  }, []);

  const value = useMemo(
    () => ({
      timezone,
      label: timezoneLabel(timezone),
      options: TIMEZONE_OPTIONS,
      setTimezone,
      orgTimezone,
    }),
    [timezone, setTimezone, orgTimezone],
  );

  return (
    <DisplayTimezoneContext.Provider value={value}>{children}</DisplayTimezoneContext.Provider>
  );
}

export function useDisplayTimezone(): DisplayTimezoneContextValue {
  const ctx = useContext(DisplayTimezoneContext);
  if (!ctx) {
    return {
      timezone: DEFAULT_TIMEZONE,
      label: timezoneLabel(DEFAULT_TIMEZONE),
      options: TIMEZONE_OPTIONS,
      setTimezone: () => {},
      orgTimezone: null,
    };
  }
  return ctx;
}

/** Re-render when the viewer changes display timezone (triggers API refetch). */
export function useDisplayTimezoneVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeDisplayTimezone(() => setVersion((v) => v + 1)), []);
  return version;
}
