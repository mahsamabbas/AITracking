"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";

type Variant = "primary" | "ghost" | "quiet";

const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  quiet: "btn-quiet",
};

export function Button({
  variant = "primary",
  loading = false,
  loadingLabel,
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  /** Shown while loading; defaults to children when it is a string. */
  loadingLabel?: ReactNode;
}) {
  const label =
    loading && loadingLabel !== undefined
      ? loadingLabel
      : loading && typeof children === "string"
        ? children
        : children;

  return (
    <button
      type={type}
      {...rest}
      disabled={Boolean(disabled) || loading}
      aria-busy={loading || undefined}
      className={`${VARIANT[variant]} ${className}`.trim()}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{label}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
