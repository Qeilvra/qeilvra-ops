# Infrastructure decision: TASK-005 through TASK-008

Approved scope: PostgreSQL via Supabase, Redis/BullMQ, Supabase private storage,
and CI. No authentication or domain tables are introduced.

The repository documents PostgreSQL but commits no ORM or ORM dependency.
Use the small `pg` driver with typed query results and reviewed SQL migrations
in `packages/database`. This preserves the documented repository boundary and
avoids selecting a domain ORM before domain modeling. There is no competing ORM.
Future ORM selection needs its own recorded decision and must reuse database
ownership and migration history.

API and worker each own one lazy bounded connection pool. Remote connections
require verified TLS; `DATABASE_CA_FILE` can supply the Supabase project CA.
Use the Supavisor transaction endpoint for runtime queries without named prepared
statements. Use a separate direct or session endpoint (`DATABASE_MIGRATION_URL`)
for migrations. Migrations acquire a transaction advisory lock, validate immutable
checksums, and run transactionally. They never run during application startup.

The initial SQL migration creates only a private infrastructure schema. The
migration ledger has no application entities. Development seeding creates no
records and runs only a read-only connectivity probe. No default accounts exist.

Queue and storage are small server-only shared packages so both API and worker
can use them without importing one application's internals. Queue work is
Redis-backed and performed in the worker. Storage access requires an application
authorization callback; this batch adds no authorization system or upload route.

CI uses one installation and the existing one-build quality gate. Disposable
PostgreSQL and Redis provide reproducible integration checks without production
credentials. The workspace has no Git repository or identified remote provider;
GitHub Actions is prepared for activation if GitHub is chosen. Hosted execution
cannot be claimed until a repository is connected and a run passes.

References: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres),
[node-postgres pooling](https://node-postgres.com/apis/pool),
[node-postgres TLS](https://node-postgres.com/features/ssl).
