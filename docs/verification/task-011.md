# TASK-011 — Roles

Status: REVIEW pending disposable PostgreSQL verification. Assessed 5 October 2026.

## Objective and implementation

Create the eight documented role records: Super Admin, Management, Sales/Admin,
Service Manager, Engineer/Technician, Project Manager, Accounts and Store/Inventory.
Stable codes and relational user/permission assignments support data-driven RBAC.
No role has implicit authority, including Super Admin.

## Files, architecture and database

`packages/database/migrations/0002_identity_access.sql` owns roles, permissions
and restrictive many-to-many relations. `packages/contracts/src/access.ts` is
transport-safe. `apps/api/src/modules/users/user.repository.ts` resolves current
relations from the server-only database package. `tests/live/identity-access.test.cjs`
checks the eight records and a real PostgreSQL role/permission assignment.

## Security and performance

No default accounts or grants; no frontend database exposure; private schema,
RLS and no browser policies. Permission removal takes effect on the next lookup.
Indexed relational joins avoid one query per role. Production grants are intentionally
pending the approved role/object-access policy, tracked under TASK-012/TASK-015.

## Tests and commands

`pnpm check`; `pnpm db:migrate`; explicitly opted-in disposable `pnpm test:live`.
Local compilation and permission unit tests passed. Docker's read-only image store
prevented local SQL verification. Hosted PostgreSQL verification is pending.

## Results, blockers and technical debt

REVIEW until actual migration, constraints and repository tests pass against
disposable PostgreSQL. Role grants and administration are not claimed complete.
The new migration has not been applied to Supabase. Least-privilege production
database grants must be established before deploying protected modules.
