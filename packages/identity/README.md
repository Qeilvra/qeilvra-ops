# Server identity adapter

`@airmech/identity` shares the small native Supabase Auth REST adapter and
authenticated AES-GCM recovery/outbox envelope between API and worker. It adds
no registry dependency, provider SDK singleton, password database or JWT issuer.
Browser resolution is disabled. Web/UI/contracts/config import boundaries reject it.

Passwords and login tokens exist only transiently during provider operations.
The API creates an opaque, hashed and revocable application session. Recovery
verifiers/tokens and mail payloads are encrypted using the configured server
AUTH_SECRET and have short database expiries. Rotating AUTH_SECRET invalidates
pending recovery and delivery envelopes; application sessions remain governed by
their independent expiry/revocation rules.

Provider responses are bounded to 64 KiB, requests to eight seconds, redirects
are refused and provider errors are reduced to safe codes/statuses. HTTPS/TLS
verification remains enabled for remote projects. No credentials enter job
payloads, browser configuration, audit details or logs.

Protocol reference: [Supabase Auth OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml).
