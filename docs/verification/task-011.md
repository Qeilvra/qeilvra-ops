# TASK-011 — Roles

Current reconciliation status: **REVIEW**, 6 October 2026. Role activation and
deactivation are absent. The following model-only acceptance record is historical.

Historical model status: DONE. Assessed 5 October 2026.

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
prevented local SQL verification. The [hosted run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37341781398)
passed actual PostgreSQL role/repository, migration history and rollback tests,
the complete quality gate and live Redis tests. Logs contained no configured secrets.

## Results, blockers and technical debt

Migration, constraints and repository tests passed against disposable PostgreSQL.
Role grants and administration are not claimed complete.
The new migration has not been applied to Supabase. Least-privilege production
database grants must be established before deploying protected modules.

---

## Reconciliation — 6 October 2026

Current status: **REVIEW**. Previous tracker state: DONE.

### Objective and implementation evidence

Roles. Eight stable approved lower-case role codes, names, grants and replay are verified. Role-level active/inactive state required by this audit is absent; add and verify lifecycle enforcement before DONE. Historical model-only DONE is narrower.

Files inspected:

- `packages/database/migrations/0002_identity_access.sql`
- `packages/database/migrations/0005_authorization_sessions.sql`
- `tests/live/identity-access.test.cjs`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Eight stable approved lower-case role codes, names, grants and replay are verified. Role-level active/inactive state required by this audit is absent; add and verify lifecycle enforcement before DONE. Historical model-only DONE is narrower.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
