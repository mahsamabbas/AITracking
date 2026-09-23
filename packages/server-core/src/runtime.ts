/**
 * One switch for every development-only affordance: header-based auth, demo
 * portal users, the shared `dev-device-token`, and the demo connector keepalive.
 *
 * Fail-closed: nothing is enabled unless TECHLIO_DEV_MODE=1 is set explicitly,
 * and even then it is refused on any hosted or production runtime.
 */
export function isHostedRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.RENDER) ||
    Boolean(process.env.FLY_APP_NAME)
  );
}

export function devAffordancesEnabled(): boolean {
  return process.env.TECHLIO_DEV_MODE === "1" && !isHostedRuntime();
}

const WEAK_SECRETS = new Set([
  "techlio-dev-jwt-secret-change-me",
  "changeme",
  "secret",
]);

/**
 * Refuses to start a hosted API with a missing or placeholder JWT secret, or
 * with dev mode requested. Call once at boot.
 */
export function assertRuntimeConfig(): void {
  if (process.env.TECHLIO_DEV_MODE === "1" && isHostedRuntime()) {
    throw new Error(
      "TECHLIO_DEV_MODE=1 is not allowed on a hosted/production runtime. Remove it.",
    );
  }
  if (!devAffordancesEnabled()) {
    const secret = process.env.JWT_SECRET ?? "";
    if (secret.length < 32 || WEAK_SECRETS.has(secret)) {
      throw new Error(
        "JWT_SECRET must be set to a random value of at least 32 characters outside dev mode.",
      );
    }
  }
}

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (devAffordancesEnabled()) return "techlio-dev-jwt-secret-change-me";
  throw new Error("JWT_SECRET is not configured");
}
