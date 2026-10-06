# Airmech One API

TASK-001 establishes the NestJS process boundary. `GET /health` returns the shared
process-liveness contract. It does not check PostgreSQL, Redis, storage,
authentication, permissions, or business readiness.

The API uses ECMAScript modules to match NestJS 12. Local imports use the emitted
`.js` extension; shared workspace packages and the worker remain CommonJS.

Registered controllers cover health, authentication and user/role administration.
Authentication uses the server-only Supabase adapter and opaque application
sessions. A global default-deny guard checks mutation origin and current active
profiles/permissions; security mutations recheck Super Admin authority inside
transactions. Customer and operational APIs remain absent. See
[current acceptance and gaps](../../docs/verification/full-reconciliation.md).

Requests receive a bounded `X-Request-Id`. Invalid incoming IDs are replaced.
HTTP failures use the shared error envelope; unexpected exception messages,
stacks, request bodies, and credentials are never returned or written to the
initial process logs. A request ID and error category are logged for correlation.
Domain errors and redacted diagnostic logging will be added by their owning tasks.
Before introducing domain routes, extend the error boundary with explicitly safe
business codes and validation field errors. Current mappings include auth,
authorization, rate limits and database conflicts as well as startup/parser
failures. Future domain errors must preserve safe codes and entered form values.

The process binds to `127.0.0.1:3001` by default. `HOST`, `PORT`, and `NODE_ENV`
are validated by `@airmech/config`. SIGINT and SIGTERM close the Nest application.
See the repository README for workspace build and development commands.
