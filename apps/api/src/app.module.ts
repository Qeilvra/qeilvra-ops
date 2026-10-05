import type { ServerConfiguration } from "@airmech/config/server";
import { Module, type DynamicModule } from "@nestjs/common";

import { HealthController } from "./modules/health/health.controller.js";
import { AuthModule } from "./modules/auth/auth.module.js";

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return { module: AppModule, imports: [AuthModule.register(configuration)] };
  }
}
