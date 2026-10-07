# Role, recovery, administration and shell acceptance closeout

Assessment: 7 October 2026 (Asia/Karachi). Base: `80fec6d`. This batch preserves
the completed foundation/authentication work and leaves Vercel deployment
intentionally deferred.

## Current acceptance

| Task     | State  | Result / remaining acceptance                                                                                                                                                                                                                   |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-011 | DONE   | Active role lifecycle, current server grants, Super Admin-only mutations, session revocation, audit and final effective administrator protection verified.                                                                                      |
| TASK-014 | REVIEW | Complete UI/API/worker PKCE recovery and safe failure paths verified locally. Actual delivered-link reset remains unverified; Supabase HTTP 429 blocks the current controlled email check.                                                      |
| TASK-015 | REVIEW | Create/invite, resend, confirmed-invitation recovery, status transitions, profile/grant administration and pagination verified. Real invite/setup/resend remains unverified; Supabase HTTP 429 blocks delivery to the current authorized inbox. |
| TASK-020 | DONE   | Account menu, permission-aware page-search entry, recipient-scoped notifications and responsive navigation verified.                                                                                                                            |

## Implementation and security

Migration `0006_role_lifecycle.sql` adds role activation with existing roles
enabled, preserves stable role codes/grants and remembers whether a disabled
user was active or invited. Existing migration files are unchanged; the new
migration was applied/replayed only in disposable local PostgreSQL. No cloud
application migrations were applied.

One current principal query filters disabled roles before aggregating roles and
grants. Every security mutation takes the existing transaction advisory lock and
rechecks the actor's current Super Admin role and its own permission grant.
Lifecycle changes are audited and revoke affected sessions. Administrator
protection counts active users with an active Super Admin role and all required
security grants. Disabling that role, removing mandatory grants or disabling/
demoting the final effective administrator rolls back.

Password recovery remains browser-bound PKCE with encrypted verifier/provider
access data, hashed opaque application sessions, bounded provider requests and
single-use password-setup sessions. Recovery checks the verified provider
identity/email against the current local profile under a row lock. Invited users
can recover unfinished setup through verified PKCE. Password changes revoke
existing sessions before provider work; failure and a concurrent account disable
leave no usable application session and cannot activate a disabled account.
Successful invitation setup is explicitly audited. Expired/invalid state,
provider code/token, setup session and replay fail safely.

Default Supabase invitation links are supported as well as token-hash templates.
The callback removes the complete query/fragment before exchanging credentials,
including a subsequent hash link opened on the same callback page. A fragment
session is checked against Supabase's authenticated user endpoint, requires a
confirmed email and can create only a setup session for the exact locally invited
profile. An active user's provider token cannot enter that invitation path.
Ordinary active-user password recovery retains PKCE; a refresh token is never
stored in the browser or app.

Resend revokes old local invitation setup sessions and cancels undelivered
requests; an in-flight delivery returns a conflict rather than racing a newer
delivery. Supabase rejects another invitation after email confirmation, so the
worker verifies the exact mapped provider identity and sends setup recovery in
that case. A failed profile transaction after provider provisioning compensates
only its new, unconfirmed, marked invitation identity. Failures are audited;
committed invited accounts remain available for resend after queue/delivery
failure. No identity is hard-coded in application code.

The shell uses the existing industrial design and shared controls. Account
details, profile navigation, password recovery and sign-out are accessible in a
focus-contained menu. Search finds currently permitted pages; the full business
record search engine remains TASK-190 onward. Notifications load only when their
drawer opens, page at 25 records and restrict both reads and mark-read mutations
to the authenticated recipient. No unrelated record URL is fabricated.

## Performance and verification

User lists return at most 25 selected records and calculate an accurate total
even for an empty out-of-range page in one database statement. Prefix indexes
cover email/name searches. The role catalog is fetched once per user-management
mount rather than once per search/page/mutation. Notification pages use the
existing recipient/page index and one extra record for `hasMore`, without a
global count. Provider/email work remains outside database transactions and
delivery runs in the worker. No dependency was added, no full table is sent to
the browser and no N+1 HTTP/database request loop was introduced. Production
volume/latency targets are not claimed measured by these fixtures.

Executed:

- Clean `pnpm check`: all eleven app/package builds, formatting, lint, strict
  workspace/tooling typechecks, **83 unit/integration tests**, **three startup
  checks**, **68 browser checks** and zero known dependency advisories passed.
  All generated app/package `dist`, web `.next` and web build-info were absent
  before the build; prior generated output was preserved in a checked ignored
  workspace cache.
- Disposable PostgreSQL 18/Redis 7.0.15: **26 reported tests passed**, no failures
  or skips. This includes actual API/SQL/queue/worker security behavior and the
  built UI calling that API through a controlled loopback proxy, rather than
  fabricated auth/admin responses. Desktop administration, mobile invitation
  setup/default fragment handling, subsequent PKCE reset and session revocation
  passed. All owned fixture processes stopped.
- Viewport browser acceptance passed at 390, 768, 1440 and 1920 pixels, including
  account/search/notification controls, resend/catalog request count, confirmed
  role lifecycle actions, expiry during submission and callback fragment cleanup.
  These transport-fixture cases complement the real local API/browser check.

Detailed quality evidence is ignored under `.cache/acceptance`; disposable
integration logs are under `.cache/reconciliation`. Windows WSL access requires
the existing fixture runner to execute outside the sandbox; its Redis binary
stays in the workspace cache, and no system package or WSL configuration changed.
Installed Chrome is selected through the existing test environment override.
No compiler/lint/test rule was weakened or test disabled.

The owner authorized real invitation/resend/recovery messages to one controlled
inbox only and will open delivered links manually without sharing its password
or links. Local passing checks and Supabase accepting a send request do not
substitute for that delivery/setup result. TASK-014/015 remain REVIEW until it is
recorded. Deployment and unrelated production acceptance remain deferred.

## Controlled email attempt

The owner first authorized one inbox, then superseded it with a different specific inbox. Supabase accepted the initial invitation and resend before that change; delivered-link acceptance was not reported. The old owned temporary identity was deleted and a subsequent provider lookup confirmed 404. No further message was requested for the superseded address.

For the newly authorized inbox, the existing API created a marked temporary invitation identity and a disposable local invited profile. The worker received HTTP 429 / RATE_LIMITED from Supabase on all three bounded delivery attempts and recorded the invitation as failed. No actual password setup, sign-in or delivered-link recovery was inferred. The new owned identity was also deleted and confirmed absent by a 404 provider lookup, and all owned local API/worker/web/PostgreSQL/Redis processes stopped. The provider limit must reset or approved provider mail capacity must become available before real acceptance can continue, using only the currently authorized inbox. No inbox password, SMTP secret or email-link token was requested or stored in the repository. This external verification gap does not change the passed local implementation checks or require Vercel work.
