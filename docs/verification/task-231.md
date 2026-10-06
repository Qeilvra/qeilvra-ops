# TASK-231 — Query Review

## Reconciliation — 6 October 2026

Current status: **IN_PROGRESS**. Previous tracker state: UNMARKED.

### Objective and implementation evidence

Query Review. Current pool/index/list/auth queries reviewed statically. Add representative EXPLAIN/ANALYZE, slow-query and N+1 measurements for business modules; current user prefix search/count still needs scale review.

Partial implementation and current verification files inspected:

- `packages/database/src/index.ts`
- `apps/api/src/modules/users/user-admin.service.ts`
- `apps/api/src/modules/users/user.repository.ts`

These verify current scope only; the remaining task-specific gap is stated above.

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Current pool/index/list/auth queries reviewed statically. Add representative EXPLAIN/ANALYZE, slow-query and N+1 measurements for business modules; current user prefix search/count still needs scale review.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
