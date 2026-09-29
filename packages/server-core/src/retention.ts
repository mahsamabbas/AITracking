/**
 * Data retention (see retention/policy.ts): hourly summaries, verified
 * archives in object storage, and bounded purges. Replaces the old
 * purgeEventsOlderThan, which deleted raw events with no summary or archive.
 */
export * from "./retention/policy.js";
export * from "./retention/payload.js";
export * from "./retention/hourly-store.js";
export * from "./retention/rollup.js";
export * from "./retention/archive-store.js";
export * from "./retention/archive.js";
export * from "./retention/maintenance.js";
