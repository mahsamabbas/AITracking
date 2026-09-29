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
    home: platform ? `${base}/overview` : "/",
    employees: platform ? `${base}/employees` : "/employees",
    employee: (id: string) => (platform ? `${base}/employees/${id}` : `/employees/${id}`),
    employeeSessions: (id: string) =>
      platform ? `${base}/employees/${id}/sessions` : `/employees/${id}/sessions`,
    employeeTool: (id: string, provider: string) =>
      platform ? `${base}/employees/${id}/tools/${provider}` : `/employees/${id}/tools/${provider}`,
    session: (id: string) => (platform ? `${base}/sessions/${id}` : `/sessions/${id}`),
    hourly: (id: string) => (platform ? `${base}/hourly/${id}` : `/hourly/${id}`),
    connectors: platform ? `${base}/connectors` : "/connectors",
    leaderboard: platform ? `${base}/leaderboard` : "/leaderboard",
  };
}
