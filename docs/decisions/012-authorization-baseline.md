# Approved Phase 1 authorization baseline

The owner confirmed this baseline on 5 October 2026. The eight role codes from
migration 0002 remain unchanged. Permission grants authorize an action; a server
record policy independently restricts the records and fields available to it.
An omitted permission or unknown record relationship denies access.

Only `super_admin` can create/invite, update or disable users, assign roles,
manage role permissions and change system settings. `management` can read users,
roles, permissions and audit logs. It cannot change security configuration.
Security changes are transactional and audited; the final active Super Admin
cannot be disabled or lose that role. No hard-coded administrator identity exists.

Engineers can access their own profile/schedule, assigned work orders and the
customer basics, site, asset, complaint, warranty/AMC context, relevant service
history and field documents linked to those jobs. They can submit their own
diagnosis, work, readings, parts, photos, recommendations, signature and report.
They cannot browse company-wide customers/assets, pricing/quotations, financial
data, audit logs or other engineers' jobs, assign engineers or close complaints.

Management and Super Admin have the approved broad business access. Sales/Admin
has commercial access and read-only customer/project/service status where granted.
Service Manager has service access; customer-edit field limits remain unconfirmed.
Project Manager access is project-related. Accounts has commercial/financial read
access. Store has relevant inventory/parts context only; Phase 2 inventory is not
introduced. Ambiguous "limited", "relevant" and "project-related" operations
must resolve a trusted server relationship/field rule before allowing access.

Quotation approval limits, SLA hours/calendar, warranty product coverage, AMC
frequencies and backup RPO/RTO are unconfirmed. Implement configurable structures;
do not infer production values from this matrix.

Development APP_URL is configurable, approved as `http://localhost:3000`.
Callback and reset destinations derive from it. Bootstrap name/email and all
passwords belong only in ignored local configuration or protected secret stores.
A clearly identified temporary Supabase Auth test account is authorized, with
cleanup after verification. Production identity/domain are future configuration.
