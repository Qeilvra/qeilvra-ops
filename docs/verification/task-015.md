# TASK-015 — User Administration

## Acceptance closeout — 7 October 2026

Current status: **REVIEW**.

Invitation/resend/confirmed-identity recovery, correct enable/disable/setup transitions, provisioning rollback, security audit and accurate bounded pagination pass. Actual invite/setup/resend remains unverified; Supabase HTTP 429 blocks delivery to the current authorized inbox.

Implemented changes, migration/security/performance review and exact executed checks are in [the acceptance closeout report](acceptance-closeout.md). Clean pnpm check passed with 83 unit/integration, three startup and 68 browser tests; disposable real SQL/API/worker/UI integration passed all 26 cases. No cloud application migration or deployment was performed.

Earlier dated records below are historical and do not override this assessment.

## Reconciliation — 6 October 2026

Current status: **REVIEW**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

User Administration. Real SQL/API list/search/status filter, profile edits, enable/disable, role assignment/removal, last-admin/concurrency protections and fixture invites pass. Real invite delivery/setup remains unverified; empty out-of-range pages currently lose total count; resend invitation lacks a UI action.

Files inspected:

- `apps/api/src/modules/users/user-admin.{service,controller}.ts`
- `apps/web/src/components/user-administration.tsx`
- `tests/live/authentication.test.cjs`
- `tests/browser/auth-workspace.spec.ts`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Real SQL/API list/search/status filter, profile edits, enable/disable, role assignment/removal, last-admin/concurrency protections and fixture invites pass. Real invite delivery/setup remains unverified; empty out-of-range pages currently lose total count; resend invitation lacks a UI action.

Do not mark DONE until the task-specific gap is implemented and verified. Approved role/customer/callback decisions must not be reinstated as missing-policy blockers.
