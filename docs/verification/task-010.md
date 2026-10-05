# TASK-010 — User model

Status: DONE. Assessed 5 October 2026.

## Objective and implementation

Add application-owned employee profiles linked by a unique Supabase identity ID.
Migration `0002_identity_access.sql` stores status, employee details, current role
relations, last login and timestamps. Credentials remain owned by Supabase Auth.
Transport-safe contracts and the API user repository return a current principal.
There is no account provisioning, password database, implicit administrator, or
public business endpoint.

## Files and architecture

- `packages/database/migrations/0002_identity_access.sql`
- `packages/contracts/src/access.ts` and `src/index.ts`
- `apps/api/src/modules/users/user.repository.ts`
- `tests/live/identity-access.test.cjs`

API → existing database package → PostgreSQL. Web/UI never import the database.
The identity ID is an external provider reference, not a cross-schema dependency
on Supabase internals. Provisioning/reconciliation remains part of TASK-015.

## Database and security

Unique identity, case-insensitive email and employee-code constraints; bounded
profile fields; restrictive foreign keys; indexes for identity and status pages.
All application tables have RLS enabled and no browser policies. PUBLIC receives
no schema/table/sequence/function privileges. No permission grants or accounts
are seeded. The migration is transactional and checksum-controlled by the existing
runner; it has **not** been applied to the real Supabase project.

## Performance

One parameterized query resolves status, roles and permission grants through
indexed joins. The process reuses the existing bounded, lazy PostgreSQL pool.
No startup provider queries or reconnect loops were introduced. This is a model
verification, not a production-scale latency benchmark.

## Tests, commands and results

`pnpm check` includes build, lint, format, typecheck, unit/integration, startup,
browser and audit checks. `pnpm db:migrate` and `pnpm test:live` on an explicitly
opted-in **loopback disposable database** verify the SQL and repository. Fixtures
run in a real transaction and roll back. Cloud mutation is prohibited by the test.

Local TypeScript compilation and the 66 unit/integration tests passed. Local Docker
could not create its services: its image store reported a read-only filesystem.
The [hosted quality run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37341781398)
passed its complete quality gate, migration application and actual PostgreSQL/Redis
tests. Identity fixtures verified constraints, role resolution, disabled state,
immediate grant removal, RLS configuration and rejection of audit mutation.
The hosted logs contain no configured server secrets. The cloud database is unchanged.

## Blockers, debt and follow-up

No user-model verification blocker remains. Production rollout,
least-privilege API database credentials, approved role grants, first-user
provisioning and the Supabase login/reset configuration remain separate work.
Keep the original infrastructure migration checksum unchanged.
