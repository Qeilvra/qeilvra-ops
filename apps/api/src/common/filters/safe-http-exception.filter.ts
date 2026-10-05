import { createApiErrorResponse } from "@airmech/contracts";
import { DatabaseError } from "@airmech/database";
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

import type { CorrelatedRequest } from "../request-id.js";

interface SafeErrorDetails {
  readonly code: string;
  readonly message: string;
}

interface UnexpectedErrorEvent {
  readonly requestId: string;
  readonly status: number;
  readonly errorType: string;
}

type ErrorReporter = (event: UnexpectedErrorEvent) => void;

const HTTP_ERROR_DETAILS: Readonly<Partial<Record<number, SafeErrorDetails>>> = {
  400: {
    code: "INVALID_REQUEST",
    message: "The request is invalid. Check the submitted values and try again.",
  },
  401: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to continue." },
  403: { code: "PERMISSION_DENIED", message: "You do not have permission to perform this action." },
  404: {
    code: "RESOURCE_NOT_FOUND",
    message: "The requested resource was not found. Check the address and try again.",
  },
  405: {
    code: "METHOD_NOT_ALLOWED",
    message: "This resource does not support the requested action.",
  },
  409: {
    code: "REQUEST_CONFLICT",
    message: "The request conflicts with the current record. Refresh it and try again.",
  },
  413: {
    code: "REQUEST_TOO_LARGE",
    message: "The request exceeds the allowed size. Reduce its size and try again.",
  },
  415: {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request format is not supported. Use an accepted content type.",
  },
  422: {
    code: "VALIDATION_FAILED",
    message: "The submitted values could not be accepted. Check them and try again.",
  },
  429: {
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests were received. Wait briefly and try again.",
  },
  503: {
    code: "SERVICE_UNAVAILABLE",
    message: "The service is temporarily unavailable. Try again shortly.",
  },
};

// Express parsers attach documented types to expected input failures. Never
// return their raw messages or body property, which can contain submitted data.
const BODY_PARSER_ERROR_STATUSES: ReadonlyMap<string, number> = new Map([
  ["entity.parse.failed", 400],
  ["request.aborted", 400],
  ["request.size.invalid", 400],
  ["entity.too.large", 413],
  ["parameters.too.many", 413],
  ["encoding.unsupported", 415],
  ["charset.unsupported", 415],
]);

function resolveExceptionStatus(exception: unknown): number {
  if (exception instanceof DatabaseError) {
    return exception.code === "DATABASE_CONFLICT"
      ? 409
      : exception.code === "DATABASE_INVALID_REQUEST"
        ? 400
        : 503;
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  }

  if (exception instanceof Error && "type" in exception && typeof exception.type === "string") {
    return BODY_PARSER_ERROR_STATUSES.get(exception.type) ?? 500;
  }

  return 500;
}

function reportUnexpectedError(event: UnexpectedErrorEvent): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "api",
      event: "unexpected_request_error",
      ...event,
    })}\n`,
  );
}

function classifyError(exception: unknown): string {
  if (exception instanceof TypeError) return "TypeError";
  if (exception instanceof RangeError) return "RangeError";
  if (exception instanceof SyntaxError) return "SyntaxError";
  if (exception instanceof HttpException) return "HttpException";
  return exception instanceof Error ? "Error" : "UnknownThrownValue";
}

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly reportError: ErrorReporter = reportUnexpectedError) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<ServerResponse>();
    const requestId = request.requestId ?? randomUUID();
    const status = resolveExceptionStatus(exception);

    if (status >= 500) {
      this.reportError({ requestId, status, errorType: classifyError(exception) });
    }

    if (response.headersSent) {
      response.destroy();
      return;
    }

    const details = HTTP_ERROR_DETAILS[status] ?? {
      code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED",
      message:
        status >= 500
          ? "The request could not be completed. Retry, and contact support with the request ID if it continues."
          : "The request could not be accepted. Check the request and try again.",
    };

    response.statusCode = status;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Request-Id", requestId);
    response.end(JSON.stringify(createApiErrorResponse(details.code, details.message, requestId)));
  }
}
