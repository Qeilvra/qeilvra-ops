# Airmech One implementation plan

Built by Qeilvra for Airmech Oman. Assessment date: 5 October 2026.

## Specification review

Read the actual files in the requested order: `memory.md`, `prd.md`, `RULES.md`,
`DESIGN.md`, `ARCHITECTURE.md`, `PERFORMANCE.md`, `security.md`, and `Task.md`.
`FEATURES.md`, `WORKFLOWS.md`, `ROADMAP.md`, and the specification's `README.md`
exist as embedded sections of `prd.md`; those sections were also read at their
respective positions. File names differ in case on this Windows workspace.
The original specifications are preserved.

The initial repository contained those eight Markdown files only. That historical
assessment no longer describes the current workspace: TASK-001–008 now provide
the existing applications, configuration, typed PostgreSQL pool/migrations, queue,
private storage, quality gate and hosted CI. Preserve that working foundation.

The direct user requirements and confirmed memory take precedence over
embedded examples. Use Airmech One as the product name and Built by Qeilvra as
the attribution. The user's explicit navy/teal/background/text/border palette
takes precedence over differing design token examples. The numbered phases
in `Task.md` are delivery stages within product Phase 1; they do not authorize
inventory, procurement, customer portal, or other product Phase 2 work.

## Current work: Phase 1 continuation

Reconciliation on 6 October 2026 verifies foundation TASK-001–008 and current
authentication/authorization/navigation/model work. All 133 formal tasks now
have explicit evidence-based states; there is no TASK-009. Roles, real provider
recovery/invitation delivery and the complete shell still have acceptance gaps.
See [current totals](implementation-status.md) and
[the complete reconciliation](verification/full-reconciliation.md).

TASK-001 created the documented pnpm workspace with three applications and five
shared packages; subsequent infrastructure tasks added queue/storage packages.
Applications remain limited to verified capabilities until protected workflows
are actually implemented. The following records the historical foundation scope.

- Owner: repository foundation, with API, worker, and web process boundaries.
- Database impact: no schema, migration, seed, business record, or production connection.
- Permissions: no user-facing business APIs or default role grants.
- Desktop: compact branded startup screen; no fabricated metrics.
- Mobile: focused startup layout without a dashboard stacked into one long page.
- Errors: safe process/API errors, validated startup ports, actionable retry UI.
- Performance: static web startup page, system fonts, no remote assets or charts,
  no database queries, no blocking external providers, and small liveness responses.
- Acceptance: install succeeds, all applications build, shared packages resolve,
  type/lint/test checks pass, and compiled API/worker startup can be exercised.

Strict configuration, quality commands, safe shared contracts, and a runnable
test harness support TASK-001. They do not complete all requirements of later
environment, database, job queue, storage, authentication, or UI component tasks.

## Dependency-based delivery

1. TASK-001: workspace and buildable application/shared-package boundaries.
2. TASK-002–008: strict configuration, code quality, validated environments,
   PostgreSQL/migrations/pooling, Redis/job infrastructure, private storage, CI.
3. TASK-010–017: accounts, confirmed roles/permissions/object policies,
   authentication/reset/session invalidation, authorization, authentication audit.
4. TASK-020–023: desktop/tablet/mobile shell, role-aware navigation, reusable controls.
5. TASK-030–044: customers/contacts/sites, lazy Customer 360, enquiries/RFQs/ownership.
6. TASK-050–065: quotations/revisions/confirmed approval/follow-up, transactional
   project conversion, project milestones/tasks/issues/handover.
7. TASK-070–114: assets/history/warranty, complaints/SLA, engineers/dispatch,
   schedule conflicts, work orders/customer confirmation.
8. TASK-120–142: engineer mobile execution and recoverable weak-network forms,
   confirmed AMC frequencies, idempotent PM scheduling and completion.
9. TASK-150–211: service report jobs, secure linked documents, notifications,
   independent dashboard widgets, indexed permission-filtered search, reports/audit viewer.
10. TASK-220–274: recovery and actual restore tests, realistic performance/security
    tests, end-to-end workflows, client UAT, approved migration/training/go-live.

Audit, transactional outbox/notification delivery, and secure document access
must be available when earlier domain workflows require them. Later numbered
tasks cover their full module interfaces, not permission to omit early integrity.
Every business module owns its state transitions; API consumers call its public
service instead of writing another module's private state.

## Decisions awaiting confirmation

Role permission grants, engineer scope, localhost callbacks and customer
Service Manager/Project Manager operational rules are confirmed in decisions
012 and 013. Enforce actual trusted record/field relationships when implementing
the affected modules. Still confirm quotation approval hierarchy; complaint intake,
priority/SLA/calendars; warranty rules and override authority; AMC frequency and
renewal policies; service report format; historical migration sources/volume;
production infrastructure/region; backup ownership, retention, RPO and RTO.
No assumptions about these are confirmed by the foundation task.

ORM and infrastructure provider choices require a recorded engineering decision
before those dependencies are introduced. Retain the specified Next.js/NestJS,
PostgreSQL, Redis/BullMQ, private object storage, and pnpm architecture.

## Required checks throughout delivery

Use bounded server-side lists/search, indexed queries, small responses, and lazy
tabs. PDF/export/notification/import/maintenance generation belongs in workers.
Notification delivery failure must not undo a committed business transaction.
Use deny-by-default server and object authorization, private files, safe errors,
audit records, and reversible/archive behavior for operational history.
Measure API p95, query plans, bundle size, search, dashboard, desktop/tablet/mobile,
and slow-network behavior at realistic scale before accepting the relevant task.
