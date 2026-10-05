import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import { createRedisConnection, requireRedisConfiguration } from "./connection";
import type { RedisConfiguration } from "./connection";
import {
  DEFAULT_QUEUE_PREFIX,
  QUEUE_OPERATION_TIMEOUT_MS,
  QUEUE_SHUTDOWN_TIMEOUT_MS,
  QueueInfrastructureError,
  SYSTEM_HEALTHCHECK_JOB,
  SYSTEM_QUEUE_NAME,
  systemJobId,
  systemJobOptions,
  validateQueuePrefix,
  validateRequestId,
  withQueueTimeout,
} from "./policy";
import type { QueueEventHandler, SystemHealthcheckData, SystemHealthcheckResult } from "./policy";

export interface SystemQueueProducerOptions {
  readonly prefix?: string;
  readonly onEvent?: QueueEventHandler;
}

export class SystemQueueProducer {
  #connection: Redis | undefined;
  #queue:
    | Queue<SystemHealthcheckData, SystemHealthcheckResult, typeof SYSTEM_HEALTHCHECK_JOB>
    | undefined;
  readonly #configuration: RedisConfiguration;
  private closing: Promise<void> | undefined;
  private closed = false;
  private readonly prefix: string;
  private readonly onEvent: QueueEventHandler;

  constructor(configuration: RedisConfiguration, options: SystemQueueProducerOptions = {}) {
    this.#configuration = configuration;
    this.prefix = validateQueuePrefix(options.prefix ?? DEFAULT_QUEUE_PREFIX);
    this.onEvent = options.onEvent ?? (() => undefined);
    // Configuration is validated by @airmech/config; no socket is created on startup.
    if (configuration.enabled) requireRedisConfiguration(configuration);
  }

  async enqueueHealthcheck(
    requestId: string,
    idempotencyKey = requestId,
  ): Promise<{ jobId: string }> {
    if (this.closed) throw new QueueInfrastructureError("QUEUE_CLOSED");
    validateRequestId(requestId);
    const jobId = systemJobId(idempotencyKey);
    const queue = this.getQueue();
    try {
      await withQueueTimeout(
        (async () => {
          await queue.waitUntilReady();
          await queue.add(SYSTEM_HEALTHCHECK_JOB, { requestId }, systemJobOptions(idempotencyKey));
        })(),
        QUEUE_OPERATION_TIMEOUT_MS,
      );
      return { jobId };
    } catch {
      // Prevent an offline readiness wait from enqueueing long after its caller failed.
      this.#connection?.disconnect();
      this.onEvent({ event: "queue_unavailable" });
      throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
    }
  }

  close(): Promise<void> {
    this.closed = true;
    this.closing ??= this.closeConnections();
    return this.closing;
  }

  private getQueue(): Queue<
    SystemHealthcheckData,
    SystemHealthcheckResult,
    typeof SYSTEM_HEALTHCHECK_JOB
  > {
    requireRedisConfiguration(this.#configuration);
    if (this.#queue !== undefined && this.#connection?.status === "end") {
      // Reuse healthy connections; a caller-initiated retry may reopen an exhausted one.
      this.#queue.close().catch(() => this.onEvent({ event: "redis_error" }));
      this.#queue = undefined;
      this.#connection = undefined;
    }
    if (this.#queue === undefined) {
      this.#connection = createRedisConnection(this.#configuration, "producer", this.onEvent);
      this.#queue = new Queue<
        SystemHealthcheckData,
        SystemHealthcheckResult,
        typeof SYSTEM_HEALTHCHECK_JOB
      >(SYSTEM_QUEUE_NAME, { connection: this.#connection, prefix: this.prefix });
      this.#queue.on("error", () => this.onEvent({ event: "redis_error" }));
    }
    return this.#queue;
  }

  private async closeConnections(): Promise<void> {
    try {
      if (this.#queue !== undefined) {
        await withQueueTimeout(this.#queue.close(), QUEUE_SHUTDOWN_TIMEOUT_MS);
      }
    } finally {
      this.#connection?.disconnect();
    }
  }
}
