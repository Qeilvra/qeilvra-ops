import { createHash } from "node:crypto";
import type { JobsOptions } from "bullmq";

export const SYSTEM_QUEUE_NAME = "airmech-system";
export const SYSTEM_HEALTHCHECK_JOB = "system.healthcheck";
export const DEFAULT_QUEUE_PREFIX = "airmech";
export const QUEUE_OPERATION_TIMEOUT_MS = 5_000;
export const QUEUE_SHUTDOWN_TIMEOUT_MS = 10_000;
export const REDIS_MAX_RECONNECT_ATTEMPTS = 5;

export interface SystemHealthcheckData {
  readonly requestId: string;
}

export interface SystemHealthcheckResult {
  readonly status: "ok";
  readonly requestId: string;
  readonly processedAt: string;
}

export class QueueInfrastructureError extends Error {
  constructor(
    readonly code:
      | "QUEUE_DISABLED"
      | "QUEUE_UNAVAILABLE"
      | "QUEUE_CLOSED"
      | "INVALID_JOB"
      | "JOB_PROCESSING_FAILED",
  ) {
    const messages = {
      QUEUE_DISABLED: "Background processing is disabled in the server configuration.",
      QUEUE_UNAVAILABLE:
        "Background processing is unavailable. Retry with the same idempotency key.",
      QUEUE_CLOSED: "The background queue has shut down.",
      INVALID_JOB: "The infrastructure job has an invalid name or payload.",
      JOB_PROCESSING_FAILED:
        "The infrastructure job could not be processed. Retry is bounded by queue policy.",
    };
    super(messages[code]);
    this.name = "QueueInfrastructureError";
  }
}

export interface QueueEvent {
  readonly event: "redis_error" | "queue_unavailable" | "job_completed" | "job_failed";
  readonly jobId?: string;
  readonly attemptsMade?: number;
}

export type QueueEventHandler = (event: QueueEvent) => void;

export function validateRequestId(requestId: unknown): asserts requestId is string {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(requestId)) {
    throw new QueueInfrastructureError("INVALID_JOB");
  }
}

export function systemJobId(idempotencyKey: string): string {
  validateRequestId(idempotencyKey);
  return `system-healthcheck-${createHash("sha256").update(idempotencyKey).digest("hex")}`;
}

export function systemJobOptions(idempotencyKey: string): JobsOptions {
  return {
    jobId: systemJobId(idempotencyKey),
    attempts: 3,
    backoff: { type: "exponential", delay: 250 },
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 3_600, count: 5_000 },
    stackTraceLimit: 0,
  };
}

export function validateQueuePrefix(prefix: string): string {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(prefix)) throw new QueueInfrastructureError("INVALID_JOB");
  return prefix;
}

export async function withQueueTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new QueueInfrastructureError("QUEUE_UNAVAILABLE")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
