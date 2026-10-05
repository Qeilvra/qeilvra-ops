# Airmech One Worker

TASK-001 establishes a separate background-process application. It remains idle
with an internal HTTP liveness server; no jobs are accepted or processed.

`GET /health` returns the shared process-liveness contract. It proves only that
this process can respond. It does not claim Redis connectivity, queue readiness,
active consumers, or working report/notification processing.

TASK-006 must add the Redis/BullMQ connection and queue lifecycle before any
business module queues work. Report, notification, document, and AMC processors
belong to their later tasks. Do not claim business automation is available from
this application foundation.

The health listener binds to `127.0.0.1:3002` by default. `HOST`, `PORT`, and
`NODE_ENV` are validated by `@airmech/config`. SIGINT and SIGTERM stop the listener;
connections receive up to ten seconds to finish. See the repository README for
workspace build and development commands.
