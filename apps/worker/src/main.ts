import {
  ConfigurationError,
  loadEnvironment,
  readServerConfiguration,
} from "@airmech/config/server";
import { once } from "node:events";
import { DatabaseClient } from "@airmech/database";
import { startAuthMessageWorker } from "@airmech/queue";
import { createAuthMessageProcessor } from "./auth-message-processor";

import { createWorkerServer } from "./health-server";
import { startQueueRuntime } from "./queue-runtime";

async function bootstrap(): Promise<void> {
  const configuration = readServerConfiguration("worker", loadEnvironment());
  const settings = configuration.runtime;
  const server = createWorkerServer();
  const database = configuration.database.enabled
    ? new DatabaseClient(configuration.database, (event) => {
        process.stderr.write(
          `${JSON.stringify({ service: "worker", level: "error", ...event })}\n`,
        );
      })
    : null;
  let closing: Promise<void> | undefined;
  const queue = startQueueRuntime(configuration.redis, () => {
    shutdown(1).catch(() => {
      process.exitCode = 1;
    });
  });
  const authMessages =
    configuration.auth.enabled && configuration.redis.enabled && database
      ? startAuthMessageWorker(
          configuration.redis,
          createAuthMessageProcessor(configuration, database),
          {
            onEvent: (event) =>
              process.stderr.write(`${JSON.stringify({ service: "worker", ...event })}\n`),
            onUnavailable: () => {
              shutdown(1).catch(() => {
                process.exitCode = 1;
              });
            },
          },
        )
      : null;

  function shutdown(exitCode = 0): Promise<void> {
    if (exitCode !== 0) process.exitCode = exitCode;
    closing ??= closeResources();
    return closing;
  }

  async function closeResources(): Promise<void> {
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    timeout.unref();
    try {
      const results = await Promise.allSettled([
        queue.close(),
        authMessages?.close(),
        database?.close(),
        server.listening
          ? new Promise<void>((resolve, reject) => {
              server.close((error?: Error) => (error ? reject(error) : resolve()));
            })
          : Promise.resolve(),
      ]);
      if (results.some((result) => result.status === "rejected")) process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  }

  const stop = (): void => {
    shutdown().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await queue.ready();
    await authMessages?.ready();
    if (closing) {
      await closing;
      return;
    }
    server.listen(settings.port, settings.host);
    await once(server, "listening");
  } catch (error: unknown) {
    await shutdown(1);
    throw error;
  }

  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "worker",
      event: "process_started",
      host: settings.host,
      port: settings.port,
      environment: settings.environment,
      healthPath: "/health",
      mode: queue.enabled ? "infrastructure" : "foundation",
      activeProcessors: (queue.enabled ? 1 : 0) + (authMessages ? 1 : 0),
    })}\n`,
  );
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "worker",
      event: "startup_failed",
      code: error instanceof ConfigurationError ? "INVALID_CONFIGURATION" : "WORKER_STARTUP_FAILED",
      message:
        error instanceof ConfigurationError
          ? error.message
          : "The worker could not start. Check the runtime configuration and available port.",
    })}\n`,
  );
  process.exitCode = 1;
});
