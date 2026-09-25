"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { BRAND } from "@/lib/brand";
import { PasswordField } from "@/components/ui/PasswordField";
import { Button } from "@/components/ui/Button";
import { LoginHeroCarousel } from "@/components/login/LoginHeroCarousel";
import { FIELD_LIMITS } from "@/lib/validation";
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
    <div className="grid min-h-[100dvh] max-w-full overflow-x-clip lg:grid-cols-2">
      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2">
          <InstallAppButton />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo} alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
            <div>
              <p className="text-sm font-semibold text-ink-900">{BRAND.name}</p>
              <p className="text-2xs text-ink-500">{BRAND.tagline}</p>
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
                maxLength={FIELD_LIMITS.email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="label mb-1.5 block">Password</span>
              <PasswordField
                value={password}
                maxLength={FIELD_LIMITS.password}
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
            <Button type="submit" className="w-full" loading={busy} loadingLabel="Signing in…">
              Sign in
            </Button>
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
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                loading={busy}
                loadingLabel="Waiting…"
                onClick={() => void biometricUnlock()}
              >
                {`Unlock with ${label}`}
              </Button>
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

      <div className="hidden min-h-[100dvh] min-w-0 border-l border-line lg:flex">
        <LoginHeroCarousel
          footer={
            SHOW_DEMO ? (
              <div className="rounded-xl border border-white/10 bg-black/35 p-4 backdrop-blur-sm">
                <p className="label text-indigo-200">Local demo accounts</p>
                <p className="mt-1 text-2xs text-slate-400">Four portals, one dataset — tap to fill the form.</p>
                <ul className="scroll-y-sm mt-3 space-y-2 pr-1">
                  {DEMO.map((d) => (
                    <li key={d.email}>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(d.email);
                          setPassword(d.password);
                        }}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:border-brand-400/50 hover:bg-white/10"
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
            ) : null
          }
        />
      </div>
    </div>
  );
}
