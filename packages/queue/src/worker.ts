import { UnrecoverableError, Worker } from "bullmq";
import type { Job } from "bullmq";

import { createRedisConnection } from "./connection";
import type { RedisConfiguration } from "./connection";
import {
  DEFAULT_QUEUE_PREFIX,
  QUEUE_OPERATION_TIMEOUT_MS,
  QUEUE_SHUTDOWN_TIMEOUT_MS,
  QueueInfrastructureError,
  SYSTEM_HEALTHCHECK_JOB,
  SYSTEM_QUEUE_NAME,
  validateQueuePrefix,
  validateRequestId,
  withQueueTimeout,
} from "./policy";
import type { QueueEventHandler, SystemHealthcheckData, SystemHealthcheckResult } from "./policy";

export type HealthcheckProcessor = (
  data: SystemHealthcheckData,
) => Promise<SystemHealthcheckResult>;

export async function processSystemJob(
  job: Pick<Job<unknown>, "name" | "data">,
  processor?: HealthcheckProcessor,
): Promise<SystemHealthcheckResult> {
  const data = job.data;
  if (
    job.name !== SYSTEM_HEALTHCHECK_JOB ||
    typeof data !== "object" ||
    data === null ||
    !("requestId" in data)
  ) {
    throw new UnrecoverableError("The infrastructure job has an invalid name or payload.");
  }
  try {
    validateRequestId(data.requestId);
  } catch {
    throw new UnrecoverableError("The infrastructure job has an invalid name or payload.");
  }
  const payload = { requestId: data.requestId };
  if (processor !== undefined) {
    try {
      return await processor(payload);
    } catch (error: unknown) {
      // BullMQ persists failedReason. Keep provider errors and secrets out of Redis.
      if (error instanceof UnrecoverableError) {
        throw new UnrecoverableError("The infrastructure job cannot be processed.");
      }
      throw new QueueInfrastructureError("JOB_PROCESSING_FAILED");
    }
  }
  return { status: "ok", requestId: payload.requestId, processedAt: new Date().toISOString() };
}

export interface SystemQueueWorkerOptions {
  readonly prefix?: string;
  readonly onEvent?: QueueEventHandler;
  readonly onUnavailable?: () => void;
  readonly healthcheckProcessor?: HealthcheckProcessor;
}

export interface SystemQueueWorker {
  ready(): Promise<void>;
  close(): Promise<void>;
}

export function startSystemQueueWorker(
  configuration: RedisConfiguration,
  options: SystemQueueWorkerOptions = {},
): SystemQueueWorker {
  const onEvent = options.onEvent ?? (() => undefined);
  const prefix = validateQueuePrefix(options.prefix ?? DEFAULT_QUEUE_PREFIX);
  const connection = createRedisConnection(configuration, "worker", onEvent, reportUnavailable);
  const worker = new Worker<unknown, SystemHealthcheckResult>(
    SYSTEM_QUEUE_NAME,
    (job) => processSystemJob(job, options.healthcheckProcessor),
    {
      connection,
      prefix,
      concurrency: 2,
      maxStalledCount: 1,
      autorun: false,
      runRetryDelay: 1_000,
    },
  );
  let closing: Promise<void> | undefined;
  let stopping = false;
  let started = false;
  let unavailable = false;

  async function closeConnections(force = false): Promise<void> {
    stopping = true;
    try {
      await withQueueTimeout(worker.close(force), QUEUE_SHUTDOWN_TIMEOUT_MS);
    } finally {
      connection.disconnect();
    }
  }

  function reportUnavailable(): void {
    if (stopping || unavailable) return;
    unavailable = true;
    onEvent({ event: "queue_unavailable" });
    closing ??= closeConnections(true);
    closing.catch(() => onEvent({ event: "queue_unavailable" }));
    options.onUnavailable?.();
  }

  // Finite reconnect attempts end the connection. Stop BullMQ's processing loop too.
  connection.on("end", reportUnavailable);
  worker.on("error", () => {
    onEvent({ event: "redis_error" });
    if (connection.status === "end") reportUnavailable();
  });
  worker.on("completed", (job) =>
    onEvent({ event: "job_completed", ...(job.id === undefined ? {} : { jobId: job.id }) }),
  );
  worker.on("failed", (job) =>
    onEvent({
      event: "job_failed",
      ...(job?.id === undefined ? {} : { jobId: job.id }),
      ...(job === undefined ? {} : { attemptsMade: job.attemptsMade }),
    }),
  );

  return {
    async ready() {
      if (stopping || unavailable) throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
      try {
        await withQueueTimeout(worker.waitUntilReady(), QUEUE_OPERATION_TIMEOUT_MS);
        if (!started) {
          started = true;
          worker.run().catch(reportUnavailable);
        }
      } catch {
        reportUnavailable();
        throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
      }
    },
    close() {
      stopping = true;
      closing ??= closeConnections();
      return closing;
    },
  };
}
