import type { ServerConfiguration } from "@airmech/config/server";
import { Module, type DynamicModule } from "@nestjs/common";

import { HealthController } from "./modules/health/health.controller.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";

@Module({
  controllers: [HealthController],
})
export class AppModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return { module: AppModule, imports: [InfrastructureModule.register(configuration)] };
  }
}
