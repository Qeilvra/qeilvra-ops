# TASK-170 — Notification model

Status: DONE.
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
The [hosted run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37347519561)
passed the complete gate and actual SQL migration/notification integrity checks.
Nine live database/Redis checks passed; the established cloud-storage test was
explicitly skipped. Configured server secrets were absent from hosted logs.

## Blockers, debt and follow-up

No notification-model blocker remains. Actual notification delivery
requires approved recipients/events, authenticated entity access, provider settings
and event producers; those specific workflows remain BLOCKED. Transactional
outbox/queue handoff and audited delivery/retry outcomes belong to TASK-172.

---

## Reconciliation — 6 October 2026

Current status: **DONE**. Previous tracker state: DONE.

### Objective and implementation evidence

Notification Model. Recipient/channel/read-state/deduplication schema passed real SQL integrity/RLS tests; it does not complete notification delivery.

Files inspected:

- `packages/database/migrations/0004_notifications.sql`
- `packages/contracts/src/notification.ts`
- `tests/live/notification-model.test.cjs`

### Migrations, security and performance

Migration 0004 notifications verifies recipient FK, channels, read state, deduplication and RLS on disposable PostgreSQL. No center/business event delivery is implied.

### Tests, commands and results

Current reconciliation runs the established `pnpm check` gate and standalone test/type commands, real disposable `pnpm test:live`, read-only cloud checks and the expressly approved temporary Supabase identity lifecycle. Exact commands, category totals, exceptions and environment separation are recorded in [the full reconciliation](full-reconciliation.md#test-totals). Passing shared checks do not close the remaining gap stated above.

Historical commands/results above were verified previously and were not fabricated or relabeled as this run.

### Remaining acceptance, blockers and technical debt

Recipient/channel/read-state/deduplication schema passed real SQL integrity/RLS tests; it does not complete notification delivery.

No remaining acceptance gap for this task’s stated scope. Production rollout, business modules and realistic-scale release acceptance are separate tasks.
