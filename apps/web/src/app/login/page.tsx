"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  biometricLabel,
  canUsePlatformBiometrics,
  isMobileDevice,
  loadEnrollment,
} from "@/lib/biometric";

/**
 * Local-only demo accounts. The panel renders only when the build sets
 * NEXT_PUBLIC_SHOW_DEMO_LOGINS=1 (apps/web/.env.development.local). Production
 * builds show a plain sign-in form; those accounts are disabled server-side
 * outside dev mode anyway.
 */
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "1";
const DEMO = [
  { role: "Manager", email: "manager@techlio.local", password: "manager123", desc: "Team analytics, employees, sessions" },
  { role: "Administrator", email: "admin@techlio.local", password: "admin123", desc: "Plus users, connectors, policy" },
  { role: "Developer", email: "developer@techlio.local", password: "developer123", desc: "Only their own activity" },
  { role: "Auditor", email: "auditor@techlio.local", password: "auditor123", desc: "Access history and config only" },
];

export default function LoginPage() {
  const { login, unlockWithBiometric, locked } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isMobileDevice()) return;
      const enrollment = loadEnrollment();
      if (enrollment?.email) setEmail(enrollment.email);
      if (!enrollment) return;
      const ok = await canUsePlatformBiometrics();
      if (!cancelled) setBiometricAvailable(ok);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function biometricUnlock() {
    setBusy(true);
    setError(null);
    try {
      await unlockWithBiometric();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric unlock failed");
      setBusy(false);
    }
  }

  const label = biometricLabel();

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-solid text-sm font-bold text-white">
              T
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Techlio</p>
              <p className="text-2xs text-ink-500">AI activity monitoring</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Sign in</h1>
          <p className="muted mt-1">Access is scoped to your role and organisation.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="label mb-1.5 block">Email</span>
              <input
                type="email"
                className="field"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Password</span>
              <input
                type="password"
                className="field"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {biometricAvailable || locked ? (
            <div className="mt-5 lg:hidden">
              <div className="relative my-4">
                <div className="divider" />
                <p className="absolute inset-x-0 -top-2.5 text-center">
                  <span className="bg-canvas px-2 text-2xs uppercase tracking-wide text-ink-400">
                    {locked ? "This phone" : "or"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={busy}
                onClick={() => void biometricUnlock()}
              >
                {busy ? "Waiting…" : `Unlock with ${label}`}
              </button>
              <p className="hint mt-2">
                {label} is available on this phone only. Desktop sign-in still uses email and
                password.
              </p>
            </div>
          ) : null}

          <p className="mt-6 text-2xs leading-relaxed text-ink-400">
            This system records metadata about work performed through connected AI coding agents.
            It does not capture prompts, responses, source code, keystrokes, or screenshots.
          </p>
        </div>
      </div>

      {SHOW_DEMO ? (
      <div className="hidden flex-col justify-center border-line bg-slate-950 px-10 py-12 dark:border-l dark:bg-black/40 lg:flex">
        <p className="label text-brand-200">Local demo accounts</p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Four portals, one dataset
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          Every screen, API, and query is scoped by role. Developers see exactly what is collected
          about them — no more, no less.
        </p>
        <ul className="mt-8 space-y-2">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-brand-400/50 hover:bg-white/10"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-white">{d.role}</span>
                  <span className="font-mono text-2xs text-slate-500">{d.email}</span>
                </div>
                <p className="mt-0.5 text-2xs text-slate-400">{d.desc}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
      ) : (
        <div className="hidden flex-col justify-center border-line bg-slate-950 px-10 py-12 dark:border-l dark:bg-black/40 lg:flex">
          <p className="label text-brand-200">Techlio</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Agent activity, not timekeeping</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            Every screen, API, and query is scoped by role. Developers see exactly what is collected
            about them — no more, no less. Missing telemetry is never treated as inactivity.
          </p>
        </div>
      )}
    </div>
  );
}
