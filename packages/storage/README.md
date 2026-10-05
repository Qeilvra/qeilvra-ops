# Private storage infrastructure

`@airmech/storage` is available to API and worker only. It uses Supabase Storage
REST through Node's built-in pooled `fetch`, without loading auth/realtime SDKs.
Construction does no network I/O and accepts the existing validated
`ServerConfiguration.storage` group. Create one service per process; there is
no independent connection or shutdown lifecycle.

Configure `STORAGE_ENABLED=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
and `STORAGE_BUCKET` in a private environment. The bucket must already exist
and be private. HTTPS is required except for loopback development/testing.
This package never creates buckets, modifies RLS, or generates public URLs.

Inject an `authorize` callback into `StorageService`. It receives the actor,
operation, and exact owner/entity/key association. Operations deny access when
the callback is missing, rejects, throws, or returns anything other than `true`.
Future modules must authenticate the actor and resolve object associations
from trusted persisted records before granting access. Reference strings and
storage metadata alone are not proof of ownership. No business authorization,
authentication, route, document table, or permission model is implemented here.

Available methods:

- `verifyPrivateBucket()` performs an explicit read-only readiness check.
- `upload(request)` validates owner/entity references, basename, extension,
  MIME allowlist, byte count, and basic content signatures; generates a UUID
  key; streams the upload; and returns its reference, size, and MIME type.
- `getSignedDownloadUrl(actorId, object, expiresIn=60)` authorizes access and
  signs the exact object for 1–300 seconds.
- `metadata(actorId, object)` returns bounded, typed provider metadata.
- `delete(actorId, object)` authorizes deletion of one exact generated key.

Every object operation confirms that the bucket is private before touching the
file. Keep private bucket settings restricted to administrators: a provider
configuration change can invalidate privacy even outside this application's
request window. Signed URLs are bearer capabilities; never log them, cache
them permanently, or treat them as lasting permission grants.

The initial allowlist is PDF, PNG, JPEG, UTF-8 text, and CSV, with a 6 MiB limit.
Binary formats receive header checks and text rejects invalid UTF-8/control
bytes. These basic checks do not replace antivirus scanning, complete format
decoding, or future workflow-specific file policy. Large/resumable uploads,
mobile compression, and heavy file processing belong to their later tasks.
The source stream should emit bounded chunks; this adapter holds at most eight
bytes for signature checks and does not materialize the full file. Declared and
actual sizes must match. Uploads use unique keys and never overwrite files.

Requests have a 15-second timeout (maximum configurable timeout: 60 seconds),
do not follow redirects with credentials, and cap JSON responses at 64 KiB.
Errors contain only stable safe codes and status numbers. Service credentials
are private class fields; do not log the server configuration itself.

Run `pnpm test:unit` for local REST-fixture tests. After building packages,
`pnpm test:live` runs cloud verification separately when private configuration
exists. It uploads one harmless uniquely keyed text file into the configured
existing bucket, confirms unsigned access is denied (also testing the anonymous
project key if configured), fetches a short-lived
signed URL, reads metadata, and removes that exact test object in `finally`.
Missing credentials skip with `BLOCKED`; failures remain failures. No production
credentials are used by CI.

The implementation follows Supabase's documented
[private-bucket access model](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [server-key security](https://supabase.com/docs/guides/storage/security/access-control).
REST routes and metadata headers follow the provider's
[bucket adapter](https://github.com/supabase/storage-js/blob/master/src/packages/StorageBucketApi.ts)
and [file adapter](https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts).
The size limit follows the recommended scope of
[standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
