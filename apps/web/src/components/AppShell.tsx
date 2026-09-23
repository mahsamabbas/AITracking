"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectorSetupPhase } from "@/lib/connector-local";
import { developerNeedsLocalConnector } from "@/lib/connector-setup";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL, ROLE_SCOPE } from "@/lib/permissions";
import { initialsOf } from "@/lib/format";
import type { Role } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BiometricSetup } from "@/components/BiometricSetup";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  icon: React.ReactNode;
  match?: (path: string) => boolean;
}

const icon = (d: string) => (
  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV: NavItem[] = [
  {
    // Multi-tenant console: the only screen a platform super admin sees.
    href: "/platform",
    label: "Organizations",
    roles: ["super_admin"],
    icon: icon("M3 17V7l5-3 5 3v10M13 17V10l4 2v5M6 9h1M6 12h1M9 9h1M9 12h1M2 17h16"),
  },
  {
    href: "/",
    label: "Overview",
    roles: ["manager", "administrator", "developer"],
    icon: icon("M3 10.5 10 4l7 6.5M5 9.5V16h10V9.5"),
    match: (p) => p === "/",
  },
  {
    // Developers get the same analytics surface, scoped to themselves.
    href: "/employees/self",
    label: "My activity",
    roles: ["developer"],
    icon: icon("M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5"),
    match: (p) => p.startsWith("/employees") || p.startsWith("/sessions"),
  },
  {
    href: "/employees",
    label: "Employees",
    roles: ["manager", "administrator"],
    icon: icon("M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M13.5 8.5a2 2 0 1 0 0-4M14 12c2 .3 3.5 1.7 3.5 4"),
    match: (p) => p.startsWith("/employees") || p.startsWith("/sessions"),
  },
  {
    // Other people's AI usage: administrators and managers only (API enforces it too).
    href: "/leaderboard",
    label: "Leaderboard",
    roles: ["manager", "administrator"],
    icon: icon("M6.5 17v-5h-3v5M11.5 17V7h-3v10M16.5 17v-8h-3v8M3 17h14"),
  },
  {
    href: "/setup-connector",
    label: "Install agent",
    roles: ["developer"],
    icon: icon("M10 3 4 6v8l6 3 6-3V6l-6-3Zm0 2.2 4 2v4.6l-4 2-4-2V7.2l4-2Z"),
  },
  {
    href: "/my-connectors",
    label: "My connectors",
    roles: ["developer"],
    icon: icon("M7 3v4M13 3v4M5.5 7h9v4a4.5 4.5 0 0 1-9 0V7ZM10 15.5V18"),
  },
  {
    href: "/connectors",
    label: "Connectors",
    roles: ["administrator", "manager", "auditor"],
    icon: icon("M7 3v4M13 3v4M5.5 7h9v4a4.5 4.5 0 0 1-9 0V7ZM10 15.5V18"),
  },
  {
    href: "/users",
    label: "Access",
    roles: ["administrator"],
    icon: icon("M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5"),
  },
  {
    href: "/audit",
    label: "Audit",
    roles: ["auditor", "administrator"],
    icon: icon("M5 3h7l3 3v11H5V3ZM12 3v3h3M7.5 10h5M7.5 13h5"),
  },
  {
    href: "/policy",
    label: "Policy",
    roles: ["manager", "administrator", "auditor", "developer"],
    icon: icon("M10 3 4 5.5v4c0 3.6 2.5 6.6 6 7.5 3.5-.9 6-3.9 6-7.5v-4L10 3Z"),
  },
];

function isActive(path: string, item: NavItem): boolean {
  if (item.match) return item.match(path);
  return path === item.href || path.startsWith(`${item.href}/`);
}

export function AppShell({
  children,
  title,
  subtitle,
  breadcrumbs,
  actions,
  maxWidth = "max-w-[1440px]",
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
}) {
  const path = usePathname();
  const { user, logout, ready } = useAuth();
  const { phase: connectorPhase } = useConnectorSetupPhase(4_000);
  const [menuOpen, setMenuOpen] = useState(false);

  const onboardingLocked = Boolean(
    user &&
      developerNeedsLocalConnector(user.role, user.developerId) &&
      connectorPhase !== "loading" &&
      connectorPhase !== "ready",
  );

  const nav = useMemo(() => {
    let items = NAV.filter((item) => !user || item.roles.includes(user.role)).map(
      (item) =>
        item.href === "/employees/self" && user?.developerId
          ? { ...item, href: `/employees/${user.developerId}` }
          : item,
    );
    if (onboardingLocked) {
      const allowed = new Set(["/setup-connector", "/my-connectors", "/policy"]);
      items = items.filter((item) => allowed.has(item.href));
    } else {
      items = items.filter((item) => item.href !== "/setup-connector");
    }
    return items;
  }, [user, onboardingLocked]);

  useEffect(() => setMenuOpen(false), [path]);

  // Publish the sticky header's height so filter bars can stick right below it.
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () =>
      document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  });

  if (path === "/login") return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas">
        <p className="muted">Loading your workspace…</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-canvas">
        <p className="muted">Redirecting to sign in…</p>
      </div>
    );
  }

  const sidebarInner = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-solid text-sm font-bold text-white">
          T
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">Techlio</p>
          <p className="truncate text-2xs text-ink-500">AI activity monitoring</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain px-3" aria-label="Main">
        {nav.map((item) => {
          const active = isActive(path, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-onboarding={
                item.href === "/my-connectors"
                  ? "onboard-nav-connectors"
                  : item.href === "/setup-connector"
                    ? "onboard-nav-install"
                    : undefined
              }
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-fast ${
                onboardingLocked && item.href === "/setup-connector" && !active
                  ? "bg-amber-50 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700"
                  : ""
              } ${
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200"
                  : "text-ink-500 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-white/5"
              }`}
            >
              <span className={`shrink-0 ${active ? "text-brand-600" : "text-ink-400"}`}>{item.icon}</span>
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.label}</span>
              {onboardingLocked && item.href === "/setup-connector" ? (
                <span className="shrink-0 whitespace-nowrap rounded bg-amber-200/80 px-1.5 py-0.5 text-2xs font-semibold text-amber-950 dark:bg-amber-800 dark:text-amber-50">
                  Start here
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
            {ROLE_LABEL[user.role]}
          </p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-500">
            {ROLE_SCOPE[user.role]}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2.5 px-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xs font-semibold text-brand-700">
            {initialsOf(user.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink-900">{user.displayName}</p>
            <p className="truncate text-2xs text-ink-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="btn-quiet h-8"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 6V4H4v12h8v-2M9 10h8m0 0-2.5-2.5M17 10l-2.5 2.5" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[100dvh] bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-900 focus:shadow-modal"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex flex-col overflow-hidden border-r border-line bg-card lg:flex">
        {sidebarInner}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="backdrop-in absolute inset-0 bg-slate-950/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="drawer-in absolute left-0 top-0 flex h-full w-[260px] flex-col overflow-hidden bg-card shadow-modal">
            {sidebarInner}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header ref={headerRef} className="sticky top-0 z-30 border-b border-line bg-card/85 backdrop-blur">
          <div className={`mx-auto w-full ${maxWidth} px-4 py-4 sm:px-6 lg:px-8`}>
            <PageHeader
              title={title ?? "Overview"}
              subtitle={subtitle}
              breadcrumbs={breadcrumbs}
              leading={
                <button
                  type="button"
                  className="btn-ghost mt-0.5 h-11 w-11 shrink-0 px-0 lg:hidden"
                  aria-label="Open menu"
                  onClick={() => setMenuOpen(true)}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3 6h14M3 10h14M3 14h14" />
                  </svg>
                </button>
              }
              actions={
                <>
                  {actions}
                  <ThemeToggle />
                </>
              }
            />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8`}
        >
          {/* Keyed by route so only the content animates in, never the shell. */}
          <div key={path} className="enter">
            <BiometricSetup />
            {children}
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 sm:px-6 lg:px-8">
          <p className="mx-auto max-w-[1440px] text-2xs leading-relaxed text-ink-400">
            Techlio observes work performed through connected AI coding agents. It is not a
            timekeeping, payroll, or performance-rating system, and missing telemetry is never
            evidence of inactivity.
          </p>
        </footer>
      </div>
    </div>
  );
}
