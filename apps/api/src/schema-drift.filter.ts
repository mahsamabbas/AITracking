import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { EXPECTED_SCHEMA_MIGRATION, isSchemaDriftError } from "@techlio/server-core";

/**
 * When deployed code is newer than the database (migrations not applied), the
 * failing query is a Postgres "undefined column/table". Answer 503 with the fix
 * instead of a bare "Internal server error". Everything else keeps Nest's
 * default handling.
 */
@Catch()
export class SchemaDriftFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof HttpException) {
      reply.status(exception.getStatus()).send(exception.getResponse());
      return;
    }
    if (isSchemaDriftError(exception)) {
      console.error("[schema-drift]", (exception as Error)?.message);
      reply.status(503).send({
        statusCode: 503,
        error: "schema_out_of_date",
        message: `The database is missing migrations this API needs (expects ${EXPECTED_SCHEMA_MIGRATION}). Run: pnpm db:migrate:prod`,
      });
      return;
    }
    console.error(exception);
    reply.status(500).send({ statusCode: 500, message: "Internal server error" });
  }
}
