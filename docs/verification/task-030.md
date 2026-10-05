# TASK-030 — Customer model

Status: REVIEW pending actual disposable PostgreSQL verification.
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
tests, build, lint, format, typecheck and zero known vulnerabilities. Actual hosted
SQL verification is pending. Docker
Desktop's local image store is read-only, so cloud credentials are not used as
a substitute disposable environment. Customer CRUD, contact/site administration
and permission-filtered lists remain blocked on approved access policy and
authenticated APIs. Email/phone request validation and audit-producing writes
belong to those actual operations; a database model does not complete them.
