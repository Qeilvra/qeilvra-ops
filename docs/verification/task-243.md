# TASK-243 — Error Leak Testing

## Reconciliation — 6 October 2026

Current status: **IN_PROGRESS**. Previous tracker state: UNMARKED.

### Objective and implementation evidence

Error Leak Testing. Safe startup/API/provider/database/queue errors tested and secrets scanned. Complete deployed-domain error/leak tests after domain APIs exist.

Partial implementation and current verification files inspected:

- `apps/api/src/common/filters/safe-http-exception.filter.ts`
- `tests/unit/api-error-boundary.test.cjs`
- `tests/live/database.test.cjs`
- `tests/e2e/foundation.test.cjs`

These verify current scope only; the remaining task-specific gap is stated above.

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Safe startup/API/provider/database/queue errors tested and secrets scanned. Complete deployed-domain error/leak tests after domain APIs exist.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
