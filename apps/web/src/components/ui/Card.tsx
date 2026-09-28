import Link from "next/link";
import { IconChip, type IconName, type Tone } from "./Icon";
import { InfoDot } from "./InfoDot";

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
  icon,
  tone = "brand",
  help,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  icon?: IconName;
  tone?: Tone;
  /** Longer explanation behind an (i) next to the title. */
  help?: string;
}) {
  return (
    <header className="card-head">
      <div className="flex min-w-0 flex-1 basis-[15rem] items-start gap-3">
        {icon ? <IconChip name={icon} tone={tone} /> : null}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="h-section">{title}</h3>
            {help ? <InfoDot text={help} label={`About ${title}`} /> : null}
          </div>
          {subtitle ? <p className="hint mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
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
