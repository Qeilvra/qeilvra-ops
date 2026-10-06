# TASK-030 — Customer model

Status: DONE.
Assessment: 5 October 2026.

## Objective and implementation

Model the documented company name, supplied customer code, primary contact,
phone, email and active/inactive status. An archive timestamp preserves inactive
records rather than introducing a delete operation. Contact ownership storage
enforces a primary contact belonging to the same customer.

## Files and architecture

- `packages/database/migrations/0003_customer_profiles.sql`
- `packages/contracts/src/customer.ts` and `src/index.ts`
- `tests/live/customer-model.test.cjs`
- `tests/live/identity-access.test.cjs` (scope its RLS check to identity tables)

PostgreSQL owns integrity; contracts remain transport-safe. No customer API,
screen, permission grant, numbering algorithm or production record is created.
Contact administration remains TASK-032; the ownership relation is necessary
for this model and does not claim its CRUD workflow complete.

## Database and security

Unique supplied code, bounded text, restrictive foreign keys and composite
customer/contact ownership. Codes retain their exact input and use PostgreSQL's
case-sensitive text uniqueness; later provisioning must establish approved code
assignment/normalization before writes. Private application schema; RLS enabled;
no browser policies or PUBLIC table privileges. Migrations remain atomic and
checksum-controlled. Neither new application migration has been deployed to Supabase.

## Performance

Indexed code lookup, status/name/ID pagination and customer/contact joins. No
startup queries, new provider/dependency, unlimited lists or background work.
Representative production-scale query plans remain a later acceptance requirement.

## Tests and commands

`pnpm check`; hosted disposable `pnpm db:migrate` and `pnpm test:live`. Real
transactional fixtures check code preservation/uniqueness, primary-contact
ownership, restrictive deletion, consistent archival and RLS configuration.
Fixtures roll back and tests prohibit cloud mutation.

## Results, blockers and technical debt

Local quality gate passed: 66 unit/integration, three startup and eighteen browser
tests, build, lint, format, typecheck and zero known vulnerabilities. The
[hosted run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37343170184) passed
actual migrations, PostgreSQL customer/identity integrity checks, live Redis tests
and the full gate. Configured secrets were absent from hosted logs. Subsequent
mutation-boundary regression tests add two unit checks (68 total) and require
test mode, opt-in and loopback runtime **and** migration URLs. Docker
Desktop's local image store is read-only, so cloud credentials are not used as
a substitute disposable environment. Customer CRUD, contact/site administration
and permission-filtered lists remain blocked on approved access policy and
authenticated APIs. Email/phone request validation and audit-producing writes
belong to those actual operations; a database model does not complete them.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

Customer Model. Customer fields, supplied-code uniqueness, contact ownership, archival integrity and RLS passed real SQL tests. CRUD/sites are separate incomplete tasks.

Files inspected:

- `packages/database/migrations/0003_customer_profiles.sql`
- `packages/contracts/src/customer.ts`
- `tests/live/customer-model.test.cjs`

### Migrations, security and performance

Migration 0003 customer/contact constraints, restrictive deletion and RLS were verified on real disposable PostgreSQL. Customer APIs and field policies do not exist yet.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Customer fields, supplied-code uniqueness, contact ownership, archival integrity and RLS passed real SQL tests. CRUD/sites are separate incomplete tasks.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
