# Phase 1 implementation status

Assessment: 7 October 2026, following the [targeted acceptance closeout](verification/acceptance-closeout.md). The [6 October full audit](verification/full-reconciliation.md) remains historical evidence for unchanged tasks. Vercel deployment is intentionally deferred. No TASK-009 exists.

## Task totals

| State       | Count |
| ----------- | ----: |
| DONE        |    20 |
| IN_PROGRESS |    12 |
| REVIEW      |     2 |
| BLOCKED     |     8 |
| READY       |     1 |
| BACKLOG     |    90 |
| Total       |   133 |

**20 / 133 = 15.0%** complete by task count. 113 tasks remain not DONE; this is not an engineering-hours estimate.

## Verified scope

TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-010, TASK-011, TASK-012, TASK-013, TASK-016, TASK-017, TASK-020, TASK-021, TASK-022, TASK-023, TASK-030, TASK-170. Completed foundation/auth/infrastructure verification is preserved.

## Latest batch

- **TASK-011 — DONE:** Active roles are enforced in current server principals. Super Admin-only lifecycle/grant changes are locked, audited and revoke sessions; final effective administrator protection and concurrency/security checks pass.
- **TASK-014 — REVIEW:** Complete PKCE UI/API/worker recovery, invitation recovery, expiry/invalid/replay/provider-failure denial and concurrent-disable protection pass. Actual delivered-link reset remains unverified; Supabase HTTP 429 blocks delivery to the current authorized inbox.
- **TASK-015 — REVIEW:** Invitation/resend/confirmed-identity recovery, correct enable/disable/setup transitions, provisioning rollback, security audit and accurate bounded pagination pass. Actual invite/setup/resend remains unverified; Supabase HTTP 429 blocks delivery to the current authorized inbox.
- **TASK-020 — DONE:** Account menu/profile/recovery/sign-out, permission-aware page search, lazy recipient-scoped notification drawer and desktop/mobile navigation pass all four viewport checks. Business-wide record search remains a later task.

Clean pnpm check passed: 83 unit/integration, three startup and 68 browser checks plus builds, lint, formatting, strict types and audit. Disposable PostgreSQL/Redis API/worker tests and real local UI integration passed all 26 cases with cleanup. Actual controlled-inbox acceptance is recorded separately and is not inferred from fixtures.

## Approved decisions and blockers

Role/permission baseline, engineer scope, localhost callbacks and temporary test identity are approved in decision 012. Owner-confirmed Service Manager field edits and Project Manager managed-project-only/no-customer-creation rules are recorded in decision 013 and must be enforced by future owning APIs. Do not reinstate those as missing-policy blockers. Actual record/field enforcement is still absent in customer modules.

- **TASK-053 — Approval Workflow:** Approval hierarchy, tiers, thresholds, discount limits and approvers are unconfirmed. Configurable scaffolding can proceed; final actual approval-policy acceptance is blocked.
- **TASK-222 — Restore Test:** No actual backup artifacts supplied/generated for recovery verification. Restore database and documents into controlled isolation and verify application/data consistency before acceptance.
- **TASK-223 — Recovery Documentation:** Recovery owner, backup locations and an actually tested procedure remain unconfirmed. A generic runbook cannot complete final recovery documentation.
- **TASK-261 — Client Workflow Testing:** Actual client workflow participation and signoff are unavailable; automated fixtures cannot substitute for UAT.
- **TASK-270 — Production Environment:** Production domain/origins/session/SMTP/least-privilege DB/Redis/monitoring/backup configuration and deployment approval remain unavailable. Existing Supabase infrastructure is not an app deployment.
- **TASK-271 — Data Migration:** Historical source records/formats/volumes, approved mapping and import authorization are unavailable. Import and validate actual counts without destructive resets.
- **TASK-273 — Training:** Client training participation and complete operational workflows are required. Prepare role-specific material and conduct actual training.
- **TASK-274 — Go Live:** Requires actual approved UAT, complete security/performance acceptance, verified backup/restore/migration/monitoring and explicit go-live approval.

Unconfirmed quotation/SLA/product coverage/AMC/report/recovery production values are exact acceptance gaps. Configurable structures can proceed. Unstarted implementation is BACKLOG rather than automatically BLOCKED.

## Next work

Commit/push the passing closeout implementation, then continue the authorized Customer batch TASK-031–035. Pending controlled email confirmation does not require repeating completed foundation work. Customer APIs must enforce actual Service Manager changed-field limits and existing managed-project access; no client-supplied authorization facts are trusted. Unimplemented related business modules cannot be declared complete through a Customer 360 placeholder.## Next work

Commit/push the passing closeout implementation, then continue the authorized Customer batch TASK-031–035. Pending controlled email confirmation does not require repeating completed foundation work. Customer APIs must enforce actual Service Manager changed-field limits and existing managed-project access; no client-supplied authorization facts are trusted. Unimplemented related business modules cannot be declared complete through a Customer 360 placeholder.
