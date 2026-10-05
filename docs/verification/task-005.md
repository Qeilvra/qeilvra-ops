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

Initial migration and safe queries passed on disposable PostgreSQL 17. Real
Supabase credentials are absent; CLI account login does not supply a project
database password. Cloud connection acceptance is BLOCKED, so TASK-005 is not
DONE. No production migration was run.

## Technical debt and follow-up

Supply the selected non-production runtime/direct connection settings and CA
when needed; run `db:verify`, then explicitly review/apply the migration. Record
provider acceptance before marking DONE. Tune aggregate pool budgets when replica
counts and Supabase limits are confirmed. Backups/restore belong to TASK-220+.
The workspace lacks `docs/verification/task-004.md`; its stale task status is
outside this batch and was not rewritten as verified history.
