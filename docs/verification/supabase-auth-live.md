# Controlled live Supabase authentication verification

Verified 7 October 2026 (Asia/Karachi), against repository base `c1a0b22`.
The owner explicitly authorized creation, authentication and deletion of one
clearly identified temporary identity in the Supabase project configured by the
private local `.env`. Application data stayed in a newly initialized disposable
loopback PostgreSQL 18 database. No application behavior changed.

## Results

The existing opted-in `tests/live/supabase-auth.test.cjs` created exactly one
`codex-auth-test+<random UUID>@example.com` identity with temporary-verification
metadata and a random password. Credentials, JWTs and cookies were not printed
or committed. The live checks passed:

- Supabase issued a JWT with the expected subject, email, issuer,
  `authenticated` provider role and an unexpired expiry. Its authenticated
  `/auth/v1/user` endpoint accepted that token and returned the same identity;
  decoding the claims alone was not treated as verification. The explicit JWT
  probe signed out its provider session in `finally`.
- Real API login denied valid provider credentials before a local application
  profile existed. After creating a disposable active profile with the
  `engineer` application role, login succeeded with the expected application
  user/identity mapping, profile/work-order grants and no administrative grant.
- The application returned an HttpOnly, SameSite=Lax opaque session cookie,
  without returning the provider JWT or password. `/auth/me` returned 200 and
  the protected `/admin/users` route returned 403 for this engineer.
- API logout returned 204, expired the session cookie and removed all local
  sessions for the test user. Reusing the old cookie returned 401.
- Incorrect credentials and a disabled local profile both returned the same
  safe 401 denial. Login/logout audit events existed without tested secrets.
- Cleanup deleted the owned provider identity. The deletion helper performed a
  second provider lookup and confirmed 404; it did not infer deletion from the
  DELETE response alone. The disposable PostgreSQL process stopped successfully.

The controlled runner executed the provider test alongside existing disposable
database/model tests: **10 reported tests passed, zero failures and zero skips**.
Scoped ESLint and Prettier checks passed for the changed test and report.
The provider lifecycle accounts for its parent test and three subtests; the
other six are existing database/model cases, not additional provider checks.
Ignored execution evidence is in `.cache/reconciliation/disposable-tests.log`
and the disposable PostgreSQL shutdown log. No cloud application migrations,
application records or storage objects were created.

## Reproduction and scope

Build the existing packages and API through `pnpm run test:prepare`. Point
`DATABASE_URL` (and, if supplied, `DATABASE_MIGRATION_URL`) to a disposable
loopback database, set `DATABASE_ENABLED=true`, `NODE_ENV=test` and
`INFRASTRUCTURE_TEST_DATABASE_MUTATIONS=true`, then opt in with
`AUTH_PROVIDER_LIVE_VERIFICATION=true` and `AUTH_PROVIDER_TEST_ENV_FILE` pointing
to the approved private provider configuration. Execute:

```sh
node --test tests/live/supabase-auth.test.cjs
```

This run used the existing ignored `.cache/reconciliation/database-run.cjs`
fixture to initialize a fresh database, execute the guarded tests and stop its
owned PostgreSQL process in `finally`. The provider test itself retains identity
deletion in `finally`. No environment file or secret was changed.

The app's session is opaque, while Supabase supplies the server-side JWT.
Provider JWT validation follows Supabase's authenticated
[getUser behavior](https://supabase.com/docs/reference/javascript/auth-getuser).
[Provider sign-out](https://supabase.com/docs/reference/javascript/auth-signout)
revokes refresh sessions; it does not imply every issued JWT becomes immediately
invalid. Application logout rejection and provider user deletion were checked
separately. Email delivery, recovery/invitation links, production application
deployment and whole-product security acceptance remain outside this check.
