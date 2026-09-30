"use client";

import { usePlatformOrgOptional } from "./platform-org";

/** Route helpers that keep drill-down links inside a platform org workspace. */
export function useAppPaths() {
  const platform = usePlatformOrgOptional();
  const base = platform?.basePath ?? "";

  return {
    platform,
    resolvePath(path: string) {
      if (!platform || !path.startsWith("/")) return path;
      if (path.startsWith("/platform/")) return path;
      if (path === "/") return `${base}/overview`;
      return `${base}${path}`;
    },
  };
}
