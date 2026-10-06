# TASK-007 verification — private object storage

Date: 5 October 2026. Status: DONE after live private Storage acceptance and
local quality verification.

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

## Live closeout results and blockers

Closeout on 5 October 2026 used the ignored local SUPABASE_URL and server key.
The project bucket API returned HTTP 200 and exactly one existing bucket with
public=false. Its validated identifier was saved as local STORAGE_BUCKET;
no bucket was created and no provider policy was changed. Verification used the
configured project origin without a Data API suffix.

The live test passed without skips: server adapter private-bucket verification,
tiny generated-key upload, uploaded-object metadata, unsigned public denial,
anonymous authenticated-route denial, authorized signed download and exact
content match. A separate one-second signed URL was rejected after expiry.
Finally the adapter deleted the exact generated object, metadata access failed,
and an independent listing of its unique test prefix returned an empty array.
Supabase reports missing-object metadata as HTTP 400 on this project; the test
accepts 400/404 only alongside that independent empty-prefix confirmation.
All temporary objects were removed, including the initial check whose cleanup
assertion expected only HTTP 404. No signed URL or secret was printed.

Command: NODE_ENV=test ENV_FILE=<local ignored env path> node --test
tests/live/storage.test.cjs. Result: 1 passed, 0 failed, 0 skipped.
The public-key probe uses apikey only because publishable keys are not user JWTs.
The adapter, deny-default authorization, 6 MiB bounded streaming, generated paths,
300-second TTL ceiling and browser/server separation remain unchanged.
No cloud storage acceptance blocker remains. Status is DONE after the full local
gate passed; final gate evidence is recorded below.

## Technical debt and follow-up

Closeout `pnpm check` passed: ten builds, lint, formatting, strict types,
64 unit/integration tests, three startup tests, six browser tests and a clean
audit. The new expiry test initially failed lint because its timer lacked an
explicit import; using Node's timers/promises fixed it without changing lint
rules. A tracked/staged/browser-asset scan found no configured server secrets.
Only live verification tests, status/setup documentation and the ignored local
environment changed; the production storage adapter remains unchanged.

Connect future authenticated actor/object policies without changing the safe
default. Persist document associations in the owning future business module.
Review permitted formats, antivirus/quarantine, archive/retention, resumable
uploads above 6 MiB, and mobile photo compression during document tasks.
Restricted bucket administration remains necessary because visibility changes
outside an application request cannot be prevented by this adapter. TASK-010
is next after this controlled batch; it is not implemented here.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

Object Storage. Current private-bucket read-only check and storage unit/stream/authorization tests passed. Historical live upload, public/anonymous denial, signing, expiry and cleanup evidence retained; no cloud object mutation repeated.

Files inspected:

- `packages/storage/src/index.ts`
- `tests/unit/storage.test.cjs`
- `tests/live/storage.test.cjs`

### Migrations, security and performance

No migration was changed or applied to cloud during this audit. Existing infrastructure boundaries were reviewed. Current implemented scope was reviewed; representative production latency and future business security acceptance remain separate.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Current private-bucket read-only check and storage unit/stream/authorization tests passed. Historical live upload, public/anonymous denial, signing, expiry and cleanup evidence retained; no cloud object mutation repeated.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
