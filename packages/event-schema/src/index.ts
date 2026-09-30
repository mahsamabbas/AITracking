/**
 * Activity event contract shared by the connector, API and worker.
 *
 * Evolution rules (additive only): new event types may be added to the catalog;
 * new optional metadata keys may be added with a strict schema update; breaking
 * changes require a new schema_version and a dual-read window.
 */
export * from "./catalog.js";
export * from "./event.js";
export * from "./providers.js";
