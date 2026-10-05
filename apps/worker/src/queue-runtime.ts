import type { ServerConfiguration } from "@airmech/config/server";
import { startSystemQueueWorker } from "@airmech/queue";
import type { QueueEvent, SystemQueueWorker } from "@airmech/queue";

export interface QueueRuntime extends SystemQueueWorker {
  readonly enabled: boolean;
}

export function startQueueRuntime(
  configuration: ServerConfiguration["redis"],
  onUnavailable?: () => void,
): QueueRuntime {
  if (!configuration.enabled) {
    return { enabled: false, ready: () => Promise.resolve(), close: () => Promise.resolve() };
  }
  const worker = startSystemQueueWorker(configuration, {
    onEvent: logQueueEvent,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  return { enabled: true, ready: () => worker.ready(), close: () => worker.close() };
}

function logQueueEvent(event: QueueEvent): void {
  const successful = event.event === "job_completed";
  const stream = successful ? process.stdout : process.stderr;
  stream.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: successful ? "info" : "error", service: "worker", ...event })}\n`,
  );
}
