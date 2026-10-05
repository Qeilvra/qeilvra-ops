export type ServiceName = "api" | "worker";

/** Process liveness only; this does not assert database, storage, or queue readiness. */
export interface HealthResponse {
  readonly status: "ok";
  readonly service: ServiceName;
}

export function createHealthResponse(service: ServiceName): HealthResponse {
  return { status: "ok", service };
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly fieldErrors: Readonly<Record<string, readonly string[]>> | null;
  };
}

export function createApiErrorResponse(
  code: string,
  message: string,
  requestId: string,
  fieldErrors: Readonly<Record<string, readonly string[]>> | null = null,
): ApiErrorResponse {
  return { error: { code, message, requestId, fieldErrors } };
}
