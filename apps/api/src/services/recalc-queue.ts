import { finalizeHourForDeveloper, setLateRecalcHandler } from "@techlio/server-core";
import { Queue } from "bullmq";

let initialized = false;

function redisConnection(): { host: string; port: number; password?: string } {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      password: parsed.password || undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  };
}

export function initRecalcQueue(): void {
  if (initialized) return;
  initialized = true;
  if (process.env.SKIP_REDIS === "1") {
    // Without Redis there is no worker queue. Recalculate inline so a late
    // event still produces a new hourly version (FR-023) instead of silently
    // leaving the earlier snapshot as the latest.
    setLateRecalcHandler(async (job) => {
      // Returned (awaited by ingest) so it completes before the response.
      await finalizeHourForDeveloper(
        job.organizationId,
        job.developerId,
        new Date(job.hour),
        job.version,
        job.reason,
      ).catch((err) => console.error("[late-recalc inline]", err));
    });
    return;
  }
  const connection = redisConnection();
  const queue = new Queue("hourly-recalc", { connection });
  setLateRecalcHandler(async (job) => {
    // Finished jobs are removed so Redis does not keep every job forever.
    await queue
      .add("recalc", job, { removeOnComplete: 1000, removeOnFail: 5000 })
      .catch((err) => console.error("[late-recalc queue]", err));
  });
}
