# TASK-020 — Desktop Layout

## Reconciliation — 6 October 2026

Current status: **IN_PROGRESS**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

Desktop Layout. Sidebar/header/workspace/account/sign-out/loading/retry exist. Add actual user menu, search and notification entries with integrated navigation; no fabricated domain links.

Files inspected:

- `apps/web/src/components/workspace-frame.tsx`
- `apps/web/src/app/globals.css`
- `tests/browser/auth-workspace.spec.ts`

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Sidebar/header/workspace/account/sign-out/loading/retry exist. Add actual user menu, search and notification entries with integrated navigation; no fabricated domain links.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
