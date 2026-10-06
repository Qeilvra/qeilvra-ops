# Airmech One

Operations Management System for Airmech Oman. Built by **Qeilvra**.

## Current status

TASK-001 through TASK-004 establish the monorepo and validated configuration.
TASK-005 through TASK-008 add PostgreSQL, queue, private storage, and CI scaffolding.
Live private Supabase Storage and hosted GitHub CI acceptance passed.
Live Supabase PostgreSQL acceptance passed with trusted CA verification,
connection reuse and checksum-verified infrastructure migrations.
Authentication, server RBAC/session guards, user/role administration, shared UI,
responsive workspace screens, customer/contact ownership and notification models
are implemented to varying acceptance levels. Business operational modules remain
largely unstarted. See [the full reconciliation](docs/verification/full-reconciliation.md)
and [current task totals](docs/implementation-status.md); file existence is not completion.
The startup screen contains no fabricated operational data.

Read [the implementation assessment and plan](docs/implementation-plan.md) and
[the task specification](Task.md) before making changes.
TASK-001 verification is recorded in [the verification report](docs/verification/task-001.md).
TASK-002's shared strict TypeScript architecture is recorded in
[its verification report](docs/verification/task-002.md).
TASK-003's code-quality checks are recorded in
[its verification report](docs/verification/task-003.md).
Infrastructure evidence is recorded individually in
[TASK-005](docs/verification/task-005.md),
[TASK-006](docs/verification/task-006.md),
[TASK-007](docs/verification/task-007.md), and
[TASK-008](docs/verification/task-008.md).

## Requirements and installation

Use Node.js 24 LTS (24.14 or newer within the 24.x line) and pnpm 10.34.6.
The exact package manager and dependencies are pinned, with a shared lockfile.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build:packages
```

If pnpm is installed directly, `pnpm` can replace `corepack pnpm`.

## Local development

Copy `.env.example` to `.env` in the repository root before local development
(`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` in a POSIX shell).
The example starts the foundation without provider credentials. Keep future
integration flags disabled until the corresponding non-production services are configured.
Environment files containing secrets are ignored; commit only `.env.example`.

After building shared packages, use separate terminals:

```sh
corepack pnpm dev:web
corepack pnpm dev:api
corepack pnpm dev:worker
```

- Web: `http://127.0.0.1:3000`
- API process liveness: `http://127.0.0.1:3001/health`
- Worker process liveness: `http://127.0.0.1:3002/health`

API/worker use `HOST`, `PORT`, and `NODE_ENV` for process settings and default
to loopback in development. Health reports only that the process is alive;
it does not assert database or storage readiness. The worker consumes
`system.healthcheck` when Redis is enabled and auth delivery records when auth,
Redis and database are enabled. General business jobs/schedules remain unimplemented.

Configuration is typed and validated once before startup. Local development
loads the root `.env`; existing process variables take precedence. Production
and tests use injected process variables unless an explicit `ENV_FILE` is
provided. Set public values before building the web app. Only
`NEXT_PUBLIC_APP_NAME` is approved for browser exposure; database, Supabase
service-role, authentication, and provider credentials remain server-only.
See [environment configuration](docs/environment.md) for required/optional
variables, entry points, validation, and deterministic test configuration.

Server infrastructure setup is documented in the
[database](packages/database/README.md), [queue](packages/queue/README.md), and
[storage](packages/storage/README.md) package guides. Database clients and queue
producers are lazy; migrations are explicit deployment commands, never startup
side effects. Use `pnpm db:verify`, `pnpm db:migrate`, and development-only
`pnpm db:seed` after reviewing the selected environment. Store credentials only
in private environment configuration. Use a direct/session migration URL and
verified TLS for remote PostgreSQL.

`pnpm test:live` is separate from the normal gate. It requires built packages/apps
and opt-in configured services. Database queries are read-only unless the guarded
disposable-database migration flag is enabled. Queue tests enqueue harmless jobs
and clean their artifacts; storage tests require an existing private verification
bucket and remove their exact test object. Missing providers are reported as skips,
which do not complete the corresponding cloud task. CI runs this suite against
disposable PostgreSQL/Redis; Supabase Storage never requires production secrets.

After changing a shared package, rerun `build:packages`. App watchers watch
their own source; they do not automatically rebuild shared dependencies.

## Verification

```sh
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm build
corepack pnpm test:smoke
corepack pnpm test:browser
corepack pnpm audit
corepack pnpm check
```

`check` is the CI-friendly quality gate: one full build, lint, formatting,
workspace typechecking, unit/integration tests, startup tests, browser tests,
and the dependency audit. Every failure stops the command. Building first
gives typed lint current shared declarations, including on a fresh checkout;
subsequent checks reuse the prepared artifacts.

Standalone `typecheck` builds shared declarations first. Standalone `test`
prepares shared packages and the API, then runs the built-in Node test runner.
Use `test:unit` or `test:integration` to isolate those categories. After a full
build, `typecheck:workspace` and `test:run` reuse its artifacts.

| Category    | Location                        | Coverage                                                                 |
| ----------- | ------------------------------- | ------------------------------------------------------------------------ |
| Unit        | `tests/unit/*.test.cjs`         | Environment validation, process settings, and API error handling         |
| Integration | `tests/integration/*.test.cjs`  | Workspace exports, transport contracts, lint rules, and startup failures |
| Startup     | `tests/e2e/foundation.test.cjs` | Compiled web/API/worker startup and HTTP boundaries                      |
| Browser     | `tests/browser/*.spec.ts`       | Startup page and recovery at desktop/tablet/mobile sizes                 |

These checks are not a substitute for future business, database, and security
tests. Startup and browser runners allocate temporary loopback ports, wait for
readiness, and clean up only their own application processes.

For browser checks, install Chromium once with `corepack pnpm exec playwright
install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed
Chromium browser executable. The browser suite checks the startup page and
missing-route recovery at desktop, tablet, and mobile viewports. It writes
screenshots into the ignored `test-results` directory. Build the web app first.
Use `test:browser` to run Playwright through the owned-server runner; direct
`playwright test` requires the runner's isolated base URL. The complete `check`
command also requires an installed browser and network access for `audit`.

All eleven apps/packages expose `lint`, `typecheck`, `build`, and `format:check`.
For example, `corepack pnpm --filter @airmech/api lint` isolates API lint errors.
The web, API, and config package also expose their relevant `test` commands.
Other packages are exercised by the root integration/startup suites rather
than empty package test scripts.

ESLint uses one root flat configuration, with type-aware TypeScript safety
rules, React hook checks, Next.js checks, and architecture import guards.
Prettier handles formatting separately. Run `corepack pnpm format` to apply
the same repository formatter used by `format:check`.

The original specifications are excluded from automatic formatting. Git is on
main with HTTPS origin for Qeilvra/qeilvra-ops. Hosted GitHub Actions has passed
the frozen installation, complete gate, and disposable infrastructure checks.
For remote PostgreSQL verification, configure DATABASE_CA_FILE with the project's
trusted PEM certificate from Supabase Database Settings; do not disable TLS checks.
The local storage bucket is private and verified. Current acceptance and remaining
gaps for all 133 tasks are recorded in the reconciliation report.

## Workspace ownership

For Vercel, keep Root Directory `apps/web` and use the committed app-root
configuration to run `pnpm --dir ../.. run build:web`. The filtered root build
compiles web workspace dependencies before Next.js loads its configuration.
See [Vercel deployment settings and clean verification](docs/deployment-vercel.md).

| Package              | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `apps/web`           | Next.js responsive interface; accesses business data through the API |
| `apps/api`           | NestJS business/authentication/authorization boundary                |
| `apps/worker`        | Background processing, introduced incrementally                      |
| `packages/ui`        | Presentational controls; no server or database imports               |
| `packages/contracts` | Transport-safe API types                                             |
| `packages/database`  | Server-only PostgreSQL pooling and reviewed SQL migrations           |
| `packages/queue`     | Server-only Redis/BullMQ producers, consumer and retry policy        |
| `packages/storage`   | Server-only authorized private Supabase object operations            |
| `packages/identity`  | Server-only Supabase Auth adapter and encrypted recovery envelopes   |
| `packages/config`    | Shared strict TypeScript and process configuration                   |
| `packages/testing`   | Reusable test assertions/helpers                                     |

## Specification reading order

1. `memory.md`
2. `prd.md`
3. `RULES.md`
4. `DESIGN.md`
5. `ARCHITECTURE.md`
6. `PERFORMANCE.md`
7. `security.md`
8. Features section embedded in `prd.md`
9. Workflows section embedded in `prd.md`
10. `Task.md`
11. Roadmap section embedded in `prd.md`
12. This README

The embedded documents are used because the original repository has no
standalone `FEATURES.md`, `WORKFLOWS.md`, or `ROADMAP.md`. Confirmed memory and
the user's explicit requirements take priority over illustrative embedded copies.

## Shared UI verification

Start `pnpm dev:web` and open `/ui-preview` to exercise the shared controls,
dialogs, tabs and desktop table/mobile card presentation. This route contains
explicit component specimens, creates no business records and grants no account
access. Run `pnpm test:browser` for desktop/tablet/mobile interaction checks.

The profile/RBAC migration is currently verified through disposable PostgreSQL
tests before deployment. Do not run pending application migrations against the
real Supabase project until their rollout and production provisioning are explicitly
approved. The role baseline is already approved; pending deployment is a separate decision.
See [implementation status](docs/implementation-status.md) for prerequisites.

## Tooling references

Runtime and workspace setup were checked against the official
[Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation),
[NestJS startup guide](https://docs.nestjs.com/first-steps), and
[pnpm workspace documentation](https://pnpm.io/workspaces).
TypeScript 5.9 is retained because the selected TypeScript ESLint release's
peer range excludes TypeScript 7; bypassing those peer checks is not allowed.
