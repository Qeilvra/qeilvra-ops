# Vercel deployment for apps/web

The Vercel project keeps **Root Directory `apps/web`**. Its repository
configuration is `apps/web/vercel.json`; its build command returns to the
repository root to use the existing pnpm workspace orchestration. Dependency
installation keeps Vercel's existing package-manager/workspace detection.

## Project settings

| Setting                                                              | Value                                             |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| Root Directory                                                       | `apps/web`                                        |
| Include source files outside of the Root Directory in the Build Step | Enabled                                           |
| Framework Preset                                                     | Next.js                                           |
| Node.js Version                                                      | 24.x, matching the repository engine requirement  |
| Install Command                                                      | Automatic pnpm workspace detection                |
| Build Command                                                        | `pnpm --dir ../.. run build:web`                  |
| Output Directory                                                     | Next.js default (`.next`, relative to `apps/web`) |

The build command is committed in `apps/web/vercel.json`. Replace any direct
`next build` override with the documented workspace command. Keep the
Root Directory and outside-source option in the Vercel project settings; they
are not changed by this configuration file. pnpm is pinned by the root
`packageManager` field to 10.34.6. To enforce this exact version on Vercel, enable
Corepack with `ENABLE_EXPERIMENTAL_COREPACK=1` in the project environment settings.
Vercel's automatic pnpm selection otherwise follows its lockfile detection.
The JSON intentionally leaves installation detection intact: a bare custom
`pnpm install` override can select Vercel's oldest pnpm version. Install development
dependencies for the TypeScript build; do not use `--prod` during installation.

Vercel documents the
[outside-root source setting](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported)
and [project build overrides](https://vercel.com/docs/project-configuration).
See [package-manager selection](https://vercel.com/docs/package-managers) for
automatic detection and Corepack-based version pinning.

## Dependency build

From the repository root:

```sh
pnpm build:web
```

From Vercel's app working directory, or locally from `apps/web`:

```sh
pnpm --dir ../.. run build:web
```

The root script runs:

```sh
pnpm --filter "@airmech/web..." --fail-if-no-match --sort run build
```

pnpm selects `@airmech/web` and its transitive workspace dependencies and builds
dependencies before consumers. The current selection is config, contracts, UI
and web. Config compilation creates `packages/config/dist/server.js` before
Next.js evaluates `next.config.ts`. Backend database/identity/queue/storage,
API and worker builds are outside this filtered target.

This reuses the existing pnpm build orchestration. There is no Turborepo setup
or new build dependency. Package exports, browser/server import boundaries,
TypeScript settings, application routes and the app's `next build` script stay
intact. `dist` and `.next` remain generated, ignored artifacts.

The selector and dependency ordering follow
[pnpm 10 filtering](https://pnpm.io/10.x/filtering) and
[recursive build ordering](https://pnpm.io/10.x/cli/recursive).

## Environment and backend

Set public `NEXT_PUBLIC_APP_NAME` before the build if overriding its default.
The existing `API_INTERNAL_URL` is a server/build-only HTTPS origin for the
separately deployed API; configure it for each Vercel environment. The loopback
default is for local development. Preserve the existing authentication origin
configuration in the API. See [environment configuration](environment.md).

The frontend build requires no database, Redis, Supabase credentials or
migration commands. It does not deploy the API or worker. Do not publish
backend credentials through `NEXT_PUBLIC_*` variables or copy a local `.env`
into a deployment artifact.

## Verification

CI runs the exact Vercel build command with working directory `apps/web` after
the locked install and before the full repository build. Fresh CI checkouts
and the pnpm store cache contain no committed workspace `dist` folders, so a
direct-Next build regression cannot be hidden by the full build.

Local clean verification moves existing app/package `dist`, `.next` and
TypeScript build-info outputs into an ignored, uniquely named workspace cache,
confirms their absence, reproduces the original direct-Next failure, and then
executes the committed Vercel command from `apps/web`. It confirms only the web
dependency closure is rebuilt before running the existing full `pnpm check`.

Current results and limits are recorded in
[the Vercel build verification](verification/vercel-web.md).
