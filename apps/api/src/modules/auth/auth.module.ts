import type { ServerConfiguration } from "@airmech/config/server";
import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import {
  ApiDatabaseService,
  InfrastructureModule,
} from "../../infrastructure/infrastructure.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { ApplicationAccessGuard } from "./auth.guard.js";
import { UserAdministrationController } from "../users/user-admin.controller.js";
import { UserAdministrationService } from "../users/user-admin.service.js";

@Module({})
export class AuthModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return {
      module: AuthModule,
      imports: [InfrastructureModule.register(configuration)],
      controllers: [AuthController, UserAdministrationController],
      providers: [
        {
          provide: AuthService,
          inject: [ApiDatabaseService],
          useFactory: (database: ApiDatabaseService) =>
            new AuthService(configuration, database.client),
        },
        {
          provide: UserAdministrationService,
          inject: [AuthService],
          useFactory: (auth: AuthService) => new UserAdministrationService(auth),
        },
        {
          provide: APP_GUARD,
          inject: [AuthService, Reflector],
          useFactory: (auth: AuthService, reflector: Reflector) =>
            new ApplicationAccessGuard(auth, reflector),
        },
      ],
      exports: [AuthService],
    };
  }
}
