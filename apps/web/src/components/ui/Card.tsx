import Link from "next/link";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  href,
  hrefLabel = "View all",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <header className="card-head">
      <div className="min-w-0">
        <h3 className="h-section">{title}</h3>
        {subtitle ? <p className="hint mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {href ? (
          <Link
            href={href}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            {hrefLabel} →
          </Link>
        ) : null}
      </div>
    </header>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card-body p-5 ${className}`}>{children}</div>;
}
