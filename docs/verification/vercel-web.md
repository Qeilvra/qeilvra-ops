# Vercel web workspace build verification

Assessment: 6 October 2026. Scope: deployment build orchestration for the
existing `apps/web` Next.js app. Application behavior is unchanged.

## Cause and change

Next.js evaluates `apps/web/next.config.ts` before its application build. That
file imports `@airmech/config/server`, whose package export points to generated
`packages/config/dist/server.js`. A direct app-only `next build` on a clean
checkout does not compile that package and fails with `MODULE_NOT_FOUND`.

No Turborepo dependency/configuration is present. The root `build:web` command
reuses pnpm's existing dependency-ordered build orchestration, filtered to the
dependency-only selector `@airmech/web^...`, followed by web's raw `build:next`
script. `apps/web/vercel.json` invokes it from the configured app root. The
default app `build` script calls the same root orchestration, covering Vercel
deployments whose logs still show `pnpm run build`. The app still runs `next build`;
no source aliases, package exports, compiler
settings, runtime routes, credentials or committed generated outputs changed.

Files:

- `package.json`: filtered root `build:web` script.
- `apps/web/package.json`: safe default wrapper and separate raw `build:next` script.
- `apps/web/vercel.json`: workspace-aware build command; installation detection preserved.
- `.github/workflows/ci.yml`: app-root filtered build before the complete gate.
- `tests/integration/ci.test.cjs`: verify the Vercel/CI build command and ordering.
- `docs/deployment-vercel.md` and root `README.md`: deployment setup.

## Clean verification in this run

The isolated local runner validates absolute/resolved artifact paths remain in
the workspace before moving generated app/package `dist`, web `.next` and web
TypeScript build-info outputs to an ignored cache. No source or secret file is
moved, no artifact is copied into tracked files, and no database is touched.

Verified:

1. All app/package `dist` directories and web build caches were absent.
2. Direct `pnpm exec next build` from `apps/web` reproduced the missing config server module.
   On Windows the reported path uses the workspace symlink under
   `apps/web/node_modules/@airmech/config/dist/server.js`; its target is the same
   missing generated package export as the Vercel failure.
3. A locked workspace install was executed from `apps/web` using the local store
   (`--offline` added only for local verification). All generated outputs stayed
   absent after installation.
4. `pnpm --dir ../.. run build:web` from `apps/web` succeeded. Config completed
   first, then contracts/UI, then the production Next.js build and all existing
   routes. `packages/config/dist/server.js` and the web `.next/BUILD_ID` exist.
5. Only config, contracts, UI and web were built. Database, identity, queue,
   storage, testing, API and worker generated outputs remained absent.
6. After clearing generated outputs a second time, the default app-root
   `pnpm run build` succeeded through the same root orchestration. The root
   invokes the raw Next script separately, avoiding recursive wrapper calls.

Detailed clean-build logs and prior outputs are ignored under `.cache/vercel-web`.

## Regression and CI

The workflow performs the same app-root build before `pnpm check`, so the full
repository build cannot conceal a missing dependency build on a fresh runner.
All existing frozen-install, lint, formatting, strict types, test, browser,
advisory and disposable PostgreSQL/Redis checks are retained.

The local full `pnpm check` passed: all eleven app/package builds, lint,
formatting, strict workspace/tooling types, 79 unit/integration tests, three
compiled startup checks, 52 browser checks and zero known dependency advisories.
The final configuration, preserving Vercel's automatic installation detection,
also passed clean app-root installation/build, all four workflow assertions and
the complete local gate.

The first implementation's
[hosted CI run 37480003997](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37480003997)
passed for implementation commit `93ce943d4f3d86a25529834b8c608ce6944d68c5`.
Every step succeeded, including locked installation, the clean app-root web
build, the complete quality gate, and actual disposable PostgreSQL/Redis checks.

GitHub reported the Vercel preview for that first commit as failed. The deployment's
private metadata/log endpoints reject unauthenticated reads (HTTP 403), so no
live Vercel success is claimed. The owner confirmed Root Directory `apps/web`,
Next.js, Node 24.x, the documented build command, outside-root sources enabled
and Corepack enabled. The supplied failure log still invoked the old direct
app build (`pnpm run build` → `next build`) without dependency compilation.
The default build wrapper now covers that entry point too. Its custom and
default commands both passed independently from clean artifacts; the complete
local gate also passed with 79 unit/integration, three startup and 52 browser
checks plus build/lint/format/types/audit. Hosted verification of this follow-up
is recorded after publication.

## Deployment settings and limits

Keep Root Directory `apps/web`, Next.js's default output and the outside-root
source option enabled as documented in [deployment setup](../deployment-vercel.md).
The JSON build command overrides the direct-Next default without changing app
runtime behavior. Generated outputs remain ignored. Provider settings and
hosted redeployment must use this repository revision to receive the fix.
