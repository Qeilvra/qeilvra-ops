# Phase 1 implementation status

Assessment: 5 October 2026. TASK-001–008 remain the completed foundation; there is
no TASK-009. The user's continuation instruction authorizes TASK-010–274, excluding
product Phase 2. Task numbers describe delivery stages within Phase 1.

## Current independent work

TASK-010/TASK-011: DONE. The profile/role migration and typed repository passed
real disposable PostgreSQL checks in [hosted CI](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37341781398).
TASK-023: DONE, real shared controls and browser specimens verified by the full
quality gate. TASK-030: DONE, customer model/contact ownership and real SQL checks
passed in [hosted CI](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37343170184).
No new migration has been run on Supabase.

TASK-170 is DONE: Phase 1 notification records and actual
disposable PostgreSQL tests passed without selecting recipients or sending
messages. TASK-171/TASK-172 remain BLOCKED on authenticated entity/event policy
and verified provider delivery. This is model work, not a completed notification module.

## Decisions that block protected workflows

The source documents explicitly leave these unconfirmed. Questions have been
sent to the project owner; no answer has been treated as approval.

| Tasks/batch           | Required external decision or prerequisite                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-012, 015, 016    | Approved role → permission grants, object visibility/ownership, role-administration limits and first-administrator identity/provisioning                                                    |
| TASK-013, 014, 017    | Supabase Auth account/provisioning policy and actual controlled login/reset verification; approved redirect origin, reset email delivery and session policy; complete event-producing flows |
| TASK-020–022          | Current authenticated profile and approved role navigation; shared UI can proceed independently                                                                                             |
| TASK-031–035, 041–044 | Protected authenticated APIs and approved customer/enquiry visibility, assignment and follow-up policy                                                                                      |
| TASK-050–056          | Currency/tax/numbering and approved quotation approval/revision/customer-visible rules                                                                                                      |
| TASK-060–073          | Approved protected project/asset access and verified upstream quotation/customer flows                                                                                                      |
| TASK-080–092          | Confirmed complaint intake, priority/SLA calendars, product/brand warranty rules and override authority                                                                                     |
| TASK-100–125          | Approved engineer job visibility/assignment and verified complaint/work-order transitions                                                                                                   |
| TASK-130–152          | Confirmed AMC frequencies and renewal policies, service-report format/signature requirements and upstream work-order flows                                                                  |
| TASK-160–192          | Authorized real business entities, notification recipients/provider settings and verified permission-filtered data sources                                                                  |
| TASK-200–223          | Approved report visibility, backup ownership/retention/RPO/RTO and a controlled restore environment                                                                                         |
| TASK-230–254          | Functioning integrated business workflows, realistic data volumes and measured production-equivalent performance                                                                            |
| TASK-260–274          | Client UAT participation/signoff, deployment configuration/approval, real migration sources and training/go-live participation                                                              |

These prerequisites do not count as implementation or verification. Unstarted
tasks remain BACKLOG; tasks whose specific work is blocked record BLOCKED in
`Task.md`. Domain models must be inspected individually before implementation;
this table does not authorize invented fields, policies or bulk completion.

## Identity engineering assessment

Supabase Auth is appropriate as the existing provider for credentials, identity,
recovery and session mechanics. The application profile and RBAC remain in
PostgreSQL and every protected API must resolve current status/grants and apply
an object policy. A frontend session or role name never grants access. There is
no competing password/JWT issuer, automatic admin or business endpoint yet.

Before login implementation, record the deployment origin/proxy/session/CSRF
design and verify actual provider settings and controlled test identities. Do
not change provider accounts or create a first administrator from an assumption.

Provider references: [server-side identity/session verification](https://supabase.com/docs/guides/auth/server-side/advanced-guide),
[session revocation](https://supabase.com/docs/guides/auth/sessions),
[reset redirects](https://supabase.com/docs/guides/auth/redirect-urls) and
[production SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).
These support the provider assessment; they do not establish Airmech's access policy.

## Verification environment

Docker Desktop's local image store returned `read-only file system` while pulling
PostgreSQL and Redis. No images, volumes or existing containers were deleted.
Use the existing hosted workflow's disposable services to verify the new migration
after local checks and secret scanning. This is not a reason to weaken TLS,
replace the database, reset production or pretend SQL tests passed.

## Production readiness

The foundation is verified; the Phase 1 product, protected workflows, production
deployment, disaster recovery, client UAT and go-live are not complete.

## Batch acceptance record

| Batch            | DONE     | BLOCKED                                           | Other tasks                                     |
| ---------------- | -------- | ------------------------------------------------- | ----------------------------------------------- |
| 2, TASK-010–017  | 010, 011 | 012–017                                           | None                                            |
| 3, TASK-020–023  | 023      | 020–022                                           | None                                            |
| 4, TASK-030–035  | 030      | 031–035                                           | None                                            |
| 5, TASK-040–044  | None     | Upstream customer/site/auth policy                | BACKLOG                                         |
| 6, TASK-050–056  | None     | 050, 053                                          | BACKLOG pending money/approval policy           |
| 7, TASK-060–065  | None     | Upstream quotation/access policy                  | BACKLOG                                         |
| 8, TASK-070–073  | None     | Upstream site/coverage/access policy              | BACKLOG                                         |
| 9, TASK-080–092  | None     | 083, 090–092                                      | BACKLOG pending intake/SLA/coverage             |
| 10, TASK-100–125 | None     | Upstream identity/service/assignment policy       | BACKLOG                                         |
| 11, TASK-130–152 | None     | 131, 134, 151                                     | BACKLOG pending schedule/report decisions       |
| 12, TASK-160–192 | None     | Upstream authorized real entities/data            | BACKLOG                                         |
| 13, TASK-200–223 | None     | 220–223                                           | BACKLOG pending verified report/audit workflows |
| 14, TASK-230–254 | None     | Integrated workflows/realistic volume unavailable | BACKLOG                                         |
| 15, TASK-260–274 | None     | 260, 261, 270, 271, 273, 274                      | BACKLOG pending client/UAT/production           |

No omitted task number is invented. The ranges identify batches, not missing
tasks between their documented groups. An upstream blocker does not claim that
every later task was attempted or individually marked BLOCKED.

### Shared verification, security and performance

Local full gate: build, formatting, lint, typecheck, unit/integration, startup,
desktop/tablet/mobile browser tests and audit passed. Baseline: 66 + 3 + 18 tests;
two mutation-boundary unit regressions subsequently passed (68 unit/integration).
Hosted runs additionally exercised real migrations and PostgreSQL/Redis. Storage
remains separately verified foundation infrastructure; hosted tests intentionally
skip cloud storage rather than load production credentials.

New migrations 0002–0004 were only applied to disposable PostgreSQL, including
the notification checks in hosted run 37347519561. Migration 0001's
checksum is preserved. Identity/user grants resolve in one parameterized indexed
query with the existing pool. No business APIs, implicit super-admin authority,
browser server secrets, provider accounts or production grants were introduced.
Audit records reject update/delete/truncate. Additional regression coverage
verifies actual RLS denial to a non-owner role even with SELECT privileges.

The [mutation-safety and RLS run](https://github.com/Qeilvra/qeilvra-ops/actions/runs/37345038843)
passed at implementation commit `2988374`: 68 unit/integration, three startup,
eighteen browser and eight live PostgreSQL/Redis checks. One cloud-storage test
was explicitly skipped by the established hosted environment. Configured server
secrets were absent from its logs.

Shared UI adds no dependency; bounded table/card pages, native fields/dialogs,
system fonts and static specimen routes preserve the current startup behavior.
Production-scale latency, domain E2E/security acceptance and field-device network
testing remain incomplete. No whole-product performance/security approval is claimed.

### Technical debt and readiness

The owner approved the Phase 1 role matrix, engineer assignment scope, final
Super Admin protection, configurable bootstrap identity, localhost development
callbacks and a temporary provider test account. Authentication work can proceed;
production bootstrap credentials and SMTP delivery still require local setup.
Establish least-privilege API
DB credentials and approve deployment of new migrations. Repair Docker Desktop's
read-only image store for convenient local service verification; hosted verification
provides actual SQL evidence meanwhile. Unstarted modules, restore procedures,
client UAT, training, monitoring and production deployment remain required scope.
