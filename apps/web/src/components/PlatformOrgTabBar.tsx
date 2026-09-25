"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "@/lib/use-api";
import { usePlatformOrg, usePlatformOrgOptional } from "@/lib/platform-org";

const TABS = [
  { segment: "/overview", label: "Overview" },
  { segment: "/employees", label: "Employees" },
  { segment: "/leaderboard", label: "Leaderboard" },
  { segment: "/connectors", label: "Connectors" },
  { segment: "/users", label: "Access" },
  { segment: "/audit", label: "Audit" },
  { segment: "/policy", label: "Policy" },
  { segment: "/settings", label: "Settings" },
] as const;

export function PlatformOrgTabBar() {
  const ctx = usePlatformOrgOptional();
  const path = usePathname();
  if (!ctx) return null;

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200/80 bg-gradient-to-r from-brand-50/90 to-slate-50 px-4 py-3 dark:border-brand-900/50 dark:from-brand-950/40 dark:to-slate-950/40">
        <span className="inline-flex h-7 items-center rounded-md bg-brand-600 px-2 text-2xs font-semibold uppercase tracking-wide text-white">
          Platform
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">
            {ctx.orgName ?? "Organisation workspace"}
          </p>
          <p className="text-2xs text-ink-500">
            Inspecting this tenant as platform operator — same dashboards org admins see (read-only).
          </p>
        </div>
        <Link href="/platform" className="btn-ghost h-8 shrink-0 text-xs">
          ← All organisations
        </Link>
      </div>
      <nav
        className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-card p-1"
        aria-label="Organisation workspace"
      >
        {TABS.map((tab) => {
          const href = ctx.path(tab.segment);
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-ink-700 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-white/5"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Loads organisation title for the platform workspace chrome. */
export function PlatformOrgMetaLoader() {
  const { orgId, setOrgName } = usePlatformOrg();
  const { token } = useAuth();
  const meta = useApi<{ organization: { name: string } }>(
    token ? `/v1/platform/organizations/${orgId}` : null,
  );

  useEffect(() => {
    if (meta.data?.organization.name) setOrgName(meta.data.organization.name);
  }, [meta.data?.organization.name, setOrgName]);

  return null;
}
