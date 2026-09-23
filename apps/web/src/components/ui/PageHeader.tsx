/**
 * Page title block used by AppShell: breadcrumbs, title, subtitle, and an
 * actions slot. Pages pass these through AppShell rather than rendering their
 * own headings, so every screen has the same hierarchy.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  leading,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {leading}
      <div className="min-w-0 flex-1">
        {breadcrumbs}
        <h1 className="h-page truncate">{title}</h1>
        {subtitle ? <p className="muted mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
