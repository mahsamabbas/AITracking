"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatNumber, formatRelative } from "@/lib/format";

export interface PlatformOrganization {
  id: string;
  name: string;
  timezone: string;
  logoUrl: string | null;
  disabled: boolean;
  administrators: number;
  users: number;
  employees: number;
  connectors: number;
  lastActivityAt: string | null;
}

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "—";
}

function OrgStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[4.25rem] rounded-lg border border-line/80 bg-card px-3 py-2 text-center shadow-sm">
      <p className="text-base font-semibold tabular-nums leading-tight text-ink-900 sm:text-lg">{value}</p>
      <p className="mt-0.5 text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}

function OrgActionsMenu({
  org,
  busy,
  onAddAdmin,
  onToggle,
  onUploadLogo,
}: {
  org: PlatformOrganization;
  busy: boolean;
  onAddAdmin: (org: PlatformOrganization) => void;
  onToggle: (org: PlatformOrganization) => void;
  onUploadLogo: (org: PlatformOrganization, file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="btn-ghost h-9 w-9 shrink-0 p-0"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        disabled={busy}
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="list" className="h-4 w-4" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[11rem] overflow-hidden rounded-xl border border-line bg-card py-1 shadow-2"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-raised disabled:opacity-50"
            disabled={busy || org.disabled}
            onClick={() => {
              setOpen(false);
              onAddAdmin(org);
            }}
          >
            <Icon name="person" className="h-4 w-4 text-ink-400" />
            Add administrator
          </button>
          <label
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-raised"
          >
            <Icon name="file" className="h-4 w-4 text-ink-400" />
            Upload logo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadLogo(org, file);
                e.target.value = "";
                setOpen(false);
              }}
            />
          </label>
          <div className="my-1 border-t border-line" role="none" />
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised ${
              org.disabled ? "text-teal-700 dark:text-teal-300" : "text-rose-700 dark:text-rose-300"
            }`}
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onToggle(org);
            }}
          >
            <Icon name="shield" className="h-4 w-4 opacity-70" />
            {org.disabled ? "Enable organisation" : "Disable organisation"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformOrgList({
  organizations,
  busy,
  onAddAdmin,
  onToggle,
  onUploadLogo,
}: {
  organizations: PlatformOrganization[];
  busy: boolean;
  onAddAdmin: (org: PlatformOrganization) => void;
  onToggle: (org: PlatformOrganization) => void;
  onUploadLogo: (org: PlatformOrganization, file: File) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {organizations.map((o) => (
        <li key={o.id}>
          <article
            className={`group flex flex-col gap-4 px-4 py-4 transition-colors sm:px-5 sm:py-5 lg:flex-row lg:items-center lg:gap-6 ${
              o.disabled ? "opacity-75" : "hover:bg-raised/60"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.logoUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl object-contain ring-1 ring-line bg-card p-0.5 shadow-sm"
                />
              ) : (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-sm font-semibold text-brand-700 ring-1 ring-brand-200/80 dark:from-brand-950 dark:to-brand-900 dark:text-brand-300 dark:ring-brand-800"
                  aria-hidden
                >
                  {orgInitials(o.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate text-base font-semibold text-ink-900">{o.name}</h4>
                  {o.disabled ? (
                    <Badge tone="bad">Disabled</Badge>
                  ) : (
                    <Badge tone="ok" dot>
                      Active
                    </Badge>
                  )}
                </div>
                <p className="hint mt-1 line-clamp-2 sm:line-clamp-1">
                  <span className="font-medium text-ink-500">{o.timezone}</span>
                  <span className="text-ink-300 dark:text-ink-500"> · </span>
                  {formatNumber(o.users)} portal accounts
                  <span className="text-ink-300 dark:text-ink-500"> · </span>
                  {formatNumber(o.administrators)} admins
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:shrink-0">
              <OrgStat label="People" value={formatNumber(o.employees)} />
              <OrgStat label="Connectors" value={formatNumber(o.connectors)} />
              <div className="min-w-[5.5rem] rounded-lg border border-line/80 bg-card px-3 py-2 text-center shadow-sm">
                <p className="text-sm font-medium leading-tight text-ink-900">
                  {o.lastActivityAt ? formatRelative(o.lastActivityAt) : "—"}
                </p>
                <p className="mt-0.5 text-2xs font-medium uppercase tracking-wide text-ink-400">Last activity</p>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:ml-auto lg:shrink-0">
              <Link
                href={`/platform/${o.id}/overview`}
                className="btn-primary h-9 flex-1 px-4 text-xs sm:flex-none sm:min-w-[9.5rem]"
              >
                Open workspace
              </Link>
              <OrgActionsMenu
                org={o}
                busy={busy}
                onAddAdmin={onAddAdmin}
                onToggle={onToggle}
                onUploadLogo={onUploadLogo}
              />
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
