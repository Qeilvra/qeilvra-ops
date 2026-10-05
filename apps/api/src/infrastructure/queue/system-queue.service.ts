import type { ServerConfiguration } from "@airmech/config/server";
import { SystemQueueProducer } from "@airmech/queue";
import type { QueueEvent, SystemQueueProducerOptions } from "@airmech/queue";
import type { OnApplicationShutdown } from "@nestjs/common";

export class SystemQueueService implements OnApplicationShutdown {
  readonly #producer: SystemQueueProducer;

  constructor(
    configuration: ServerConfiguration["redis"],
    options: SystemQueueProducerOptions = {},
  ) {
    this.#producer = new SystemQueueProducer(configuration, { onEvent: logQueueEvent, ...options });
  }

  enqueueHealthcheck(requestId: string, idempotencyKey = requestId): Promise<{ jobId: string }> {
    return this.#producer.enqueueHealthcheck(requestId, idempotencyKey);
  }

  onApplicationShutdown(): Promise<void> {
    return this.#producer.close();
  }
}

function logQueueEvent(event: QueueEvent): void {
  process.stderr.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", service: "api", ...event })}\n`,
  );
}
