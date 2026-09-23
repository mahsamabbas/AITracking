import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { initRecalcQueue } from "./services/recalc-queue.js";
import { assertRuntimeConfig, devAffordancesEnabled, seedPortalUsers } from "@techlio/server-core";

async function bootstrap() {
  assertRuntimeConfig();
  initRecalcQueue();
  if (devAffordancesEnabled()) {
    // Local-only demo portal users. Never runs on a hosted runtime.
    await seedPortalUsers();
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

bootstrap();
