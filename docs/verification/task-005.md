# TASK-005 verification

Objective: PostgreSQL via Supabase infrastructure without domain tables or auth.
Status: BLOCKED for real Supabase connectivity; local foundation implemented.
Verified on 5 October 2026. TASK-010 remains outside this batch.

## Implementation and files

`packages/database/src/index.ts`: typed reusable lazy pool.
`src/migrations.ts`: checksum-checked atomic migration runner.
`migrations/0001_infrastructure.sql`: private infrastructure schema only.
Updated database manifest/README, server config, API infrastructure module,
worker lifecycle, root scripts/lockfile, lint guards, `.env.example`, setup docs
and `docs/decisions/005-infrastructure.md`. Added unit/live database tests and
`tests/integration/infrastructure.test.cjs`.

## Architecture, security and performance

No ORM was committed; the recorded decision selects `pg` and reviewed SQL.
API/worker each own one lazy pool and close it on shutdown. Browser/UI/contracts
cannot import DB/queue/storage through static, dynamic or relative paths; browser
exports reject these packages. Pool maximum five, acquisition three seconds,
query five seconds, idle thirty seconds, connection lifetime five minutes.
Startup runs no DB query. Remote TLS validates certificates, with optional
project PEM CA. URI SSL flags cannot disable validation. Migration deployment
uses a direct/session endpoint, separate from runtime transaction pooling.
Least-privileged runtime roles and distinct migration roles are documented.

No named prepared statements, destructive reset, automatic startup DDL, invented
credentials, business records or seed accounts exist. Errors retain no raw SQL,
password, provider exception or cause. Explicit migrations use a bounded advisory
lock, checksum history and one transaction. The development seed is read-only.

Existing TASK-004 verification uncovered a dotenv dictionary annotation that
did not match Node's undefined-capable return type and intentional control regexes
rejected by lint. Narrow fixes preserve its architecture and validation behavior.
The existing environment test received formatting only. Its public allowlist,
tests and config behavior remain intact.

## Tests and commands

Unit tests: missing config, invalid migration URI/CA, TLS enforcement, bounded
pool options, unavailable DB redaction, lazy lifecycle, migration determinism
and transaction-pooler migration rejection. Integration: actual exports, lint
guards and offline API construction. Disposable PostgreSQL: parameterized SELECT,
connection reuse, migration replay, checksum rejection, atomic rollback and ledger.

Commands: `pnpm install`, `pnpm install --frozen-lockfile`, `pnpm db:migrate`,
`pnpm db:verify`, `pnpm test:live`, `pnpm typecheck`, `pnpm test`, `pnpm lint`,
`pnpm format:check`, `pnpm build`, `pnpm check`, `pnpm audit`, and existing smoke
and browser checks. `pnpm db:seed` also passed against the disposable development
fixture and created no records.

| Verification                             | Final result                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| Initial/frozen dependency installation   | Passed; committed lockfile current                         |
| Format, lint, strict types and build     | Passed across all ten apps/packages                        |
| `pnpm test` and final gate tests         | 64 unit/integration tests passed, no skips                 |
| Compiled startup / browser               | 3 startup + 6 desktop/tablet/mobile checks passed          |
| `pnpm check`                             | Full ordered gate passed; no suppressed failures           |
| `pnpm audit`                             | No known vulnerabilities                                   |
| Database migrate/verify/development seed | Passed against disposable PostgreSQL 17                    |
| Separate live suite                      | 6 PostgreSQL/Redis passes; 1 Supabase Storage blocked skip |

Commands used the existing pinned cached pnpm 10.34.6 executable with its shim
directory on PATH, Node 24.14.0, and installed headless Chrome. The temporary
local runner and logs are ignored under `.cache/task-005-008`; no secret env file
was created. Containers are disposable verification fixtures. Optional
`msgpackr-extract` build scripts remain disabled by the existing dependency policy;
BullMQ's supported JavaScript path passed all queue checks.

## Results and blockers

Closeout verification on 5 October 2026 loaded the actual ignored local environment.
DATABASE_URL and the server key are now configured; the historical missing-secret
blocker is resolved. The typed pool attempted the real project connection and
returned its redacted DATABASE_UNAVAILABLE error. A diagnostic pool using the
same strict TLS settings identified SELF_SIGNED_CERT_IN_CHAIN before database
authentication. No credential, raw provider message, or connection string was logged.

TASK-005 remains BLOCKED: DATABASE_CA_FILE is unset and the Supabase database CA
is not trusted by the current driver. Obtain the certificate from the project's
[Database Settings SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement)
and supply its local PEM path through the existing DATABASE_CA_FILE setting.
Attempts to obtain the public CA from the official download endpoint did not
succeed. Certificate verification was never disabled. DNS currently returns
an IPv6 direct endpoint; confirm connectivity after the CA is supplied, or use
the project's documented session pooler if IPv6 is unavailable.

The existing live PostgreSQL test was run explicitly with DATABASE_ENABLED=true
and ENV_FILE pointing at local .env: its safe-query test failed connection,
and its loopback-only mutation test was intentionally skipped. TLS, safe SQL,
real-project pool reuse, migration ledger and checksum verification therefore
remain unverified. No remote DDL, reset, schema deletion or data mutation occurred.
The test now asserts pg_stat_ssl.ssl for successful remote connections.
Local import/export and environment-secret boundary checks remain in the full gate.
The existing migration runner and read-only development seed were preserved.

## Technical debt and follow-up

Closeout local gate: `pnpm check` passed all ten production builds, lint,
formatting, strict workspace/tooling types, 64 unit/integration tests, three
startup checks, six browser checks and the dependency audit. Separate
`pnpm audit` reported no known vulnerabilities. A scan of tracked files,
staged files and generated browser assets found none of the configured local
server secrets; `.env` remains ignored. The live database failure is reported
separately and is not suppressed by the successful offline gate.

Supply the selected non-production runtime/direct connection settings and CA
when needed; run `db:verify`, then explicitly review/apply the migration. Record
provider acceptance before marking DONE. Tune aggregate pool budgets when replica
counts and Supabase limits are confirmed. Backups/restore belong to TASK-220+.
The workspace lacks `docs/verification/task-004.md`; its stale task status is
outside this batch and was not rewritten as verified history.
