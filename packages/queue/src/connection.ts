import { ConfigurationError } from "@airmech/config/server";
import type { ServerConfiguration } from "@airmech/config/server";
import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";

import { QueueInfrastructureError, REDIS_MAX_RECONNECT_ATTEMPTS } from "./policy";
import type { QueueEventHandler } from "./policy";

export type RedisConfiguration = ServerConfiguration["redis"];

export function redisConnectionOptions(
  role: "producer" | "worker",
): RedisOptions & { readonly replyMapping: "legacy" } {
  return {
    replyMapping: "legacy",
    connectTimeout: 3_000,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    enableReadyCheck: true,
    retryStrategy: (attempt) =>
      attempt <= REDIS_MAX_RECONNECT_ATTEMPTS ? Math.min(attempt * 100, 1_000) : null,
    ...(role === "producer" ? { commandTimeout: 3_000 } : {}),
  };
}

export function requireRedisConfiguration(configuration: RedisConfiguration): string {
  if (!configuration.enabled) throw new QueueInfrastructureError("QUEUE_DISABLED");
  if (configuration.url === null) throw new ConfigurationError("REDIS_URL");
  return configuration.url;
}

export function createRedisConnection(
  configuration: RedisConfiguration,
  role: "producer" | "worker",
  onEvent: QueueEventHandler,
  onExhausted?: () => void,
): Redis {
  const options = redisConnectionOptions(role);
  const url = requireRedisConfiguration(configuration);
  let connection: Redis;
  try {
    connection = new Redis(url, {
      ...options,
      retryStrategy: (attempt) => {
        if (attempt > REDIS_MAX_RECONNECT_ATTEMPTS) {
          onExhausted?.();
          return null;
        }
        return Math.min(attempt * 100, 1_000);
      },
    });
  } catch {
    throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
  }
  // Provider errors can contain connection details. Emit only trusted event fields.
  connection.on("error", () => onEvent({ event: "redis_error" }));
  return connection;
}
