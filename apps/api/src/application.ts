import "reflect-metadata";

import { readServerConfiguration, type ServerConfiguration } from "@airmech/config/server";

import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Server } from "node:http";

import { AppModule } from "./app.module.js";
import { SafeHttpExceptionFilter } from "./common/filters/safe-http-exception.filter.js";
import { assignRequestId } from "./common/request-id.js";

export async function createApiApplication(
  configuration: ServerConfiguration = readServerConfiguration("api", {}),
): Promise<INestApplication<Server>> {
  const app = await NestFactory.create<INestApplication<Server>>(
    AppModule.register(configuration),
    {
      logger: false,
      abortOnError: false,
    },
  );

  app.use(assignRequestId);
  app.useGlobalFilters(new SafeHttpExceptionFilter());

  const server = app.getHttpServer();
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  return app;
}
