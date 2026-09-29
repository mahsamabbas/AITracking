"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConnectorSetupPhase } from "@/lib/connector-local";
import { connectorOnboardingActive, developerNeedsLocalConnector, syncConnectorViewer } from "@/lib/connector-setup";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL, ROLE_SCOPE } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { PageHeader, PageIntro } from "@/components/ui/PageHeader";
import { PlatformOrgTabBar } from "@/components/PlatformOrgTabBar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { InstallAppButton } from "@/components/InstallAppButton";
import { BRAND } from "@/lib/brand";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { UserAvatar } from "@/components/UserAvatar";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  icon: React.ReactNode;
  match?: (path: string) => boolean;
}

const icon = (d: string) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const NAV: NavItem[] = [
  {
    href: "/platform",
    label: "Platform",
    roles: ["super_admin"],
    icon: icon("M3 17V7l5-3 5 3v10M13 17V10l4 2v5M6 9h1M6 12h1M9 9h1M9 12h1M2 17h16"),
    match: (p) => p === "/platform" || p.startsWith("/platform/"),
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
    href: "/settings",
    label: "Settings",
    roles: ["manager", "administrator", "developer", "auditor", "super_admin"],
    icon: icon("M10 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 6v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2Z"),
    match: (p) => p === "/settings" || p.startsWith("/settings/"),
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
  const { user, logout, ready, token } = useAuth();
  // Only developers install a connector; other roles never probe for one.
  const { phase: connectorPhase, installedHere } = useConnectorSetupPhase(
    4_000,
    developerNeedsLocalConnector(user?.role, user?.developerId),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    syncConnectorViewer(user?.developerId, token);
  }, [user?.developerId, token]);

  const onboardingLocked = Boolean(
    user &&
      developerNeedsLocalConnector(user.role, user.developerId) &&
      connectorOnboardingActive(connectorPhase),
  );

  const nav = useMemo(() => {
    let items = NAV.filter((item) => !user || item.roles.includes(user.role)).map(
      (item) =>
        item.href === "/employees/self" && user?.developerId
          ? { ...item, href: `/employees/${user.developerId}` }
          : item,
    );
    if (onboardingLocked) {
      const allowed = new Set(["/setup-connector", "/my-connectors", "/policy", "/settings"]);
      items = items.filter((item) => allowed.has(item.href));
    } else if (!(developerNeedsLocalConnector(user?.role, user?.developerId) && installedHere === false)) {
      // Keep the install tab while no connector answers on this computer,
      // even if another of this person's connectors is still reporting.
      items = items.filter((item) => item.href !== "/setup-connector");
    }
    return items;
  }, [user, onboardingLocked, installedHere]);

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
    // The header mounts once the session is ready and changes with the route.
  }, [ready, path]);

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{BRAND.name}</p>
          <p className="truncate text-2xs text-ink-500">{BRAND.tagline}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-5 pb-3 sm:hidden">
        <span className="text-2xs font-medium uppercase tracking-[0.07em] text-ink-500">Timezone</span>
        <TimezoneSelect compact />
      </div>

      <p className="px-6 pb-2 pt-1 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-400">Menu</p>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain px-3" aria-label="Main">
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
              className={`relative flex min-h-[40px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-fast ${
                onboardingLocked && item.href === "/setup-connector" && !active
                  ? "bg-amber-50 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700"
                  : ""
              } ${
                active
                  ? "bg-brand-50 text-brand-700 shadow-[inset_0_0_0_1px_rgb(var(--color-brand-100))] dark:bg-brand-100 dark:text-brand-900 dark:shadow-none"
                  : "text-ink-500 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-white/5"
              }`}
            >
              {active ? (
                <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-brand-solid" />
              ) : null}
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-fast ${
                  active ? "bg-brand-solid text-white shadow-sm" : "text-ink-400"
                }`}
              >
                {item.icon}
              </span>
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
        <div className="rounded-xl border border-line/70 bg-raised p-3 dark:bg-white/[0.03]">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-500">
            {ROLE_LABEL[user.role]}
          </p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-500">
            {ROLE_SCOPE[user.role]}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2.5 px-1">
          <UserAvatar name={user.displayName} src={user.avatarUrl} size="sm" />
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
    <div className="flex min-h-[100dvh] max-w-full overflow-x-clip bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink-900 focus:shadow-modal"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-[100dvh] w-[240px] shrink-0 flex-col overflow-hidden border-r border-line/80 bg-card/85 backdrop-blur-xl lg:flex">
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
          <aside className="drawer-in absolute left-0 top-0 flex h-full w-[min(280px,85vw)] flex-col overflow-hidden bg-card pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-modal">
            {sidebarInner}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          ref={headerRef}
          className="sticky top-0 z-30 border-b border-line/80 bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150"
        >
          <div className={`mx-auto w-full ${maxWidth} px-4 py-3.5 sm:px-6 sm:py-4 lg:px-8`}>
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
              actions={actions}
              utilities={
                <>
                  <InstallAppButton compact />
                  {/* Phones: timezone lives in the menu drawer so the title has room. */}
                  <span className="hidden sm:contents">
                    <TimezoneSelect compact />
                  </span>
                  <ThemeToggle />
                </>
              }
            />
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={`mx-auto w-full min-w-0 overflow-x-clip ${maxWidth} flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8`}
        >
          {/* Keyed by route so only the content animates in, never the shell. */}
          <div key={path} className="enter min-w-0 max-w-full">
            <PageIntro subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
            <PlatformOrgTabBar />
            {children}
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
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
