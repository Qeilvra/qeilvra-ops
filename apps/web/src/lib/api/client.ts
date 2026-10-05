/** Browser transport contains no provider SDK, database configuration or token storage. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(
      status === 401
        ? "Sign-in failed or your session has expired."
        : status === 403
          ? "You do not have permission to perform this action."
          : status === 409
            ? "This change conflicts with the current record. Refresh and review it."
            : status === 429
              ? "Too many attempts. Wait briefly and try again."
              : status >= 500
                ? "The service is temporarily unavailable. Try again shortly."
                : "Check the submitted values and try again.",
    );
  }
}

export async function apiRequest(
  path: string,
  options: { method?: string; body?: object; signal?: AbortSignal } = {},
): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: options.signal ?? AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new ApiRequestError(response.status, response.headers.get("X-Request-Id"));
  return response.status === 204 || response.status === 201
    ? null
    : (response.json() as Promise<unknown>);
}

export function safeMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? `${error.message}${error.requestId ? ` Reference: ${error.requestId}` : ""}`
    : "The service could not be reached. Check your connection and try again.";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
