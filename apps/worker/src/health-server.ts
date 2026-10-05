import { createApiErrorResponse, createHealthResponse } from "@airmech/contracts";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

export function createWorkerServer(): Server {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");

    if (request.method === "GET" && request.url?.split("?", 1)[0] === "/health") {
      response.statusCode = 200;
      response.end(JSON.stringify(createHealthResponse("worker")));
      return;
    }

    const requestId = randomUUID();
    response.statusCode = 404;
    response.setHeader("X-Request-Id", requestId);
    response.end(
      JSON.stringify(
        createApiErrorResponse(
          "RESOURCE_NOT_FOUND",
          "The worker exposes only its internal GET /health endpoint.",
          requestId,
        ),
      ),
    );
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
