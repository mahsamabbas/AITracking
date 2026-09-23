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
    setLateRecalcHandler((job) => {
      void finalizeHourForDeveloper(
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
  setLateRecalcHandler((job) => {
    void queue.add("recalc", job);
  });
}
