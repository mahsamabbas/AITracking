"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAppPaths } from "@/lib/app-paths";

/** Internal dashboard link that stays inside a platform org workspace when active. */
export function OrgLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const { resolvePath } = useAppPaths();
  const resolved = typeof href === "string" ? resolvePath(href) : href;
  return <Link href={resolved} {...rest} />;
}
