# TASK-016 — Authorization Guards

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

Authorization Guards. Global server guard, current active-user/session/permission checks, explicit security-role scope and trusted object-policy foundation verified. Future customer/project/job repository relationships are not claimed implemented.

Files inspected:

- `apps/api/src/modules/auth/{auth.guard,access.policy,record.policy}.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `tests/unit/authorization-baseline.test.cjs`
- `tests/live/authentication.test.cjs`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Global server guard, current active-user/session/permission checks, explicit security-role scope and trusted object-policy foundation verified. Future customer/project/job repository relationships are not claimed implemented.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
