# TASK-001 verification

Verified on 5 October 2026 in the Windows workspace with Node.js 24.14.0,
pnpm 10.34.6, TypeScript 5.9.3, Next.js 16.3.8, React 19.3.0, and NestJS 12.1.2.

## Acceptance evidence

| Check                               | Result                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| Dependency installation             | Passed for all nine workspace projects                  |
| Frozen lockfile installation        | Passed; lockfile current, no resolution changes         |
| Shared-package build                | All five packages passed in dependency order            |
| Strict typecheck                    | All apps/packages and browser/tooling TypeScript passed |
| Lint                                | Passed, including browser/server import boundaries      |
| Formatting                          | Passed; original specification files remain excluded    |
| Unit/integration checks             | 9 passed, 0 failed                                      |
| Complete workspace build            | All three applications and all five packages passed     |
| Compiled application startup checks | 3 passed, 0 failed                                      |
| Browser checks                      | 6 passed, 0 failed across desktop, tablet, and mobile   |
| Dependency advisory audit           | Zero reported advisories at every severity              |

The workspace-resolution tests assert that all five shared package imports point
to local built artifacts. Strict compilation and the actual web/API/worker builds
verify the consumer package boundaries. The API uses ESM because the installed
NestJS release is ESM; worker/shared packages remain CommonJS. This is a package
compatibility choice, not a change to the documented system architecture.

Startup checks exercise compiled processes over HTTP, rather than importing only
source code. They cover API liveness, bounded/generated request IDs, safe 404
responses, malformed JSON (400), oversized input (413), worker liveness, and
production web rendering. Unit tests confirm that unexpected exceptions do not
expose raw SQL, internal paths, stack traces, or private messages.

Playwright used the installed Chromium browser at 1440 × 900, 768 × 1024, and
390 × 844. It verified branding, visible content, no horizontal overflow, bounded
page height, no browser exceptions, and 404 recovery. Desktop and mobile screenshots
were visually inspected; artifacts are in the ignored `test-results` directory.
The browser test runner returned success after its temporary server was stopped.
Windows sandbox permissions blocked normal test-server cleanup/process inspection,
so the server was identified and stopped with an approved, narrowly scoped command.
The separate Node startup tests stopped their own processes automatically.

The web home and not-found pages are statically rendered. There are no remote
fonts/images, charts, domain API requests, database queries, or external-provider
calls in the startup path. This is a foundation review, not a measurement of
production API p95, Core Web Vitals, search, or real operational dataset performance.
Those measurements remain required in the corresponding feature/hardening tasks.

The current TypeScript ESLint peer range excludes TypeScript 7, so TypeScript 5.9
is pinned. Supported ESLint 10 is used without incompatible Next lint aggregators.
An optional Next lint helper was removed after the audit found an unpatched
development dependency advisory. Peer validation and the advisory audit were not
bypassed or suppressed.

## Scope remaining

TASK-001 does not complete authentication/RBAC, complete environment/secret
validation, database/migrations/pooling, Redis/BullMQ consumers, private storage,
CI, operational modules, automation, backups, or UAT. No production credentials,
default user grants, business records, domain migrations, or external integrations
were created. Safe domain errors and validation field errors must be added to
the API boundary before later business routes are introduced.

The initial workspace has no Git repository. Git/remote/CI setup and production
infrastructure remain pending. The first subsequent READY task is TASK-002.
