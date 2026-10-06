# TASK-017 — Authentication Audit

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

Authentication Audit. Actual transactional login/logout/reset/user-status/role/grant audit producers verified in disposable PostgreSQL; append-only trigger rejects mutation and details exclude secrets. Role changes use semantic before/after events.

Files inspected:

- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/users/user-admin.service.ts`
- `apps/worker/src/auth-message-processor.ts`
- `packages/database/migrations/0002_identity_access.sql`
- `packages/database/migrations/0005_authorization_sessions.sql`
- `tests/live/authentication.test.cjs`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Actual transactional login/logout/reset/user-status/role/grant audit producers verified in disposable PostgreSQL; append-only trigger rejects mutation and details exclude secrets. Role changes use semantic before/after events.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
