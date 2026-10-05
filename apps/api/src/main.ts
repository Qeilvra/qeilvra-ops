import {
  ConfigurationError,
  loadEnvironment,
  readServerConfiguration,
} from "@airmech/config/server";

import { createApiApplication } from "./application.js";

async function bootstrap(): Promise<void> {
  const configuration = readServerConfiguration("api", loadEnvironment());
  const settings = configuration.runtime;
  const app = await createApiApplication(configuration);

  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);

  try {
    await app.listen(settings.port, settings.host);
  } catch (error: unknown) {
    await app.close();
    throw error;
  }

  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "api",
      event: "process_started",
      host: settings.host,
      port: settings.port,
      environment: settings.environment,
      healthPath: "/health",
    })}\n`,
  );
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "api",
      event: "startup_failed",
      code: error instanceof ConfigurationError ? "INVALID_CONFIGURATION" : "API_STARTUP_FAILED",
      message:
        error instanceof ConfigurationError
          ? error.message
          : "The API could not start. Check the runtime configuration and available port.",
    })}\n`,
  );
  process.exitCode = 1;
});
