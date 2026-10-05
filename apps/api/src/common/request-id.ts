import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type CorrelatedRequest = IncomingMessage & { requestId?: string };

// Bound accepted IDs before reflecting them in headers, responses, or logs.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function assignRequestId(
  request: CorrelatedRequest,
  response: ServerResponse,
  next: () => void,
): void {
  const incomingId = request.headers["x-request-id"];
  const requestId =
    typeof incomingId === "string" && REQUEST_ID_PATTERN.test(incomingId)
      ? incomingId
      : randomUUID();

  request.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  response.removeHeader("X-Powered-By");
  next();
}
