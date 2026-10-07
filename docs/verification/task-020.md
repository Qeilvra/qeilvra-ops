# TASK-020 — Desktop Layout

## Acceptance closeout — 7 October 2026

Current status: **DONE**.

Account menu/profile/recovery/sign-out, permission-aware page search, lazy recipient-scoped notification drawer and desktop/mobile navigation pass all four viewport checks. Business-wide record search remains a later task.

Implemented changes, migration/security/performance review and exact executed checks are in [the acceptance closeout report](acceptance-closeout.md). Clean pnpm check passed with 83 unit/integration, three startup and 68 browser tests; disposable real SQL/API/worker/UI integration passed all 26 cases. No cloud application migration or deployment was performed.

Earlier dated records below are historical and do not override this assessment.

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
