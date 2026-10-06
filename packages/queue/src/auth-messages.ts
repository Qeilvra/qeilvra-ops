import { createHash } from "node:crypto";
import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import {
  createRedisConnection,
  requireRedisConfiguration,
  type RedisConfiguration,
} from "./connection";
import {
  DEFAULT_QUEUE_PREFIX,
  QUEUE_OPERATION_TIMEOUT_MS,
  QUEUE_SHUTDOWN_TIMEOUT_MS,
  QueueInfrastructureError,
  validateQueuePrefix,
  withQueueTimeout,
  type QueueEventHandler,
} from "./policy";

export const AUTH_MESSAGE_QUEUE = "auth-messages";
export const AUTH_MESSAGE_JOB = "auth.deliver_message";
export interface AuthMessageData {
  readonly recordId: string;
}
export type AuthMessageProcessor = (
  data: AuthMessageData,
  attempt?: number,
) => Promise<{ readonly status: "sent" | "skipped" }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Options {
  readonly prefix?: string;
  readonly onEvent?: QueueEventHandler;
}

export class AuthMessageProducer {
  readonly #configuration: RedisConfiguration;
  #connection: Redis | undefined;
  #queue: Queue<AuthMessageData> | undefined;
  #closing: Promise<void> | undefined;
  #closed = false;
  readonly #prefix: string;
  readonly #report: QueueEventHandler;
  constructor(configuration: RedisConfiguration, options: Options = {}) {
    this.#configuration = configuration;
    this.#prefix = validateQueuePrefix(options.prefix ?? DEFAULT_QUEUE_PREFIX);
    this.#report = options.onEvent ?? (() => undefined);
    if (configuration.enabled) requireRedisConfiguration(configuration);
  }
  private get configuration(): RedisConfiguration {
    return this.#configuration;
  }
  async enqueue(recordId: string): Promise<void> {
    if (!UUID.test(recordId)) throw new QueueInfrastructureError("JOB_PROCESSING_FAILED");
    if (this.#closed) throw new QueueInfrastructureError("QUEUE_CLOSED");
    requireRedisConfiguration(this.configuration);
    if (this.#queue && this.#connection?.status === "end") {
      await this.#queue.close();
      this.#queue = undefined;
      this.#connection = undefined;
    }
    if (!this.#queue) {
      this.#connection = createRedisConnection(this.configuration, "producer", this.#report);
      this.#queue = new Queue<AuthMessageData>(AUTH_MESSAGE_QUEUE, {
        connection: this.#connection,
        prefix: this.#prefix,
      });
      this.#queue.on("error", () => this.#report({ event: "redis_error" }));
    }
    const queue = this.#queue;
    try {
      await withQueueTimeout(
        (async () => {
          await queue.waitUntilReady();
          await queue.add(
            AUTH_MESSAGE_JOB,
            { recordId },
            {
              jobId: `auth-message-${createHash("sha256").update(recordId).digest("hex")}`,
              attempts: 3,
              backoff: { type: "exponential", delay: 1000 },
              removeOnComplete: { age: 86_400, count: 1000 },
              removeOnFail: { age: 604_800, count: 1000 },
            },
          );
        })(),
        QUEUE_OPERATION_TIMEOUT_MS,
      );
    } catch {
      this.#connection?.disconnect();
      this.#report({ event: "queue_unavailable" });
      throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
    }
  }
  close(): Promise<void> {
    this.#closed = true;
    this.#closing ??= (async () => {
      try {
        if (this.#queue) await withQueueTimeout(this.#queue.close(), QUEUE_SHUTDOWN_TIMEOUT_MS);
      } finally {
        this.#connection?.disconnect();
      }
    })();
    return this.#closing;
  }
}

export async function processAuthMessageJob(
  job: Pick<Job<unknown>, "name" | "data"> & { readonly attemptsMade?: number },
  processor: AuthMessageProcessor,
) {
  const data = job.data;
  if (
    job.name !== AUTH_MESSAGE_JOB ||
    typeof data !== "object" ||
    data === null ||
    !("recordId" in data) ||
    typeof data.recordId !== "string" ||
    !UUID.test(data.recordId) ||
    Object.keys(data).length !== 1
  )
    throw new UnrecoverableError("Authentication message job has invalid data.");
  try {
    return await processor({ recordId: data.recordId }, job.attemptsMade ?? 0);
  } catch {
    throw new QueueInfrastructureError("JOB_PROCESSING_FAILED");
  }
}

export function startAuthMessageWorker(
  configuration: RedisConfiguration,
  processor: AuthMessageProcessor,
  options: Options & { readonly onUnavailable?: () => void } = {},
) {
  const report = options.onEvent ?? (() => undefined);
  let stopping = false,
    unavailable = false,
    started = false;
  let closing: Promise<void> | undefined;
  const connection = createRedisConnection(configuration, "worker", report, stopUnavailable);
  const worker = new Worker<unknown>(
    AUTH_MESSAGE_QUEUE,
    (job) => processAuthMessageJob(job, processor),
    {
      connection,
      prefix: validateQueuePrefix(options.prefix ?? DEFAULT_QUEUE_PREFIX),
      concurrency: 2,
      maxStalledCount: 1,
      autorun: false,
      runRetryDelay: 1000,
    },
  );
  async function close(force = false) {
    stopping = true;
    try {
      await withQueueTimeout(worker.close(force), QUEUE_SHUTDOWN_TIMEOUT_MS);
    } finally {
      connection.disconnect();
    }
  }
  function stopUnavailable() {
    if (stopping || unavailable) return;
    unavailable = true;
    report({ event: "queue_unavailable" });
    closing ??= close(true);
    closing.catch(() => report({ event: "queue_unavailable" }));
    options.onUnavailable?.();
  }
  connection.on("end", stopUnavailable);
  worker.on("error", () => {
    report({ event: "redis_error" });
    if (connection.status === "end") stopUnavailable();
  });
  worker.on("completed", (job) =>
    report({ event: "job_completed", ...(job.id === undefined ? {} : { jobId: job.id }) }),
  );
  worker.on("failed", (job) =>
    report({
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
          worker.run().catch(stopUnavailable);
        }
      } catch {
        stopUnavailable();
        throw new QueueInfrastructureError("QUEUE_UNAVAILABLE");
      }
    },
    close() {
      stopping = true;
      closing ??= close();
      return closing;
    },
  };
}
