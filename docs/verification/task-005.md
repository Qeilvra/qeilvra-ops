# TASK-005 verification

Objective: PostgreSQL via Supabase infrastructure without domain tables or auth.
Status: DONE after real Supabase PostgreSQL and strict TLS verification.
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

Live acceptance resumed on 5 October 2026 using only the ignored local .env.
The supplied certificate was saved as secrets/prod-ca-2021.crt rather than the
stated secrets/supabase-ca.crt. Its X.509 CA status and validity were checked
without printing contents, and DATABASE_CA_FILE was corrected locally to the
existing file. The user's secrets/ ignore rule and .env ignore were preserved.

The existing typed DatabaseClient connected to the actual Supabase database.
Remote pool settings retained rejectUnauthorized=true with the supplied CA.
pg_stat_ssl confirmed ssl=true. Parameterized SELECT, current_database(),
current_user and version() succeeded; outputs were reduced to success booleans.
Sequential queries on the same client returned the same backend PID, confirming
connection reuse. The existing five-connection lazy pool, bounded timeouts,
shutdown lifecycle and lack of startup-query loops remain unchanged.

The migration ledger was initially absent. After reviewing the existing single
infrastructure-only SQL file, the existing applyMigrations runner applied one
migration and replay applied zero. The persisted ledger name and SHA-256 checksum
match the version-controlled migration exactly. No authentication/business table,
reset, dropped schema or business-data deletion was performed. An intermediate
diagnostic validated schema/ledger permissions inside a rolled-back transaction.
Two initial CLI attempts failed with the existing redacted error; subsequent
runner application, replay and actual pnpm db:migrate/db:verify commands passed.
No TLS or timeout policy was weakened to obtain success.

The existing live test passed: one safe-query/pooling/TLS test, zero failures.
The loopback-only disposable mutation test was intentionally skipped; cloud
rollback-failure and checksum-tampering tests were not enabled. Those destructive
test scenarios remain covered by the existing disposable CI database checks.
Scoped database/environment/import integration tests passed, proving API/worker
access and browser rejection remain correct. Configured server secrets were not
found in tracked/staged files or generated browser assets. TASK-005 has no
remaining acceptance blocker. TASK-010 was not started.

Commands: explicit local ENV_FILE with DATABASE_ENABLED=true for pnpm db:migrate,
pnpm db:verify, development-only pnpm db:seed and node --test tests/live/database.test.cjs;
the seed verified connectivity without inserting any records. Scoped node --test
for tests/unit/database.test.cjs, tests/integration/infrastructure.test.cjs and
tests/integration/environment.test.cjs. Safe ignored verification helpers checked
the certificate, typed pool, TLS and read-only ledger state without logging secrets.
The scoped suite passed all 15 tests. The resumed full pnpm check gate also passed:
ten builds, lint, formatting, strict types, 64 unit/integration tests, three
startup checks, six browser checks and audit with no known vulnerabilities.

## Technical debt and follow-up

Migration portability follow-up, 5 October 2026: forced Git checkouts with
`core.autocrlf=true` changed SQL bytes and checksums. The scoped `.gitattributes`
rule now preserves LF for database migrations. A regression test performs actual
Windows and Unix checkout conversions and verifies every migration checksum.
Both settings preserve all four existing checksums, including the deployed
0001 migration. No existing SQL or recorded ledger checksum was changed.

Closeout local gate: `pnpm check` passed all ten production builds, lint,
formatting, strict workspace/tooling types, 64 unit/integration tests, three
startup checks, six browser checks and the dependency audit. Separate
`pnpm audit` reported no known vulnerabilities. A scan of tracked files,
staged files and generated browser assets found none of the configured local
server secrets; `.env` remains ignored. The live database failure is reported
separately and is not suppressed by the successful offline gate.

Maintain trusted CA configuration for each deployment; keep runtime and migration
credentials server-only and prefer a least-privileged application role in production.
Tune aggregate pool budgets when replica
counts and Supabase limits are confirmed. Backups/restore belong to TASK-220+.
The workspace lacks `docs/verification/task-004.md`; its stale task status is
outside this batch and was not rewritten as verified history.
