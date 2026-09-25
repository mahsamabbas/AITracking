import { pool } from "@techlio/server-core";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

// One pool per process, shared with server-core: same connection string and
// SSL settings, and half the connections against the database's limit.

export const db = drizzle(pool, { schema });
