import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** Postgres numeric/bigint values arrive as strings; SQL NULL counts as 0. */
export const toNumber = (v: unknown): number => (v == null ? 0 : Number(v));

/** Like toNumber, but keeps SQL NULL as null ("not reported" is not zero). */
export const toNumberOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * `<column> IN (<ids of the team's employees in this organisation>)`.
 * `column` is the developer id column of the table being filtered.
 */
export function teamMemberFilter(column: SQL | AnyColumn, organizationId: string, team: string): SQL {
  return sql`${column} IN (SELECT id FROM employees WHERE organization_id = ${organizationId} AND team = ${team})`;
}
