import { Controller, Get } from "@nestjs/common";
import { databaseCheck, schemaStatus } from "@techlio/server-core";

@Controller("v1")
export class HealthController {
  /**
   * `ok` requires a reachable database whose schema includes every migration
   * this build expects. `schema.upToDate: false` means run `pnpm db:migrate:prod`.
   */
  @Get("health")
  async health() {
    const [db, schema] = await Promise.all([databaseCheck(), schemaStatus()]);
    return {
      ok: db.ok && schema.upToDate,
      service: "techlio-api",
      database: db.ok,
      databaseHost: db.host,
      databaseSource: db.source,
      ...(db.error ? { databaseError: db.error } : {}),
      schema,
      time: new Date().toISOString(),
    };
  }
}
