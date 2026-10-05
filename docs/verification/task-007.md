# TASK-007 verification — private object storage

Date: 5 October 2026. Status: BLOCKED pending a real configured private bucket.
The batch quality gate passed. Local scaffolding is implemented;
cloud verification has not been claimed.

## Objective

Provide lean server-side Supabase Storage infrastructure for future business
documents, with private access, bounded streaming, file validation, and
short-lived authorized downloads. Do not begin authentication, document
business modules, or TASK-010.

## Implementation and files changed

- `packages/storage/package.json`, `tsconfig.json`, `src/index.ts`, and
  `README.md`: server-only package, adapter, file policy, and developer setup.
- `tests/unit/storage.test.cjs`: isolated loopback REST fixtures.
- `tests/live/storage.test.cjs`: separate opt-in live provider verification.
- This verification document. Root batch integration separately wires package
  dependencies, build/test discovery, and import boundary tests.

The adapter uses built-in Node `fetch` and streams through native Node/Web
streams. No Supabase auth/realtime SDK or additional runtime library is added.
The existing TASK-004 `ServerConfiguration.storage` is passed in; no direct
environment reads occur in the package. Construction performs no network I/O.

## Architecture

API/worker → `@airmech/storage` → Supabase Storage REST. Web/UI/contracts cannot
import the server package; its export has `browser: null`. The service offers
upload, signed download, metadata, deletion, and an explicit private-bucket
readiness probe. It neither creates buckets nor changes provider policies.

Supabase's [private-bucket model](https://supabase.com/docs/guides/storage/buckets/fundamentals)
permits authorized or time-limited signed downloads. Its
[service keys bypass RLS](https://supabase.com/docs/guides/storage/security/access-control),
so application object authorization must precede every file operation. The
small REST adapter follows the provider's
[bucket](https://github.com/supabase/storage-js/blob/master/src/packages/StorageBucketApi.ts)
and [file](https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts)
implementations. Streaming avoids the full-file Blob buffering of a convenience
SDK and keeps provider-specific code in one package.

## Security considerations

- Missing/throwing/denying authorizers reject operations before credentialed I/O.
  Authorization requests carry the actor, action, owner, entity, and exact key.
  Future modules must resolve those associations from trusted records.
- All operations confirm `public === false` for the configured existing bucket.
  No public URL API exists. Signed routes must match the exact requested object
  and expire in 1–300 seconds (60 seconds by default).
- Generated UUID paths replace raw filenames; identifiers and object association
  are validated. Uploads never overwrite. Owner/entity references are attached
  as provider metadata, but are not treated as proof of authorization.
- Size, extension, MIME allowlist, binary headers, and UTF-8 text are validated.
  The initial maximum is 6 MiB. Full malicious-content scanning is deferred.
- TLS is required outside loopback. Requests never forward credentials on a
  redirect. Provider bodies, URLs/tokens, and original exceptions do not enter
  error messages. Private class fields prevent accidental service serialization.
- Live verification uses a unique harmless artifact and removes only its exact
  generated key in `finally`. No account/bucket creation is authorized or needed.

## Performance considerations

No network activity or SDK startup overhead occurs when the API/worker
constructs the adapter. Native fetch reuses HTTP connections. Uploads preserve
backpressure, check exact bytes, and retain only eight signature bytes rather
than materializing the file. Callers should provide bounded stream chunks.
JSON replies are capped at 64 KiB; operations have bounded timeouts and no
retry loops. Bucket verification intentionally adds one read per file operation
to fail closed when provider visibility changes. Heavy processing remains a
worker responsibility. No browser bundle or mobile payload is enlarged.

## Tests

Unit fixtures exercise configuration integration, lazy construction, private
credential serialization, default/failed authorization, streamed upload and
byte count, generated paths, entity isolation, MIME/signature/file limits,
private-bucket enforcement, TTL bounds, signed route validation, metadata,
exact-key cleanup, response bounds, timeout, redirect rejection, and safe errors.
The live test verifies upload → unsigned denial on public/authenticated routes
(using the anonymous project key too when configured) → signed retrieval → metadata
→ cleanup against an existing private bucket; missing settings are explicit skips.
Root boundary tests cover the server-only import/export conditions separately.

## Commands run and verification results

| Command                                                                                                                       | Result                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.\\node_modules\\.bin\\tsc.cmd -p packages/storage/tsconfig.json`                                                            | Passed strict package compilation                                                         |
| `.\\node_modules\\.bin\\eslint.cmd packages/storage tests/unit/storage.test.cjs tests/live/storage.test.cjs --max-warnings 0` | Passed, zero warnings/errors                                                              |
| `node --test tests/unit/storage.test.cjs tests/live/storage.test.cjs`                                                         | Eight local tests passed; live verification skipped with explicit missing-setting blocker |
| Scoped Prettier formatting                                                                                                    | Passed                                                                                    |

The complete `pnpm check` gate passed: all production builds, strict types, lint,
formatting, 64 unit/integration tests, three startup tests, six browser checks,
and audit with no known vulnerabilities. Required standalone format/lint/types/
test/build/audit commands and frozen installation passed as well.
The separate live suite recorded six PostgreSQL/Redis passes and one explicit
Supabase Storage credential skip. Ordinary local tests require no cloud secrets;
real cloud storage verification remains a separate opt-in check.

## Blockers

Real Supabase Storage verification requires a configured project URL, server
service-role key, and an existing private bucket. CLI sign-in alone does not
provide these application settings. Do not mark DONE until cloud acceptance
and the required quality gate pass.

## Technical debt and follow-up

Connect future authenticated actor/object policies without changing the safe
default. Persist document associations in the owning future business module.
Review permitted formats, antivirus/quarantine, archive/retention, resumable
uploads above 6 MiB, and mobile photo compression during document tasks.
Restricted bucket administration remains necessary because visibility changes
outside an application request cannot be prevented by this adapter. TASK-010
is next after this controlled batch; it is not implemented here.
