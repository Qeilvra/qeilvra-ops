# TASK-008 verification

Assessment date: 5 October 2026. Status: DONE after hosted GitHub verification.
The repository already has foundation commit dfdf34b on main, with HTTPS origin
for Qeilvra/qeilvra-ops. Existing Windows Git credentials work outside the sandbox;
the earlier SSH blocker is obsolete. No account, token or branch-security changes
were made. Hosted evidence follows; the existing CI workflow is unchanged.

## Objective

Provide deterministic, efficient monorepo CI using the established quality gate,
including desktop/tablet/mobile browser checks and isolated infrastructure tests.
Preserve the completed TypeScript, lint, formatter, environment, and test setup.

## Implementation and files changed

- `.github/workflows/ci.yml`: prospective GitHub Actions workflow for pull
  requests, pushes to `main`, and manual runs.
- `tests/integration/ci.test.cjs`: parse the real workflow with pinned
  `yaml@2.9.1` and check triggers, actions, permissions, gate ordering,
  deterministic installation, caching, and disposable service isolation.
- `docs/verification/task-008.md`: this verification record.
- Root manifest/lockfile: the batch owner adds the direct YAML parser development
  dependency and the migration/live-verification scripts used by the workflow.

Actions are pinned to verified full release commit SHAs:
[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0), and
[pnpm/action-setup v6.1.0](https://github.com/pnpm/action-setup/releases/tag/v6.1.0).
Node 24.14.0 matches the supported foundation baseline. pnpm comes from the
existing exact `packageManager` value, `pnpm@10.34.6`.

## Architecture

One Ubuntu hosted job performs one frozen-lockfile dependency install and one
`pnpm check`. That command builds once, then checks lint, formatting, strict
workspace/tooling types, unit/integration tests, compiled startup, browser
viewports, and the advisory audit. Chromium and its system dependencies are
installed before the gate.

PostgreSQL 17 and Redis 7.4 service containers receive bounded health checks.
After the gate prepares compiled artifacts, the migration CLI explicitly applies
versioned infrastructure SQL to disposable PostgreSQL, then `pnpm test:live`
checks the PostgreSQL/Redis infrastructure. The live step explicitly enables
disposable-database mutation checks; those tests additionally reject non-loopback
migration targets before testing replay, checksum changes, and rollback.
Supabase cloud storage verification
is separate and does not require cloud credentials in CI.
GitHub creates and removes services for each job; see its
[service container documentation](https://docs.github.com/en/actions/tutorials/use-containerized-services/use-docker-service-containers).

## Security considerations

The workflow requests only `contents: read`, disables persisted checkout
credentials, pins actions, and uses normal pull-request events. It does not use
privileged `pull_request_target` execution. No production/database passwords,
Supabase keys, Redis passwords, or cloud tokens appear in the workflow.

Passwordless PostgreSQL trust is restricted to a disposable service published
only on the runner's `127.0.0.1` interface. Redis is published to loopback too.
These fixtures are unsuitable for deployment and carry no business data.
Only the explicit migration and live-test steps enable their provider flags.
`NODE_ENV=test` prevents the shared environment loader from reading a developer
dotenv file. Cloud/protected secrets belong in the CI platform's secret manager
if a future separate deployment workflow requires them.

Every required command and step propagates failure. There is no failure masking,
`continue-on-error`, production reset, cloud migration, or automatic deployment.

## Performance considerations

One job avoids repeat installs/builds and artifact transfer. pnpm caches only its
content-addressed store using the committed lockfile; installation still enforces
the lockfile on cache hits. Setup Node's automatic cache is disabled to avoid
duplicate cache work. Outputs and `node_modules` are rebuilt rather than restored.
Concurrency cancels superseded runs for the same PR/ref. The existing two-worker
browser suite and bounded service health checks remain unchanged. A 20-minute
job deadline bounds hung CI; actual hosted duration has not yet been measured.

## Tests and commands run

Local scoped verification passed:

- `node --test tests/integration/ci.test.cjs`: 4 passed, 0 failed or skipped.
- `node node_modules/eslint/bin/eslint.js tests/integration/ci.test.cjs --max-warnings 0`:
  passed without errors or warnings.
- `node node_modules/prettier/bin/prettier.cjs --check .github/workflows/ci.yml tests/integration/ci.test.cjs docs/verification/task-008.md`:
  passed.

The complete local `pnpm check` gate passed: all ten app/package production builds,
lint, formatting, strict workspace/tooling types, 64 unit/integration tests,
three compiled startup tests, six desktop/tablet/mobile browser checks, and audit
with no known vulnerabilities. Required standalone commands and a frozen
installation passed. Separate live verification recorded six PostgreSQL/Redis
passes and one explicit cloud storage credential skip. Temporary local services
and tests never used production credentials.

The workflow test uses a YAML 1.2 parser with duplicate-key checking and aliases
disabled for conversion. Structural assertions exercise quality and security
requirements without requiring GitHub, Docker, production secrets, or cloud
services. These checks cannot substitute for a hosted Actions execution.

## Verification results

The foundation commit is present on origin/main. Authenticated GitHub API
verification confirmed the [hosted run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37298345682)
completed successfully for dfdf34beddee8bab81b1a7c898a5da914acd9b04.
The Quality and infrastructure job and every step succeeded: service containers,
frozen pnpm installation, Chromium setup, the complete quality gate, explicit
disposable PostgreSQL migrations, and live PostgreSQL/Redis checks. Reported run
duration was 168 seconds. No hosted-only fix or weakened check was necessary.

Job logs were retrieved in memory and compared with the configured local server
key, database URI/password and Redis URI where present. None appeared. Neither
logs nor credentials were printed or saved. CI uses isolated fixtures and never
loads the developer's local .env. The server/browser boundaries remain intact.
The closeout changes are committed and pushed separately, with latest-run
confirmation recorded after completion.

## Blockers, technical debt, and follow-up

Closeout local `pnpm check` and separate `pnpm audit` passed. The complete gate
includes ten builds, lint, formatting, strict types, 64 unit/integration tests,
three startup checks and six browser checks. Secret scanning covered tracked
files, staged files and generated browser assets. `.env` remains ignored and
untracked. No runtime infrastructure dependency or workflow change was needed.

Hosted CI acceptance has no remaining blocker. Credentials remain in the existing
Windows credential manager; no token is written into project files or reports.
The existing workflow still uses one install and build, lockfile-based store
caching, pinned actions, bounded job/service timeouts and failure propagation.
Branch-protection administration is a later repository-management action.
Service images use explicit supported version lines; optional digest pinning and
reviewed action upgrades remain documented maintenance. TASK-010 was not started.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

CI Pipeline. Workflow structure and deterministic frozen install/quality/disposable-service steps verified. Prior hosted passing runs retained; latest hosted result is recorded separately, without claiming unpushed changes passed remotely.

Files inspected:

- `.github/workflows/ci.yml`
- `tests/integration/ci.test.cjs`

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Workflow structure and deterministic frozen install/quality/disposable-service steps verified. Prior hosted passing runs retained; latest hosted result is recorded separately, without claiming unpushed changes passed remotely.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
