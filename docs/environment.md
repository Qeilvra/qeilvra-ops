# Environment configuration

TASK-004 prepares configuration only. No database, queue, authentication,
storage, email, telemetry, WhatsApp, or AI clients are created or connected.
TASK-005 through TASK-008 consume this same architecture for opt-in database,
queue and private storage clients; parsing configuration itself still does no
network I/O. See the infrastructure package guides linked in the root README.

## Local, CI, and production setup

Copy the root `.env.example` to root `.env` for local development. Its defaults
start all three foundation apps with future integrations disabled. Build shared
packages before starting apps, and rebuild them after changing shared configuration.
Do not commit populated environment files.

The Node-only loader in `@airmech/config/server` reads root `.env` automatically
in development. Production and test modes use process variables without reading
that file. An explicit `ENV_FILE` may select a private file in any mode; a missing
or unreadable explicit file fails startup. Relative explicit paths resolve from
the process working directory; prefer absolute paths for deployment. Process
variables override file values. Loading does not change `process.env`.

Use complete literal values in the shared file. The loader uses Node's built-in
[dotenv parser](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseenvcontent),
without variable substitution. Quotes and comments are supported. Do not rely on
`$VARIABLE` references, which Next's own app-level dotenv loader expands differently.
Prefer the single root development file and injected CI/production variables over
app-specific `.env*` files. Next's existing framework loading remains intact.

CI and production should inject settings through their private environment/secret
manager. No provider credentials are required while flags remain false. If an
integration flag is true, its required settings must be supplied, even though
TASK-004 itself only validates readiness and does not implement the integration.

## Ownership and browser boundary

| Entry point              | Purpose                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `@airmech/config/client` | Pure public parser; returns only the validated app name                        |
| `@airmech/config/server` | Node file loading, web startup validation, and API/worker server configuration |
| `@airmech/config`        | Existing process-settings compatibility API; server-only export                |

API and worker validate once before constructing/listening on their existing
servers. Future modules should receive that configuration rather than reading
`process.env`. All nested settings are readonly and frozen.

Next's Node-only `next.config.ts` validates public settings and publishes only
`NEXT_PUBLIC_APP_NAME` for the framework's normal public-variable inlining. The
single adapter `apps/web/src/config/client.ts` reads that literal key. Existing
page metadata uses the typed app name without introducing screens or workflows.
Public values are fixed when the web app is built; rebuild when they change.
This follows [Next's public-variable behavior](https://nextjs.org/docs/app/guides/environment-variables#bundling-environment-variables-for-the-browser).

There is no universal browser-importable configuration object. Package exports
reject root/server runtime imports under the browser condition. Lint checks
also reject server/config internals in browser/UI source, protect the pure client
dependency graph, and prevent scattered environment reads. Server config is
allowed in the Node-only Next config file. Existing database, Node, and
transport-contract boundaries remain enforced.

Only `NEXT_PUBLIC_APP_NAME` is approved. Unknown `NEXT_PUBLIC_*` keys fail
validation, including accidentally prefixed service-role or provider secrets.
Supabase project URL and anon key are reserved server settings for now; browser
Supabase access is unnecessary in the current API-oriented architecture.

## Variables

| Variable                    | Default/requirement                                                          | Exposure       |
| --------------------------- | ---------------------------------------------------------------------------- | -------------- |
| `NODE_ENV`                  | `development`; exactly `development`, `test`, or `production`                | Server/tooling |
| `HOST`                      | `127.0.0.1` for API/worker                                                   | Server         |
| `PORT`                      | API `3001`, worker `3002`; integer `1..65535`                                | Server         |
| `ENV_FILE`                  | Optional explicit private dotenv file                                        | Server/tooling |
| `NEXT_PUBLIC_APP_NAME`      | `Airmech One`; bounded nonblank text                                         | Public         |
| `DATABASE_ENABLED`          | `false`; requires `DATABASE_URL` when true                                   | Server         |
| `DATABASE_URL`              | PostgreSQL URL; PostgreSQL via Supabase direction                            | Server secret  |
| `DATABASE_MIGRATION_URL`    | Optional direct/session URL for explicit migrations; defaults to runtime URL | Server secret  |
| `DATABASE_CA_FILE`          | Optional PEM CA path for verified remote PostgreSQL TLS                      | Server         |
| `REDIS_ENABLED`             | `false`; requires `REDIS_URL` when true                                      | Server         |
| `REDIS_URL`                 | `redis://` or `rediss://` URL                                                | Server secret  |
| `AUTH_ENABLED`              | `false`; requires `AUTH_SECRET` when true                                    | Server         |
| `AUTH_SECRET`               | At least 32 characters                                                       | Server secret  |
| `STORAGE_ENABLED`           | `false`; requires Supabase URL, service-role key, and bucket when true       | Server         |
| `SUPABASE_URL`              | HTTP(S) project URL                                                          | Server         |
| `SUPABASE_ANON_KEY`         | Optional reserved project key                                                | Server         |
| `SUPABASE_SERVICE_ROLE_KEY` | Private elevated key; never public-prefixed                                  | Server secret  |
| `STORAGE_BUCKET`            | Private bucket identifier                                                    | Server         |
| `STORAGE_SECRET`            | Optional reserved alternative-storage credential                             | Server secret  |
| `EMAIL_ENABLED`             | `false`; requires API key and sender when true                               | Server         |
| `EMAIL_API_KEY`             | Provider credential                                                          | Server secret  |
| `EMAIL_FROM`                | Sender email address                                                         | Server         |
| `OBSERVABILITY_ENABLED`     | `false`; requires endpoint when true                                         | Server         |
| `OBSERVABILITY_ENDPOINT`    | HTTP(S) collector endpoint                                                   | Server         |
| `OBSERVABILITY_API_KEY`     | Optional collector credential                                                | Server secret  |
| `OBSERVABILITY_SAMPLE_RATE` | `1`; number `0..1`                                                           | Server         |
| `WHATSAPP_ENABLED`          | `false`; requires token when true                                            | Server         |
| `WHATSAPP_TOKEN`            | Reserved provider credential                                                 | Server secret  |
| `AI_ENABLED`                | `false`; requires API key when true                                          | Server         |
| `AI_API_KEY`                | Reserved provider credential                                                 | Server secret  |

`HOST` and `PORT` are process overrides: setting a single root `PORT` applies it
to both Node apps, so override it separately when running them together. Web
hostname/port remain controlled by the existing Next scripts/CLI.

Boolean settings accept exactly `true` or `false`. Disabled providers do not
require future credentials, but any supplied value is still validated. Omit
unused settings rather than assigning empty strings. URL checks reject invalid
protocols, malformed ports, whitespace, and missing hosts; HTTP endpoint settings
reject embedded credentials. Supabase Storage remains the prepared storage
direction; alternate private storage requires a later approved implementation.

## Failures and tests

Invalid settings fail before the Node app binds its listener. Errors identify
the variable and expected format, without its value, dotenv contents, or raw
loader errors. API/worker retain safe `INVALID_CONFIGURATION` startup log events.
Never log or serialize the server config object.

Unit tests pass explicit dictionaries and private temporary-file fixtures.
Integration tests launch compiled apps with isolated safe process environments,
checking missing and malformed settings without external connections. Existing
startup/browser runners retain only essential OS variables and explicit safe
test settings; developer provider keys and `NODE_OPTIONS` are excluded. Public
app name defaults are pinned in browser tests. No developer secrets are needed.

Run `pnpm test` for validation and boundary tests, then `pnpm check` for the full
build/lint/format/typecheck/unit/integration/startup/browser/audit gate.
