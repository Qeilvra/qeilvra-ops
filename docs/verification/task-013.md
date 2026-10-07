# TASK-013 — Login

## Live verification — 7 October 2026

The explicitly authorized one-user Supabase lifecycle passed again with
disposable local PostgreSQL. Additional checks prove Supabase accepts the JWT,
the API maps the engineer role correctly, and logout expires the cookie and
removes the local session. Provider deletion was followed by a confirmed 404.
See [the controlled live authentication report](supabase-auth-live.md) for
commands, exact test counts, cleanup and scope.

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: BLOCKED.

### Objective and implementation evidence

Login. Real approved temporary Supabase user authenticated through the API; mapped engineer profile/session/protected access/logout/denial passed; deletion confirmed. Fixture API expiry, forged payload, CSRF, rate limits and browser login passed.

Files inspected:

- `apps/api/src/modules/auth/{auth.controller,auth.service,auth.guard,session-security}.ts`
- `packages/identity/src/provider.ts`
- `apps/web/src/components/auth-form.tsx`
- `tests/live/authentication.test.cjs`
- `tests/live/supabase-auth.test.cjs`
- `tests/browser/auth-workspace.spec.ts`

### Migrations, security and performance

Identity/RBAC/session work uses migrations 0002 and 0005. All five existing SQL files applied and replayed on disposable PostgreSQL; immutable checksums were retained. Cloud ledger still contains only 0001. Current APIs check sessions, active profiles and server grants, use bounded queries, private cookies and safe errors.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

No historical commands/results are claimed for this task.

### Remaining acceptance, blockers and technical debt

Real approved temporary Supabase user authenticated through the API; mapped engineer profile/session/protected access/logout/denial passed; deletion confirmed. Fixture API expiry, forged payload, CSRF, rate limits and browser login passed.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
