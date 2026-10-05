# TASK-003 verification

Verified on 5 October 2026 in the Windows workspace with Node.js 24.14.0,
pnpm 10.34.6, TypeScript 5.9.3, ESLint 10.12.0, TypeScript ESLint 8.71.0,
Prettier 3.9.9, Next.js 16.3.8, and Playwright 1.63.0.
Status: DONE. TASK-004 — Environment Configuration is next and has not been started.

## Objective and scope

Provide one reliable, fast code-quality system for all three applications and
all five shared packages while preserving TASK-001 tests and TASK-002's strict
TypeScript architecture. Read the existing project specifications, README,
implementation plan, and both previous verification notes before editing.
Features, Workflows, and Roadmap remain embedded in `prd.md`; standalone files
do not exist. Inspected manifests, source, build configurations, and every test.

No environment configuration, business features, new screens, authentication,
database models, or later tasks are implemented here.

## Lint architecture

The existing root `eslint.config.mjs` remains the only ESLint configuration.
Its global ignores exclude dependencies, output, caches, generated Next files,
coverage, and browser artifacts. Root and package lint commands treat warnings
as failures. Unused disable comments also fail linting.

- Existing recommended JavaScript/TypeScript checks retain unused-variable and
  explicit-`any` protection. Added debugger, duplicate-import, and asynchronous
  Promise-executor checks without moving formatting into ESLint.
- App/package TypeScript uses the project service and its actual local tsconfig.
  Root Playwright TypeScript uses the existing `tsconfig.tools.json`. Selected
  type-aware rules reject floating/misused promises, awaiting non-promises,
  unsafe assignments/calls/member access/arguments/returns, and unnecessary
  runtime imports of types. `void` does not excuse an unhandled promise.
- The official React Hooks plugin checks hook call order and effect dependencies
  in web/UI source. The official Next.js plugin supplies its Core Web Vitals
  rules for web files; the web root is absolute and also works from package
  working directories.
- TASK-002's import/global guards remain. The small local rule in
  `scripts/eslint-boundaries.mjs` additionally checks literal dynamic imports,
  CommonJS loads, exports, resolved relative paths, and the existing web alias.
  Literal template strings without expressions are checked as well.
  Browser/UI code cannot import database/Node/server implementations. Contracts
  cannot import application implementations, Node dependencies, or UI/framework
  code. This rule does no filesystem scans and adds no dependency framework.

The new integration suite uses the actual ESLint configuration and real project
paths with in-memory invalid examples. It checks both rejected mistakes and
accepted safe code, including Next app-root discovery and internal navigation.

## Formatter and TypeScript

Prettier remains the sole formatter, with the unchanged `.prettierrc.json`.
Root `format` and `format:check` remain deterministic. Package checks use the
same root ignore file. Browser reports/results now join its artifact exclusions;
the original specification documents keep their existing formatting exclusions.
Only files changed for this task were formatted.

All 15 TypeScript configuration files match the pre-task baseline. Strict mode,
unchecked-index/optional-property checks, environment-specific libraries,
decorator metadata, declaration checking, package exports, and runtime module
formats remain intact. No TypeScript errors are skipped. Root standalone
typechecking still builds shared declarations before checking every workspace
and root tooling.

## Test setup and commands

Node's existing test runner and Playwright are retained; no duplicate test or
formatting tools were installed. All nine existing unit/integration tests,
three compiled startup tests, and six browser checks are preserved.
Seven integration tests now exercise the quality rules. One unit test uses a
real owned Node process to verify that a post-spawn error cannot fake successful
browser-runner cleanup.

| Command                                      | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm lint`                                  | One repository-wide ESLint pass; zero warnings allowed                       |
| `pnpm format` / `pnpm format:check`          | Apply/check the existing Prettier configuration                              |
| `pnpm typecheck`                             | Prepare shared declarations, check all eight workspaces and root tooling     |
| `pnpm build`                                 | Build all packages/apps in dependency order                                  |
| `pnpm test`                                  | Prepare packages/API, then run unit and integration tests                    |
| `pnpm test:unit` / `pnpm test:integration`   | Prepare dependencies and run one category                                    |
| `pnpm test:smoke`                            | Check compiled web/API/worker startup after a build                          |
| `pnpm test:browser`                          | Run six viewport checks against an owned production web server after a build |
| `pnpm audit`                                 | Report dependency advisories without exclusions                              |
| `pnpm check`                                 | Full ordered quality gate, with one full build                               |
| `pnpm typecheck:workspace` / `pnpm test:run` | Reuse a prior build inside the quality gate                                  |

Every app/package has `lint`, `typecheck`, `build`, and `format:check` scripts.
Web, API, and config expose the actual suites relevant to them. Other packages
are exercised by root integration/startup tests rather than placeholder scripts.
README now documents these commands and test locations.

The browser runner starts Next directly without a shell, selects a temporary
loopback port, requires server readiness plus HTTP success, and owns its server
and Playwright child processes. Cleanup awaits actual exits, escalates only its
own children if needed, and reports failures. Playwright forbids focused tests,
uses two workers with no retries, and limits the suite to 120 seconds. There
are no arbitrary test sleeps: the runner's bounded polling waits for readiness.
Existing desktop/tablet/mobile coverage and screenshots are unchanged.

`check` runs one full build, lint, formatting, workspace typechecking,
unit/integration tests, startup tests, browser tests, and audit, stopping at any
failure. Building first gives typed lint fresh shared declarations, including
on a clean checkout, and avoids repeated prerequisite builds. Existing Next
incremental checking is retained. Typed lint deliberately runs without a result
cache, so type changes in imported files cannot leave stale cached successes.
No CI provider configuration or later CI task was introduced.

## Dependency compatibility and narrow exceptions

Only the two required framework lint plugins were added as pinned development
dependencies: `@next/eslint-plugin-next@16.3.8` and
`eslint-plugin-react-hooks@7.1.1`. Runtime dependencies are unchanged.

The Next plugin's original `fast-glob` chain reintroduced the unpatched
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) previously
avoided in TASK-001. A
[scoped pnpm override](https://pnpm.io/10.x/settings#overrides) replaces only
that plugin's glob dependency with pinned `tinyglobby@0.2.17`, already present
in the existing graph. No advisory was ignored.
The [official Next helper](https://github.com/vercel/next.js/blob/v16.3.8/packages/eslint-plugin-next/src/utils/get-root-dirs.ts)
uses only `globSync(pattern, { onlyDirectories: true })`, which
[tinyglobby supports](https://github.com/SuperchupuDev/tinyglobby).
A small, version-specific [pnpm package patch](https://pnpm.io/10.x/cli/patch)
normalizes the root pattern, disables directory expansion, requests absolute
results, and supplies a stable filesystem-root working directory to this helper.
These explicit options preserve fast-glob's app discovery and avoid tinyglobby's
empty-pattern failure when the configured app is also the current directory.
The patch is tracked under `patches/`, registered in `pnpm-workspace.yaml`, and
applied reproducibly during installation. Exact-version patch failures stop
installation; no failure-ignore option was enabled. No TypeScript declaration
or lint-rule implementation was patched. Direct comparison confirmed matching
app locations, and regression tests exercise the actual Next root helper from
both repository and web working directories plus the App Router link rule.
Instrumented discovery read only `apps/` and `apps/web/`, with no drive-wide
traversal or recursive output-directory scans.

Native CommonJS tests/tooling retain a scoped exception to the TypeScript
`no-require-imports` rule. Browser source retains its prohibition on `require`.
One inline Next navigation exception on the existing web error screen keeps
its deliberate full-document reload, which resets the error boundary. It
changes no UI behavior and is enforced as a used, documented single-line
exception. There are no broad disable blocks or TypeScript suppressions.

## Verification results

| Command/check                    | Result                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed for all nine projects; lockfile and patch current             |
| `pnpm typecheck`                 | Passed for all eight apps/packages and root tooling; zero errors     |
| `pnpm lint`                      | Passed repository-wide; zero errors or warnings                      |
| `pnpm format:check`              | Passed                                                               |
| `pnpm test` / `pnpm test:run`    | 17 passed: 7 unit and 10 integration; zero failures/skips            |
| `pnpm build`                     | All five shared packages and three apps passed                       |
| `pnpm test:smoke`                | 3 compiled startup tests passed; zero failures                       |
| `pnpm test:browser`              | 6 checks passed across desktop/tablet/mobile; zero failures          |
| `pnpm audit`                     | No known vulnerabilities at any severity                             |
| `pnpm check`                     | Complete ordered gate passed after removing existing build artifacts |
| Scoped package checks            | Web/contracts lint and web/config formatting checks passed           |

Total: 26 tests passed, including every existing TASK-001/TASK-002 test.
Standalone `typecheck` and `test` were checked as well as the optimized complete
gate. The final gate started with all five package `dist` directories, both Node
app `dist` directories, and web `.next` moved into the ignored workspace cache.
It recreated every artifact before typed lint and completed successfully.
The web still statically renders `/` and `/_not-found`.

Additional checks confirmed the Next helper discovers the actual web root from
both repository and app working directories. Real scoped web lint passed after
the compatibility patch. A deliberate missing-project browser invocation returned
exit code 1 and its owned server port was closed afterward. The real-process
cleanup regression also passed. Baseline hashes confirmed all existing tests
and all 15 TypeScript configuration files are unchanged. Every workspace exposes
the documented package quality scripts.

Commands used the existing pinned cached `pnpm.cmd` on PATH because Corepack's
default home cache is outside the writable workspace. Browser checks used the
installed Chrome executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Owned
process cleanup succeeded within the sandbox without manual termination or
additional permissions. Detailed command logs are in ignored `.cache/task-003`.

## Files changed

- Root tooling: `eslint.config.mjs`, `.prettierignore`, `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `playwright.config.ts`.
- Package commands: `apps/web/package.json`, `apps/api/package.json`,
  `apps/worker/package.json`, and `package.json` in all five shared packages.
- New tooling/tests: `scripts/eslint-boundaries.mjs`,
  `scripts/test-browser.cjs`, `tests/integration/quality.test.cjs`, and
  `tests/unit/browser-runner.test.cjs`.
- Dependency compatibility: `patches/@next__eslint-plugin-next@16.3.8.patch`.
- Existing error recovery: `apps/web/src/app/error.tsx` (one lint comment).
- Documentation: `README.md`, `Task.md`, and this verification note.

## Follow-up and limits

Revisit the narrowly scoped glob override and package patch when upgrading the Next lint plugin
or once its upstream dependency chain is safe. Its version selector makes that
upgrade deliberate; retain the root-discovery regression test. TASK-002's
documented URLPattern declaration bridge remains unchanged.

Import linting checks statically identifiable paths; it is not a runtime
security sandbox. Browser execution needs an installed Chromium browser,
and the advisory audit needs registry access. Quality verification does not
measure future operational workloads or replace later security/domain tests.
The workspace still has no Git repository; later CI infrastructure remains
out of scope. There are no remaining TASK-003 blockers. TASK-004 is next and
has not been started.
