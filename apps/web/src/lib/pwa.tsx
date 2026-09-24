"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Installable app (PWA). Tracks whether the app can be installed, is already
 * installed, and offers the browser's install prompt. The "Install app"
 * button disappears once installed:
 *   - running as the installed app (display-mode: standalone / iOS standalone)
 *   - the browser fired `appinstalled`
 * If the user later uninstalls, the browser fires `beforeinstallprompt` again
 * and the button comes back.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** Running inside the installed app window. */
  standalone: boolean;
  /** Installed on this device (from this browser), or running as the app. */
  installed: boolean;
  /** The browser offered a one-tap install (Chrome, Edge, Android, Windows, macOS Chrome). */
  canPrompt: boolean;
  /** iPhone/iPad Safari: install is manual (Share → Add to Home Screen). */
  iosManual: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

const INSTALLED_KEY = "techlio-pwa-installed";
const PwaContext = createContext<PwaState | null>(null);

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [installedFlag, setInstalledFlag] = useState(false);
  const [iosManual, setIosManual] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setIosManual(isIosSafari());
    try {
      setInstalledFlag(localStorage.getItem(INSTALLED_KEY) === "1");
    } catch {
      /* storage blocked */
    }
    const media = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(isStandalone());
    media.addEventListener?.("change", onMode);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own button instead of the mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      // The browser only offers install when the app is NOT installed.
      setInstalledFlag(false);
      try {
        localStorage.removeItem(INSTALLED_KEY);
      } catch {
        /* storage blocked */
      }
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalledFlag(true);
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        /* storage blocked */
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Offline shell + fast repeat loads. Production only: a service worker in
    // development would serve stale bundles.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    return () => {
      media.removeEventListener?.("change", onMode);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  const value = useMemo<PwaState>(
    () => ({
      standalone,
      installed: standalone || installedFlag,
      canPrompt: Boolean(deferred) && !standalone,
      iosManual: iosManual && !standalone,
      install,
    }),
    [standalone, installedFlag, deferred, iosManual, install],
  );
  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaState {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa outside PwaProvider");
  return ctx;
}
