/**
 * Production dashboard + API hosts currently deployed on Vercel.
 * Packaged builds freeze these via esbuild `--define`. Runtime `TECHLIO_*`
 * env (written on install/upgrade) wins when not compiled away.
 */
function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const LIVE_API = "https://techlio-pulse-api.vercel.app";
const LIVE_DASHBOARD = "https://techlio-pulse.vercel.app";

export const PACKAGED_API_URL = stripSlash(process.env.TECHLIO_API_URL ?? LIVE_API);

export const PACKAGED_DASHBOARD_ORIGIN = stripSlash(
  (process.env.TECHLIO_DASHBOARD_ORIGINS ?? LIVE_DASHBOARD).split(",")[0]!.trim(),
);

export const PACKAGED_DASHBOARD_ORIGINS = (
  process.env.TECHLIO_DASHBOARD_ORIGINS ?? LIVE_DASHBOARD
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .join(",");

export const KNOWN_API_BASES = [PACKAGED_API_URL].filter((url, i, all) => all.indexOf(url) === i);
