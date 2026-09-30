"use client";

import { useSyncExternalStore } from "react";
import { ACCENT_IDS, PREFS_STORAGE_KEY } from "./preferences-boot";

/**
 * Per-browser display preferences (Settings → Appearance). Purely how the
 * portal looks and behaves on this device — nothing here is sent to the API
 * or changes what data is collected. Applied to <html> as data attributes
 * before first paint by the boot script in app/layout.tsx.
 */
export type Accent = (typeof ACCENT_IDS)[number];
export type Density = "comfortable" | "compact";
export type TimeFormat = "auto" | "12h" | "24h";
export type DefaultRange = "today" | "yesterday" | "7d" | "30d" | "90d";

export interface Preferences {
  accent: Accent;
  density: Density;
  reduceMotion: boolean;
  timeFormat: TimeFormat;
  /** Range analytics pages open with ("page default" keeps each page's own). */
  defaultRange: DefaultRange | "page";
  /** Refresh open dashboards automatically while the tab is visible. */
  liveUpdates: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  accent: "indigo",
  density: "comfortable",
  reduceMotion: false,
  timeFormat: "auto",
  defaultRange: "page",
  liveUpdates: true,
};

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { id: "violet", label: "Violet", swatch: "#7c3aed" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "teal", label: "Teal", swatch: "#0f766e" },
  { id: "rose", label: "Rose", swatch: "#e11d48" },
];

export { PREFS_STORAGE_KEY };

const listeners = new Set<() => void>();
let current: Preferences = DEFAULT_PREFERENCES;
let loaded = false;

function sanitize(raw: unknown): Preferences {
  const p = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  if (ACCENTS.some((a) => a.id === r.accent)) p.accent = r.accent as Accent;
  if (r.density === "compact" || r.density === "comfortable") p.density = r.density;
  if (typeof r.reduceMotion === "boolean") p.reduceMotion = r.reduceMotion;
  if (r.timeFormat === "12h" || r.timeFormat === "24h" || r.timeFormat === "auto") p.timeFormat = r.timeFormat;
  if (["page", "today", "yesterday", "7d", "30d", "90d"].includes(r.defaultRange as string)) {
    p.defaultRange = r.defaultRange as Preferences["defaultRange"];
  }
  if (typeof r.liveUpdates === "boolean") p.liveUpdates = r.liveUpdates;
  return p;
}

function load(): Preferences {
  if (loaded || typeof window === "undefined") return current;
  loaded = true;
  try {
    current = sanitize(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "null"));
  } catch {
    current = DEFAULT_PREFERENCES;
  }
  return current;
}

/** Mirror preferences onto <html> so CSS can react without re-rendering. */
export function applyPreferencesToDocument(p: Preferences): void {
  const root = document.documentElement;
  root.dataset.accent = p.accent;
  root.dataset.density = p.density;
  if (p.reduceMotion) root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

export function getPreferences(): Preferences {
  return load();
}

export function setPreferences(patch: Partial<Preferences>): void {
  current = sanitize({ ...load(), ...patch });
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode: applies for this visit only */
  }
  applyPreferencesToDocument(current);
  for (const fn of listeners) fn();
}

export function resetPreferences(): void {
  setPreferences(DEFAULT_PREFERENCES);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Current preferences; re-renders when they change. Server render uses defaults. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, load, () => DEFAULT_PREFERENCES);
}

/** `hour12` for Intl formatters: undefined lets the locale decide. */
export function hour12Preference(): boolean | undefined {
  const f = load().timeFormat;
  return f === "auto" ? undefined : f === "12h";
}

/** Initial range for an analytics page: the viewer's default, else the page's own. */
export function initialRangePreset<T extends string>(pageDefault: T): T | DefaultRange {
  const d = load().defaultRange;
  return d === "page" ? pageDefault : d;
}
