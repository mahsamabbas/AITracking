import { Module } from "@nestjs/common";
import { ArchivesController, MaintenanceController } from "./retention.controller.js";
import { EventsController } from "./events.controller.js";
import { DashboardController } from "./dashboard.controller.js";
import { AnalyticsController } from "./analytics.controller.js";
import { ConnectorsController } from "./connectors.controller.js";
import { ProjectsController } from "./projects.controller.js";
import { SessionsController } from "./sessions.controller.js";
import { ExportsController } from "./exports.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { OrgController } from "./org.controller.js";
import { HealthController } from "./health.controller.js";
import { PlatformController } from "./platform.controller.js";
import { ProfileController } from "./profile.controller.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    OrgController,
    EventsController,
    DashboardController,
    AnalyticsController,
    ConnectorsController,
    ProjectsController,
    SessionsController,
    ExportsController,
    PlatformController,
    ProfileController,
    MaintenanceController,
    ArchivesController,
  ],
})
export class AppModule {}
