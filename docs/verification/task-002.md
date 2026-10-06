# TASK-002 verification

Verified on 5 October 2026 in the Windows workspace with Node.js 24.14.0,
pnpm 10.34.6, TypeScript 5.9.3, Next.js 16.3.8, React 19.3.0, and NestJS 12.1.2.
Status: DONE. TASK-003 — Code Quality is next and has not been started.

## Documentation and repository review

Read all existing project specifications and README before editing, including
the Features, Workflows, and Roadmap sections embedded in `prd.md`. Those three
documents have no standalone files, as the existing README explains. Inspected
all applications, packages, manifests, TypeScript configurations, exports,
source, tests, and lint/format/build configuration from TASK-001.

## Changes and shared configuration

Extended the existing configuration files in place rather than introducing
a parallel configuration directory. Consumers resolve the exported presets
through the existing `@airmech/config` workspace dependency.

```text
packages/config/
  tsconfig.base.json
  tsconfig.library.json  -> base
  tsconfig.node.json     -> library
  tsconfig.nestjs.json   -> node
  tsconfig.react.json    -> library
  tsconfig.nextjs.json   -> base
  tsconfig.json          -> node (config package's own source)
```

| Consumer             | Preset  | Environment and build behavior                               |
| -------------------- | ------- | ------------------------------------------------------------ |
| `apps/web`           | nextjs  | ES2024/DOM, React, Bundler/ESNext, no emit, incremental      |
| `apps/api`           | nestjs  | ES2022/Node, Node16 resolution, ESM, decorators and metadata |
| `apps/worker`        | node    | ES2022/Node, Node16 resolution, CommonJS                     |
| `packages/ui`        | react   | ES2022/DOM, React types/JSX, CommonJS declarations           |
| `packages/contracts` | library | ES2022, no automatic ambient types, CommonJS declarations    |
| `packages/database`  | node    | ES2022/Node, server package, CommonJS declarations           |
| `packages/config`    | node    | ES2022/Node, process configuration, CommonJS declarations    |
| `packages/testing`   | node    | ES2022/Node for existing `node:assert` helpers               |
| Root tooling         | node    | No emit; DOM explicitly added for Playwright page callbacks  |

Local configs retain source inclusion, output directories, and the web `@/*`
alias. Existing `@airmech/*` package imports resolve through pnpm links and
package exports; no source-path aliases or custom runtime resolver were added.
The API remains ESM for NestJS 12, while the worker and packages remain CommonJS.

The root `pnpm typecheck` already builds shared declarations and checks every
workspace plus `tsconfig.tools.json`; it is retained. Each app/package keeps
its individual typecheck script. Web typechecking now runs `next typegen`
before `tsc --noEmit` and includes `next.config.ts` and generated App Router types.
The existing README commands remain accurate, so README was left unchanged.

## TypeScript guarantees and package boundaries

The shared base keeps `strict: true`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, consistent filename casing,
JSON resolution, ES module interoperability, and `noEmitOnError`. It adds
`noFallthroughCasesInSwitch`, `isolatedModules`, and an explicit empty ambient
type list. `skipLibCheck: false` checks dependency declarations as well as source.
No errors were ignored and no `any` workarounds were introduced.

Node presets explicitly load Node types without DOM libraries. Contracts have
no browser or Node ambient assumptions; UI loads only React ambient types and
browser libraries. Testing retains Node types needed by its actual helpers;
no Jest, Vitest, or other unused test globals were added.

Next.js references Node declarations internally, so its unified TypeScript
program cannot exclude every Node global. Browser/UI source lint guards reject
Node globals, bare and prefixed Node imports, NestJS, database imports, and
runtime config imports. Contract import restrictions also reject Node and
framework implementations. These changes are limited to the requested package
boundaries; they do not implement TASK-003's broader code-quality work.

The database export adds `browser: null`, so a resolver using the browser
condition rejects its runtime entry. Node consumers retain the same entry and
TypeScript declarations. The existing web/UI database import prohibition remains.
TypeScript alone is not an architectural authorization boundary; lint and package
exports complement its environment settings.

## Framework declaration compatibility

Full declaration checking revealed that Next.js 16.3.8 expects
`PromiseWithResolvers` and two standard URLPattern names absent from the previous
web library settings. The Next preset uses ES2024 libraries while retaining
ES2022 output targeting. `apps/web/types/url-pattern.d.ts` supplies only the
missing `URLPatternInput` and `URLPatternOptions` definitions, using the existing
`URLPatternInit` declaration supplied by the installed Node types. Their shapes
follow the [WHATWG URL Pattern standard](https://urlpattern.spec.whatwg.org/).
This declaration adds no runtime code or polyfill and requires no dependency.

Remove the bridge when the supported TypeScript DOM declarations include these
names. TypeScript remains pinned to the supported TASK-001 version; declarations
in `node_modules` were not patched or skipped.

## Verification results

| Command             | Result                                                     |
| ------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`    | Passed: all eight app/packages and root tooling; no errors |
| `pnpm lint`         | Passed, including browser/server and contract boundaries   |
| `pnpm format:check` | Passed                                                     |
| `pnpm test`         | Passed: 9 unit/integration tests, 0 failures               |
| `pnpm build`        | Passed: all five packages and all three apps               |
| `pnpm test:smoke`   | Passed: 3 compiled application startup tests, 0 failures   |
| `pnpm test:browser` | Passed: 6 desktop/tablet/mobile checks, 0 failures         |

Commands used the existing cached, pinned pnpm executable (`pnpm.cmd` on Windows)
on PATH because Corepack's default home cache is outside the writable workspace.
Browser checks used the installed Chrome executable through the existing
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` setting. Windows sandbox process permissions
prevented normal Playwright server cleanup. The exact server command and port
were verified, then that temporary process alone was stopped with a narrowly
scoped approved command. The browser runner subsequently exited successfully.

Independent compiler/configuration probes verified all nine effective configs
retain strict checks and do not skip declarations. Synthetic invalid code was
rejected for Node globals in UI/contracts, browser globals in API/worker,
implicit `any`, null misuse, unchecked array access, and invalid optional values.
Lint probes rejected prohibited static imports and Node globals in browser source.
The database resolves to the same built artifact in Node and rejects the browser
condition with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Compiled NestJS controller/filter
output still contains decorator metadata. Removing the URLPattern bridge
reproduced the upstream declaration errors; including it passed full checking.

The web production build still statically renders the home and not-found pages.
No runtime dependencies, bundler changes, project references, or additional
build orchestration were introduced. Existing Next incremental checking remains;
the small emitted packages continue using the established dependency-order build.
This verifies build compatibility, not production operational performance targets.

## Files changed

- Shared configuration: `packages/config/tsconfig.base.json`,
  `packages/config/tsconfig.node.json`, `packages/config/package.json`;
  added `tsconfig.library.json`, `tsconfig.react.json`, `tsconfig.nextjs.json`,
  and `tsconfig.nestjs.json` in the same package.
- Application configuration: `apps/web/tsconfig.json`, `apps/web/package.json`,
  `apps/api/tsconfig.json`, `apps/worker/tsconfig.json`;
  added `apps/web/types/url-pattern.d.ts`.
- Package configuration: `packages/ui/tsconfig.json`,
  `packages/contracts/tsconfig.json`, `packages/database/tsconfig.json`,
  `packages/database/package.json`, `packages/testing/tsconfig.json`.
- Tooling and documentation: `tsconfig.tools.json`, `eslint.config.mjs`,
  `Task.md`, and this verification note.

Baseline hashes confirmed the existing runtime source, UI, tests, dependency
versions, and lockfile were untouched. No auth, database schema, Supabase,
operational modules, or later tasks were introduced. No TASK-002 blockers remain;
the URLPattern declaration bridge is the documented upgrade follow-up.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

TypeScript Configuration. Strict presets and complete workspace/tooling typechecking verified; no foundation acceptance gap.

Files inspected:

- `packages/config/tsconfig*.json`
- `apps/*/tsconfig.json`
- `packages/*/tsconfig.json`
- `tsconfig.tools.json`

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Strict presets and complete workspace/tooling typechecking verified; no foundation acceptance gap.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
