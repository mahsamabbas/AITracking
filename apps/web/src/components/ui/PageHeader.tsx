/**
 * Page title block used by AppShell: breadcrumbs, title, subtitle, page
 * actions, and always-present utilities (install, timezone, theme). Pages pass
 * these through AppShell rather than rendering their own headings, so every
 * screen has the same hierarchy.
 *
 * Below `lg` the sticky header keeps only the title and utilities; AppShell
 * renders the subtitle and page actions at the top of the content instead, so
 * the header never grows into a tall column on a phone.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  utilities,
  leading,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  utilities?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="hidden lg:block">{breadcrumbs}</div>
        <h1 className="h-page truncate leading-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 hidden max-w-2xl truncate text-sm leading-snug text-ink-500 lg:block">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {actions ? (
          <div className="hidden items-center gap-2 lg:flex">{actions}</div>
        ) : null}
        {actions && utilities ? (
          <span className="hidden h-8 w-px shrink-0 bg-line lg:block" aria-hidden />
        ) : null}
        {utilities ? (
          <div className="flex items-center gap-1 rounded-xl border border-line bg-raised/80 p-1 shadow-sm dark:bg-white/[0.04]">
            {utilities}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Mobile counterpart: subtitle and page actions at the top of the content. */
export function PageIntro({
  subtitle,
  breadcrumbs,
  actions,
}: {
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  if (!subtitle && !actions && !breadcrumbs) return null;
  return (
    <div className="mb-5 space-y-3 lg:hidden">
      {breadcrumbs}
      {subtitle ? <p className="text-sm leading-snug text-ink-500">{subtitle}</p> : null}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
