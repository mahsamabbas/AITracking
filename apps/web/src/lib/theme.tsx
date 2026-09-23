"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark";
/** What the user chose; "system" follows the OS and updates live. */
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "techlio-theme";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* private mode */
  }
  return "system";
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeState {
  /** The theme actually applied. */
  theme: Theme;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  /** Cycles light → dark → system. */
  cyclePreference: () => void;
  /** Kept for existing callers: flips between light and dark. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: "light",
  preference: "system",
  setPreference: () => {},
  cyclePreference: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [system, setSystem] = useState<Theme>("light");
  // The boot script in layout.tsx already applied the right class before paint.
  // Do not touch the DOM until the stored preference has been read, or dark
  // users would flash to light for a frame.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferenceState(readPreference());
    setSystem(systemTheme());
    setReady(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = preference === "system" ? system : preference;

  useEffect(() => {
    if (ready) applyTheme(theme);
  }, [theme, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference(preference === "light" ? "dark" : preference === "dark" ? "system" : "light");
  }, [preference, setPreference]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [setPreference, theme]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, cyclePreference, toggleTheme }),
    [theme, preference, setPreference, cyclePreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
