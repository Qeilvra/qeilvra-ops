# TASK-014 — Password Reset

## Reconciliation — 6 October 2026

Current status: **REVIEW**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

Password Reset. PKCE recovery, generic request, replay/session revocation and reset UI pass controlled fixtures. Actual recovery email, approved provider redirect/template and delivered-link password reset remain unverified.

Files inspected:

- `apps/api/src/modules/auth/auth.service.ts`
- `packages/identity/src/provider.ts`
- `apps/worker/src/auth-message-processor.ts`
- `apps/web/src/app/auth/callback/page.tsx`
- `apps/web/src/components/auth-form.tsx`
- `tests/live/authentication.test.cjs`
- `tests/browser/auth-workspace.spec.ts`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

PKCE recovery, generic request, replay/session revocation and reset UI pass controlled fixtures. Actual recovery email, approved provider redirect/template and delivered-link password reset remain unverified.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
