"use client";

import { initialsOf } from "@/lib/format";

export function UserAvatar({
  name,
  src,
  size = "md",
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "h-8 w-8 text-2xs" : size === "lg" ? "h-20 w-20 text-lg" : "h-10 w-10 text-xs";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-line ${className}`}
      />
    );
  }
  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-1 ring-line ${className}`}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
