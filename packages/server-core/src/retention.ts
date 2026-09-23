import { and, eq, lt } from "drizzle-orm";
import { db } from "./db.js";
import { activityEvents, auditLog } from "./schema.js";

export async function purgeEventsOlderThan(
  organizationId: string,
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(activityEvents)
    .where(
      and(
        eq(activityEvents.organizationId, organizationId),
        lt(activityEvents.occurredAt, cutoff),
      ),
    )
    .returning({ eventId: activityEvents.eventId });
  if (deleted.length > 0) {
    await db.insert(auditLog).values({
      organizationId,
      action: "retention.purge",
      detail: { count: deleted.length, cutoff: cutoff.toISOString() },
      createdAt: new Date(),
    });
  }
  return deleted.length;
}
