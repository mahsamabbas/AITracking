"use client";

import Link, { type LinkProps } from "next/link";
import { useAppPaths } from "@/lib/app-paths";

/** Internal dashboard link that stays inside a platform org workspace when active. */
export function OrgLink({ href, ...rest }: LinkProps) {
  const { resolvePath } = useAppPaths();
  const resolved = typeof href === "string" ? resolvePath(href) : href;
  return <Link href={resolved} {...rest} />;
}
