# Background job infrastructure

`@airmech/queue` is a server package used by API producers and worker consumers.
Its only registered job is `system.healthcheck`; it creates no business behavior
and exposes no HTTP endpoint. Browser exports are disabled.

Set `REDIS_ENABLED=true` and supply `REDIS_URL` through
`@airmech/config/server`. Use `rediss://` for a remote TLS service and a protected
credential store. Configure Redis persistence and `maxmemory-policy=noeviction`
before production use. Separate environments need separate Redis databases or
instances. Redis must support BullMQ's commands, Lua scripts, and blocking reads.

The API's singleton `SystemQueueService` owns a lazy `SystemQueueProducer`.
Constructing the producer opens no connection. Enqueue creates one reusable
connection, waits for readiness, adds the job, and returns its generated ID.
Processing happens in `apps/worker`, outside the HTTP request path.

Supply the same idempotency key when retrying an uncertain enqueue. Redis may
accept a job before a network acknowledgement is lost. The key is hashed into a
deterministic job ID, deduplicating while the retained job exists. Completed jobs
remain for at most one hour / 1,000 records and failed jobs for at most seven
days / 5,000 records; retention is applied lazily when other jobs finish.
Later business processors must also enforce durable idempotency around effects.

Healthchecks allow three attempts with exponential backoff beginning at 250ms.
Invalid names/payloads fail permanently without retries. Failure reasons and
events are sanitized; payloads contain only a bounded correlation ID. Failed
jobs remain visible via BullMQ's server-side queue inspection methods.
There is no public queue admin screen or unauthenticated queue-management route.

Producer operations have a five-second outer bound, three-second connection and
command timeouts, one command retry, and no offline request buffer. Worker
blocking commands use BullMQ's required `maxRetriesPerRequest=null`, while socket
reconnections stop after five attempts. Exhaustion stops the processing loop and
signals the process owner to fail visibly for a supervisor to restart.
Shutdown drains work with a ten-second bound and disconnects owned connections.

Unit tests use controlled local unavailable ports and require no Redis server.
Live verification uses an actual configured Redis service and isolated
`airmech-verify-<uuid>` namespaces. It checks API-to-worker delivery, retained-job
deduplication, retry backoff, exhausted/permanent failures, and test cleanup.
Never run a Redis-wide flush for verification.

```sh
pnpm build:packages
pnpm --filter @airmech/api build
pnpm --filter @airmech/worker build
node --test tests/unit/queue.test.cjs
# With REDIS_ENABLED=true and REDIS_URL supplied securely:
node --test tests/live/queue.test.cjs
```

The connection, retry, and retention choices follow the official
[BullMQ connection guidance](https://docs.bullmq.io/guide/connections),
[retry guidance](https://docs.bullmq.io/guide/retrying-failing-jobs), and
[auto-removal guidance](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs).
