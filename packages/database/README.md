# PostgreSQL infrastructure

PostgreSQL via Supabase uses the small `pg` driver, typed query results, and
reviewed SQL migrations. No ORM or domain tables are introduced. See
[the infrastructure decision](../../docs/decisions/005-infrastructure.md).

API and worker own one `DatabaseClient` each. Construction opens no connection.
The lazy pool reuses up to five connections, with three-second acquisition and
five-second query/statement deadlines, thirty-second idle expiry, and five-minute
connection lifetime. Remote connections require verified TLS. `DATABASE_CA_FILE`
can supply the Supabase PEM CA. URL flags cannot disable certificate validation.
Plaintext connections are restricted to loopback fixtures.

Set `DATABASE_ENABLED=true` and `DATABASE_URL` in a private root environment file
or injected server environment. Runtime queries can use Supavisor transaction
pooling; this wrapper uses unnamed parameterized statements. Use a restricted
application role. Schema administration uses a separate direct/session
`DATABASE_MIGRATION_URL` and migration role. This batch creates no cloud resources.

After building shared packages:

```sh
pnpm db:verify
pnpm db:migrate
pnpm db:seed
```

`db:verify` executes only `SELECT 1`. `db:migrate` is an explicit schema-changing
deployment command: review the selected environment and committed SQL first.
It acquires a bounded advisory lock, validates migration names/checksums against
the ledger, and applies pending changes and ledger entries in one transaction.
Failed changes roll back; an edited/missing migration fails. Add new ordered
migrations rather than editing applied files. There is no reset/down command.
Migrations never run during API/worker startup. Runtime roles need no DDL rights.

The initial migration creates only a private infrastructure schema; the runner
owns its migration ledger. `db:seed` is development-only and creates no records.
It verifies connectivity because no domain entities exist yet.

`pnpm test` tests config, TLS options, bounded failures and package boundaries
without cloud access. `pnpm test:live` separately verifies enabled databases
read-only. Migration tests require both a disposable loopback DB and
`INFRASTRUCTURE_TEST_DATABASE_MUTATIONS=true`; never enable this against shared
data. Close every client on process shutdown.

Real Supabase verification remains blocked until non-production credentials and
any required project CA are configured. Disposable PostgreSQL results do not
claim a cloud connection.
