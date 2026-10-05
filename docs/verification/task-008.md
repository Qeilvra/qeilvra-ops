# TASK-008 verification

Assessment date: 5 October 2026. Status: BLOCKED for hosted activation. The
workflow and local validation are implemented. Following the user's remote
instruction, local Git was initialized on `main` and origin set to
`git@github.com:Qeilvra/qeilvra-ops.git`. Remote access and hosted execution are
blocked by SSH authentication (`Permission denied (publickey)`).

The GitHub Ed25519 host key was checked against its
[official published fingerprint](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)
using a workspace-local ignored known-hosts file and strict checking. No private
key contents were read. No public keys were found in the default SSH directory;
the SSH agent is unavailable. No commit or push was made, and the remote's
existing branches/content could not be inspected. Historical batch checks below
remain unchanged.

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

| Check                                        | Result                                 |
| -------------------------------------------- | -------------------------------------- |
| Workflow implementation                      | Complete                               |
| YAML parsing and structural checks           | Passed: 4 tests, no failures/skips     |
| Local full quality gate and dependency audit | Passed; zero known vulnerabilities     |
| Hosted GitHub Actions execution              | BLOCKED: SSH repository authentication |
| Hosted elapsed-time measurement              | BLOCKED until activation               |

## Blockers, technical debt, and follow-up

TASK-008 remains BLOCKED until SSH repository access is authorized, the remote's
existing history and default branch are inspected, the reviewed workflow is
committed/pushed, and a hosted run succeeds. Local Git and origin are configured;
account changes, repository publication and branch protection were not performed.
Adjust the `main` push trigger if the selected repository has another default
branch, then make the named quality job required for merging.

Service images use explicit supported version lines with patch updates allowed;
exact image digests can be pinned after a hosted runner verifies the selected
platform. Upgrade action SHAs and Node deliberately with normal review.
Existing documented Next lint patch and URLPattern declaration bridge remain
unchanged. No authentication, operational module, or TASK-010 work is included.
