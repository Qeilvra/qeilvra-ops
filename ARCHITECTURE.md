AIRMECH ONE
System Architecture
BUILT BY QEILVRA



Core architecture rule: never compromise software speed for features, visual effects, or implementation convenience.



1. Architecture Goals
Airmech One is organized as a modular operations platform with clear ownership between the user interface, API, database, background processing, and external integrations.
Fast
Modular
Scalable
Secure
Easy to maintain
Easy to extend
Mobile-friendly
Resistant to duplicated logic
Performance rule: use server-side pagination, indexed queries, lazy loading, small API responses, and background jobs. Never load full production datasets into the browser.

2. High-Level System

Desktop and mobile use the same application services; slow side effects are isolated in the worker.


3. Repository Structure
airmech-one/
├─ apps/
│  ├─ web/                  # Next.js UI
│  ├─ api/                  # NestJS API
│  └─ worker/               # async/background work
├─ packages/
│  ├─ ui/                   # reusable UI
│  ├─ contracts/            # shared schemas/types
│  ├─ database/             # DB schema/client/migrations
│  ├─ config/               # shared config
│  └─ testing/              # test helpers
├─ docs/
│  └─ decisions/            # architecture decisions
├─ infra/
├─ scripts/
├─ tests/e2e/
├─ README.md
├─ MEMORY.md
├─ PRD.md
├─ FEATURES.md
├─ WORKFLOWS.md
├─ ARCHITECTURE.md
├─ DESIGN.md
├─ RULES.md
├─ PERFORMANCE.md
├─ SECURITY.md
├─ TASK.md
└─ ROADMAP.md

4. What Each Main Folder Does
apps/web
The complete responsive frontend for management, office staff, engineers, and admins. Desktop and mobile share business capability, but mobile uses task-focused layouts instead of simply stacking desktop vertically.
apps/api
Backend business logic, validation, authentication, authorization, customers, quotations, projects, assets, complaints, warranty, work orders, AMC, reports, and integrations.
apps/worker
Slow and scheduled work such as PDFs, exports, notifications, AMC generation, image processing, and later AI/WhatsApp.
packages/ui
Reusable presentational controls such as Button, Input, Drawer, Modal, DataTable, Tabs, StatusBadge and PageHeader. It contains no database logic.
packages/contracts
Shared API schemas, request/response types, enums, and transport-safe contracts.
packages/database
Database schema, migrations, database client, and low-level database access utilities. Browser code must never import this package.
packages/config
Shared TypeScript, linting, environment validation, and project configuration.
5. Allowed Dependency Direction

Dependencies flow inward to shared contracts/config and never from browser code directly to the database.
apps/web must not import database code.
packages/ui must not know about database entities.
packages/contracts contains transport-safe contracts, not business logic.
packages/database is available to API/worker only.
Feature modules expose small public interfaces; shared folders must not become dumping grounds.


6. Frontend Organization
apps/web/src/
├─ app/
│  ├─ (auth)/login/
│  ├─ (app)/
│  │  ├─ dashboard/
│  │  ├─ customers/
│  │  ├─ enquiries/
│  │  ├─ quotations/
│  │  ├─ projects/
│  │  ├─ assets/
│  │  ├─ complaints/
│  │  ├─ work-orders/
│  │  ├─ engineers/
│  │  ├─ amc/
│  │  ├─ maintenance/
│  │  ├─ reports/
│  │  └─ admin/
│  ├─ layout.tsx
│  ├─ loading.tsx
│  └─ error.tsx
├─ features/
│  ├─ customers/
│  ├─ enquiries/
│  ├─ quotations/
│  ├─ projects/
│  ├─ assets/
│  ├─ complaints/
│  ├─ work-orders/
│  ├─ engineers/
│  └─ amc/
├─ components/
│  ├─ layout/
│  ├─ navigation/
│  ├─ forms/
│  ├─ tables/
│  └─ feedback/
└─ lib/
   ├─ api/
   ├─ auth/
   ├─ query/
   ├─ formatting/
   └─ telemetry/

Routes compose features. Feature-specific UI stays inside its feature. Generic reusable controls live in components or packages/ui. Pages should not become large files containing data access, validation, and every visual element.
7. Backend Organization
apps/api/src/
├─ modules/
│  ├─ auth/
│  ├─ users/
│  ├─ roles/
│  ├─ customers/
│  ├─ sites/
│  ├─ enquiries/
│  ├─ quotations/
│  ├─ projects/
│  ├─ assets/
│  ├─ complaints/
│  ├─ warranty/
│  ├─ engineers/
│  ├─ work-orders/
│  ├─ amc/
│  ├─ maintenance/
│  ├─ documents/
│  ├─ reports/
│  ├─ notifications/
│  └─ audit/
├─ common/
│  ├─ guards/
│  ├─ decorators/
│  ├─ pipes/
│  ├─ filters/
│  ├─ interceptors/
│  └─ errors/
└─ infrastructure/
   ├─ database/
   ├─ queue/
   ├─ storage/
   ├─ email/
   ├─ telemetry/
   └─ config/

Each business capability should be a module. Controllers remain thin; services enforce business rules; repositories own database access; DTOs validate incoming data.
8. Example Module
complaints/
├─ complaints.module.ts
├─ complaints.controller.ts
├─ complaints.service.ts
├─ complaints.repository.ts
├─ dto/
│  ├─ create-complaint.dto.ts
│  ├─ assign-engineer.dto.ts
│  └─ resolve-complaint.dto.ts
├─ policies/
├─ events/
└─ tests/

9. Module Ownership
Module	Owns
Complaint	Complaint states, SLA, assignment and resolution rules
Asset	Asset identity, serial/model information, lifecycle history
Warranty	Warranty eligibility and override rules
Work Order	Engineer execution state and field-work data
AMC	Recurring maintenance schedules and renewal rules
Quotation	Quotation revisions, validity, approvals and acceptance
Other modules should call the owning module's public service or emit an event. Avoid ad-hoc cross-domain database writes.
10. Main Business Relationships

11. Customer 360 Relationship
Customer
├─ Contacts
├─ Sites
│  └─ Assets
│     ├─ Warranty
│     ├─ Complaints
│     ├─ Work Orders
│     └─ Maintenance
├─ Enquiries
├─ Quotations
├─ Projects
├─ AMC Contracts
└─ Documents

12. Commercial Flow

13. Service Flow

14. AMC / Preventive Maintenance Flow



15. Frontend → API → Database
The frontend never talks to PostgreSQL directly. Every protected request passes through authentication, authorization and business validation before database access.
User
  ↓
Next.js UI
  ↓
NestJS Controller
  ↓
Permission / Policy Check
  ↓
Business Service
  ↓
Repository
  ↓
PostgreSQL

16. Engineer Assignment Example

The assignment is committed first; notification is queued afterward so the user does not wait for external providers.
17. Background Job Pattern

18. Worker Structure
apps/worker/src/
├─ queues/
│  ├─ notifications/
│  ├─ reports/
│  ├─ documents/
│  ├─ amc/
│  └─ ai/
├─ processors/
├─ schedulers/
├─ telemetry/
└─ main.ts

19. Main Database Domains
users
roles
permissions

customers
customer_contacts
sites

enquiries
quotations
quotation_revisions

projects
project_milestones

assets
warranties

complaints
work_orders
engineers

amc_contracts
maintenance_visits

service_reports
documents
notifications
audit_events

20. API Rules
Every potentially large list endpoint supports page, limit, filters, search and sorting.
GET /complaints?page=1&limit=25&status=OPEN&priority=HIGH

Avoid production endpoints that return the entire table.
21. Business Action APIs
POST /complaints/:id/assign
POST /complaints/:id/resolve
POST /complaints/:id/close

POST /work-orders/:id/start
POST /work-orders/:id/complete

POST /quotations/:id/approve

Use explicit business actions for protected state transitions rather than allowing clients to patch status to any value.


22. Error Architecture
{
  "error": {
    "code": "ENGINEER_NOT_AVAILABLE",
    "message": "The selected engineer is not available.",
    "requestId": "req_123"
  }
}

Frontend shows a useful, actionable message.
Internal logs keep technical details and request correlation.
Never expose stack traces, raw SQL, credentials, secrets or internal file paths.
23. Mobile Architecture

Mobile must provide the same permitted business capabilities as desktop, but with mobile-specific navigation and interaction patterns. It must not simply stack desktop vertically.

24. Mobile Navigation
Home
Jobs
Customers
Search
More

More exposes Enquiries, Quotations, Projects, Assets, AMC, Reports and Admin according to role permissions.
25. Desktop Navigation
Dashboard

Customers

Commercial
├─ Enquiries
└─ Quotations

Operations
├─ Projects
├─ Complaints
├─ Work Orders
└─ Engineers

Assets
├─ Equipment
├─ Warranty
└─ AMC

Management
├─ Reports
└─ Documents

Admin



26. Search Architecture
Customer
Phone
Email
Enquiry
Quotation
Project
Complaint
Work Order
Asset ID
Serial Number
Engineer
AMC
Exact IDs and serial numbers should rank strongly. Search must use indexed fields and never rely on an unbounded synchronous full-table scan.
27. Security Boundary

Frontend permission checks improve usability only. Backend authorization is the actual security boundary.
28. Audit Architecture
AuditEvent
- userId
- action
- entityType
- entityId
- before
- after
- timestamp
- requestId

Examples: COMPLAINT_ASSIGNED, WORK_ORDER_COMPLETED, WARRANTY_OVERRIDDEN, QUOTATION_APPROVED, ROLE_CHANGED.
29. Performance Architecture Rules
Frontend: lazy-load modules, split code, paginate tables, avoid hidden unnecessary requests and large dependencies.
Backend: bounded responses, indexed queries, no N+1 patterns, connection pooling, explicit timeouts.
Database: index real search/filter paths and review query plans for slow endpoints.
Worker: move PDF, export, notifications, imports, scheduled automation and AI away from user requests.
Mobile: keep payloads small, compress photos and preserve work notes through recoverable network failures.
A feature that works but noticeably slows a core workflow is not complete.

30. Key Architecture Principle
Synchronous business path:
UI
↓
API Controller
↓
Permission Check
↓
Business Service
↓
Repository
↓
Database

Slow side effects:
Business Service
↓
Queue
↓
Worker
↓
External Service

This separation keeps Airmech One fast, maintainable, testable, secure and scalable.