# TASK-170 — Notification model

Status: REVIEW pending actual PostgreSQL verification.
Assessment: 5 October 2026.

## Objective and implementation

Store Phase 1 in-app/email notification records with an application user recipient,
bounded title/message, optional paired entity reference, read timestamp and creation
timestamp. A supplied SHA-256 deduplication key is unique per recipient/channel;
the same event can have both transports. No recipient-selection rule, permission
grant, email template, delivery job, provider call or actual notification is created.

## Files and architecture

- `packages/database/migrations/0004_notifications.sql`
- `packages/contracts/src/notification.ts` and `src/index.ts`
- `tests/live/notification-model.test.cjs`

The existing PostgreSQL package owns the schema. Contracts remain transport-safe.
Future producers and workers use the existing BullMQ infrastructure; this model
does not create a competing queue or claim TASK-171/TASK-172 complete.

## Database and security

Recipient FK uses restrictive deletion, preserving history. Channels exclude
WhatsApp/SMS Phase 2. Private application schema, RLS enabled, no browser policies
or PUBLIC table privileges. Entity references are metadata; actual entity existence
and authorized linking must be checked by future producers. Read state is a record
acknowledgment, not an email-open tracker or proof of transport delivery. Never
place credentials, unrestricted file URLs or unvalidated HTML in message content.

The migration is transactional/checksum-controlled and has not been applied to
Supabase. Only opted-in test-mode loopback runtime and migration URLs may receive
fixtures; all generated records roll back.

## Performance

Recipient/channel/date/ID index for bounded pages and a partial unread inbox index.
Unique deduplication prevents repeated recipient/channel inserts. No startup queries,
external synchronous work, new package dependencies or full-table list endpoints.
Actual throughput and delivery reliability remain TASK-172/230 acceptance work.

## Tests, commands and results

`pnpm check`; hosted disposable `pnpm db:migrate` and `pnpm test:live`. SQL tests
cover recipient FK, deduplication, both allowed channels, Phase 2 channel rejection,
paired entity metadata, read-state storage, restrictive deletion and RLS configuration.
No test sends messages or accesses production identities. The local full gate
passed: 68 unit/integration tests, three startup checks, eighteen desktop/tablet/mobile
browser tests, build, lint, format, typecheck and zero known vulnerabilities.
Actual hosted SQL verification is pending for this migration.

## Blockers, debt and follow-up

REVIEW until the actual database and full gate pass. Actual notification delivery
requires approved recipients/events, authenticated entity access, provider settings
and event producers; those specific workflows remain BLOCKED. Transactional
outbox/queue handoff and audited delivery/retry outcomes belong to TASK-172.
