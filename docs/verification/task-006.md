# TASK-006 — Redis / Background Job Queue

Objective: prove API producer → Redis-backed queue → worker processing while
keeping slow work outside HTTP requests. Scope is infrastructure only; the only
job is `system.healthcheck`. Verification date: 5 October 2026.
Status: DONE after task acceptance and the full root quality gate passed.

## Implementation and architecture

- Added server-only `@airmech/queue`, pinned BullMQ 6.3.11 and ioredis 6.0.0,
  and reused validated `ServerConfiguration.redis` from TASK-004.
- API singleton `SystemQueueService` creates jobs through a lazy producer. It
  owns one reusable Redis connection and closes it through Nest shutdown hooks.
- Worker `startQueueRuntime` enables the system consumer only when configured.
  It exposes readiness, shutdown, safe events, and an unavailable callback.
- Job policy uses three attempts, exponential backoff, retained failed jobs,
  deterministic hashed IDs, and bounded completed/failed history. Permanent
  invalid input is not retried. Worker concurrency is two.
- No authentication, business processor, scheduler, screen, or HTTP route added.

## Files changed

`packages/queue/package.json`, `packages/queue/tsconfig.json`,
`packages/queue/src/{index,connection,policy,producer,worker}.ts`,
`packages/queue/README.md`,
`apps/api/src/infrastructure/queue/system-queue.service.ts`,
`apps/worker/src/queue-runtime.ts`, `tests/unit/queue.test.cjs`,
`tests/live/queue.test.cjs`, and this report. Root batch integration also links
the package, registers lifecycle providers, and extends browser import guards.

## Security considerations

Redis credentials enter only validated server configuration. Queue exports
reject browser resolution; web/UI/contract lint boundaries reject queue/provider
imports. Credentials and connection owners use native private fields, so
accidental producer/service serialization cannot include the Redis URL. No URL
or raw provider exception is logged. Job payloads contain a
bounded correlation ID; idempotency keys are hashed. Worker exceptions are
sanitized before BullMQ persists failed reasons, and stored stack traces are
disabled. Verification cleanup removes only a unique test queue namespace.

## Performance considerations

API startup creates no Redis socket, readiness query, or consumer. Slow work
runs in the worker. Producer readiness/enqueue has a five-second bound; socket
and command timeouts are three seconds and offline buffering is disabled.
Redis reconnect attempts stop at five; worker exhaustion closes the processing
loop and reports failure. Worker blocking reads avoid application polling.
Graceful shutdown is bounded at ten seconds and closes owned connections.

## Tests and commands

Unit coverage includes validated configuration, disabled behavior, lazy
construction, idempotent shutdown, idempotency/payload validation, bounded
connections, processing/permanent rejection, sanitized errors, and unavailable
Redis behavior. Separate live tests check the real API producer and worker
factory, result retrieval, duplicate IDs, exponential retry delays, exhausted
failure retention, permanent invalid-job failure, and namespace cleanup.
The compiled worker entry-point test starts an owned child with the configured
Redis database, verifies active consumer startup and HTTP liveness, enqueues an
API-produced job, reads its result, and checks that child's completion event.
It removes only its exact unique test job and terminates only the owned child.

Commands used for dependency review: `npm view bullmq version dependencies
engines --json`, `npm view ioredis version engines --json`, and exact-version
peer/dependency-size queries. Metadata matched supported Node.js 24 and BullMQ's
optional ioredis peer range. No dependency was added to the web package.

Local compilation initially identified a TASK-004 `parseEnv` declaration
mismatch; the batch owner corrected the declaration without weakening strict
checks. ioredis 6's default reply mapping is explicitly typed as `legacy` to
retain compatibility with strict optional-property checking and BullMQ.

| Command / verification                  | Result                                           |
| --------------------------------------- | ------------------------------------------------ |
| Strict queue compilation                | Passed, with all dependency declarations checked |
| Strict API and worker compilation       | Passed with shared queue imports                 |
| Focused typed ESLint                    | Passed, zero warnings                            |
| Focused Prettier checks                 | Passed                                           |
| `node --test tests/unit/queue.test.cjs` | 8 passed, 0 failed, 0 skipped                    |
| `node --test tests/live/queue.test.cjs` | 4 passed, 0 failed, 0 skipped                    |

The live suite used the batch's disposable local Redis service and cleaned its
test artifacts. No cloud Redis or production credentials were required. Normal
job delivery/deduplication completed in under 200ms locally; retries observed
the prescribed backoff. Unavailable local Redis failed within approximately
1.5 seconds, and the worker stopped its retry loop. These are infrastructure
checks, not operational-load latency guarantees.

The complete repository gate passed: production builds, strict types, lint,
formatting, 64 unit/integration tests, three compiled startup tests, six browser
checks and dependency audit with no known vulnerabilities. Standalone required
root commands and frozen installation passed too. The separate combined live
suite passed six PostgreSQL/Redis checks, with one explicit Supabase Storage
credential blocker skip. Queue live checks have no skips or blockers.
No failing result has been suppressed.

## Verification results and blockers

Task-specific acceptance and the final shared quality gate: passed.
Real Redis delivery, worker entry-point startup, retries, failure visibility,
deduplication, and cleanup were verified. Production Redis
credentials, provider selection, persistence, and availability targets remain
deployment configuration; local/CI verification does not need production secrets.

## Technical debt and follow-up

Production must use Redis persistence with `maxmemory-policy=noeviction`, TLS
for remote connections, protected credentials, and a process supervisor.
Retained-job IDs deduplicate within the retention window; future side-effect
processors need durable business idempotency. Business-transaction outbox
delivery and queue monitoring will be introduced with the owning workflows.
Performance at operational load remains a later release measurement.
TASK-010 is the next planned group after this infrastructure batch; not started.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

Redis / Job Queue. Real isolated Redis producer/consumer, compiled worker, retries, deduplication, retained failures and cleanup passed.

Files inspected:

- `packages/queue/src/*.ts`
- `apps/worker/src/{main,queue-runtime}.ts`
- `tests/live/queue.test.cjs`

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Real isolated Redis producer/consumer, compiled worker, retries, deduplication, retained failures and cleanup passed.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
