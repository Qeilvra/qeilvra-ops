const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { DatabaseClient, applyMigrations, readMigrations } = require("@airmech/database");
const { startAuthMessageWorker } = require("@airmech/queue");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");
const { startAuthProviderFixture } = require("../helpers/auth-provider-fixture.cjs");
const { startLocalWeb } = require("../helpers/local-web.cjs");

async function until(operation) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await operation()) return;
    await delay(60);
  }
  throw new Error("Bounded authentication verification timed out");
}
function responseCookie(response, name = "airmech_session") {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  assert.ok(header, "Expected HttpOnly cookie");
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  return header.split(";")[0];
}

test(
  "real disposable PostgreSQL/Redis supports protected login, administration, recovery, retries and audit",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Auth mutation tests require an opted-in disposable database"
        : false,
  },
  async (t) => {
    const environment = loadEnvironment({ envFile: false });
    const base = readServerConfiguration("api", environment);
    assertDisposableDatabase(base.database);
    const redis = new URL(base.redis.url ?? "redis://invalid");
    assert.ok(
      base.redis.enabled && ["localhost", "127.0.0.1", "[::1]"].includes(redis.hostname),
      "Auth job tests require disposable loopback Redis",
    );
    await applyMigrations(base.database, await readMigrations());
    const fixture = await startAuthProviderFixture();
    const web = await startLocalWeb();
    const appUrl = web.url;
    const configuration = readServerConfiguration("api", {
      ...environment,
      AUTH_ENABLED: "true",
      AUTH_SECRET: "fixture-session-secret-".repeat(3),
      APP_URL: appUrl,
      SUPABASE_URL: fixture.url,
      SUPABASE_ANON_KEY: "fixture-public-key",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-server-key",
    });
    const database = new DatabaseClient(configuration.database);
    const { createApiApplication } = await import("../../apps/api/dist/application.js");
    const {
      createAuthMessageProcessor,
    } = require("../../apps/worker/dist/auth-message-processor.js");
    const application = await createApiApplication(configuration);
    const delivery = startAuthMessageWorker(
      configuration.redis,
      createAuthMessageProcessor(configuration, database),
    );
    const created = [];
    let api;
    async function seed(role, status = "active") {
      const identity = fixture.account(
        `${randomUUID()}@example.invalid`,
        "fixture-only-password-123",
      );
      const rows = await database.query(
        "INSERT INTO airmech.users(identity_id,email,display_name,status) VALUES($1,$2,$3,$4) RETURNING id",
        [identity.id, identity.email, `Fixture ${role}`, status],
      );
      const user = { ...identity, userId: rows[0].id, role };
      created.push(user);
      await database.query("INSERT INTO airmech.user_roles VALUES($1,$2)", [user.userId, role]);
      return user;
    }
    async function request(path, { method = "GET", body, cookie, origin = appUrl } = {}) {
      return fetch(`${api}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          Origin: origin,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
    }
    async function login(user, password = user.password) {
      const response = await request("/auth/login", {
        method: "POST",
        body: { email: user.email, password },
      });
      assert.equal(response.status, 200, await response.clone().text());
      return responseCookie(response);
    }
    try {
      await application.listen(0, "127.0.0.1");
      api = await application.getUrl();
      await delivery.ready();
      const admin = await seed("super_admin"),
        manager = await seed("management"),
        engineer = await seed("engineer");
      let adminCookie = await login(admin),
        managerCookie = await login(manager),
        engineerCookie = await login(engineer);
      await t.test(
        "login denies invalid credentials, anonymous/disabled/expired sessions and foreign origins",
        async () => {
          assert.equal((await request("/auth/me")).status, 401);
          const unmapped = fixture.account(
            `${randomUUID()}@example.invalid`,
            "fixture-unmapped-password",
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: unmapped.email, password: unmapped.password },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: {
                  email: engineer.email,
                  password: engineer.password,
                  roles: ["super_admin"],
                },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: engineer.email, password: "wrong" },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                origin: "https://unapproved.example.invalid",
                body: { email: admin.email, password: admin.password },
              })
            ).status,
            403,
          );
          assert.equal((await request("/auth/me", { cookie: engineerCookie })).status, 200);
          const disabled = await seed("engineer", "disabled");
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: disabled.email, password: disabled.password },
              })
            ).status,
            401,
          );
          await database.query(
            "UPDATE airmech.auth_sessions SET expires_at=now()-interval '1 second',created_at=now()-interval '1 hour' WHERE user_id=$1",
            [engineer.userId],
          );
          assert.equal((await request("/auth/me", { cookie: engineerCookie })).status, 401);
          engineerCookie = await login(engineer);
          const logout = await request("/auth/logout", { method: "POST", cookie: engineerCookie });
          assert.equal(logout.status, 204);
          assert.equal((await request("/auth/me", { cookie: engineerCookie })).status, 401);
          engineerCookie = await login(engineer);
        },
      );
      await t.test(
        "Management can inspect but cannot change security; engineers cannot reach admin APIs",
        async () => {
          assert.equal((await request("/admin/users", { cookie: managerCookie })).status, 200);
          assert.equal((await request("/admin/roles", { cookie: managerCookie })).status, 200);
          const disabledPage = await request("/admin/users?status=disabled", {
            cookie: managerCookie,
          });
          assert.equal(disabledPage.status, 200);
          const filtered = await disabledPage.json();
          assert.ok(filtered.items.length > 0 && filtered.items.length <= 25);
          assert.ok(filtered.items.every((user) => user.status === "disabled"));
          assert.equal(
            (await request("/admin/users?status=unknown", { cookie: managerCookie })).status,
            400,
          );
          assert.equal((await request("/admin/users", { cookie: engineerCookie })).status, 403);
          assert.equal(
            (
              await request(`/admin/users/${engineer.userId}/roles`, {
                method: "POST",
                cookie: engineerCookie,
                body: { roles: ["super_admin"] },
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(`/admin/users/${engineer.userId}/roles`, {
                method: "POST",
                cookie: adminCookie,
                body: { roles: ["unknown_role"] },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(`/admin/users/${engineer.userId}/roles`, {
                method: "POST",
                cookie: managerCookie,
                body: { roles: ["super_admin"] },
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(`/admin/users/${engineer.userId}`, {
                method: "PATCH",
                cookie: adminCookie,
                body: {
                  displayName: "Updated engineer",
                  employeeCode: "E-TEST",
                  jobTitle: "Technician",
                  phone: "+000000",
                },
              })
            ).status,
            204,
          );
          const duplicate = await request(`/admin/users/${manager.userId}`, {
            method: "PATCH",
            cookie: adminCookie,
            body: { displayName: "Management", employeeCode: "E-TEST" },
          });
          assert.equal(duplicate.status, 409);
          assert.equal((await duplicate.text()).includes("INSERT"), false);
        },
      );
      await t.test(
        "the final active Super Admin and mandatory grants cannot be removed",
        async () => {
          assert.equal(
            (
              await request(`/admin/users/${admin.userId}/disable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request(`/admin/users/${admin.userId}/roles`, {
                method: "POST",
                cookie: adminCookie,
                body: { roles: ["management"] },
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request("/admin/roles/super_admin", {
                method: "PATCH",
                cookie: adminCookie,
                body: { name: "Super Admin", permissions: [] },
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request("/admin/roles/engineer", {
                method: "PATCH",
                cookie: adminCookie,
                body: { name: "Engineer", permissions: ["admin.users"] },
              })
            ).status,
            400,
          );
          assert.equal((await request("/auth/me", { cookie: adminCookie })).status, 200);
        },
      );
      await t.test(
        "role lifecycle filters effective grants, revokes sessions and protects the admin path",
        async () => {
          const roleUser = await seed("engineer");
          const roleCookie = await login(roleUser);
          assert.equal(
            (
              await request("/admin/roles/engineer/disable", {
                method: "POST",
                cookie: managerCookie,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request("/admin/roles/super_admin/disable", {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            409,
          );
          const multi = await seed("management");
          await database.query("INSERT INTO airmech.user_roles VALUES($1,'engineer')", [
            multi.userId,
          ]);
          const multiCookie = await login(multi);
          assert.equal(
            (
              await request("/admin/roles/engineer/disable", {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            204,
          );
          assert.equal((await request("/auth/me", { cookie: roleCookie })).status, 401);
          assert.equal((await request("/auth/me", { cookie: multiCookie })).status, 401);
          const denied = await request("/auth/login", {
            method: "POST",
            body: { email: roleUser.email, password: roleUser.password },
          });
          assert.equal(denied.status, 200);
          const noGrants = await denied.json();
          assert.deepEqual(noGrants.roles, []);
          assert.deepEqual(noGrants.permissions, []);
          assert.deepEqual(noGrants.rolePermissions, {});
          assert.equal((await request("/auth/me", { cookie: responseCookie(denied) })).status, 403);
          const current = await request("/auth/login", {
            method: "POST",
            body: { email: multi.email, password: multi.password },
          });
          assert.deepEqual((await current.json()).roles, ["management"]);
          assert.equal(
            (
              await request(`/admin/users/${multi.userId}/roles`, {
                method: "POST",
                cookie: adminCookie,
                body: { roles: ["engineer"] },
              })
            ).status,
            409,
          );
          assert.equal(
            (await request("/admin/roles/engineer/enable", { method: "POST", cookie: adminCookie }))
              .status,
            204,
          );
          assert.equal((await request("/auth/me", { cookie: await login(roleUser) })).status, 200);
          const events = await database.query(
            "SELECT event,details FROM airmech.audit_events WHERE event IN ('ROLE_DISABLED','ROLE_ENABLED')",
          );
          assert.equal(events.filter((row) => row.details.roleCode === "engineer").length, 2);
          assert.deepEqual(events.find((row) => row.event === "ROLE_DISABLED").details.after, [
            "disabled",
          ]);
          const firstPage = await (await request("/admin/users", { cookie: adminCookie })).json();
          const emptyPage = await (
            await request("/admin/users?page=1000", { cookie: adminCookie })
          ).json();
          assert.deepEqual(emptyPage.items, []);
          assert.equal(emptyPage.total, firstPage.total);
        },
      );
      await t.test(
        "notification reads and mutations are bounded to the current recipient",
        async () => {
          const recipient = await seed("engineer");
          const notificationCookie = await login(recipient);
          const own = await database.query(
            "INSERT INTO airmech.notifications(recipient_id,channel,title,message) SELECT $1,'in_app','Operational notice','Only the recipient can read this' FROM generate_series(1,26) RETURNING id",
            [recipient.userId],
          );
          const other = await database.query(
            "INSERT INTO airmech.notifications(recipient_id,channel,title,message) VALUES($1,'in_app','Private management notice','Do not disclose') RETURNING id",
            [manager.userId],
          );
          const first = await (
            await request("/notifications", { cookie: notificationCookie })
          ).json();
          assert.equal(first.items.length, 25);
          assert.equal(first.hasMore, true);
          assert.ok(first.items.every((item) => item.title === "Operational notice"));
          assert.equal(
            (
              await request(`/notifications/${other[0].id}/read`, {
                method: "POST",
                cookie: notificationCookie,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(`/notifications/${own[0].id}/read`, {
                method: "POST",
                cookie: notificationCookie,
              })
            ).status,
            204,
          );
          assert.equal(
            (await request("/notifications?page=0", { cookie: notificationCookie })).status,
            400,
          );
          const second = await (
            await request("/notifications?page=2", { cookie: notificationCookie })
          ).json();
          assert.equal(second.items.length, 1);
          assert.equal(second.hasMore, false);
        },
      );
      await t.test(
        "role and disable changes revoke existing sessions, persist current grants and append audit",
        async () => {
          assert.equal(
            (
              await request(`/admin/users/${engineer.userId}/roles`, {
                method: "POST",
                cookie: adminCookie,
                body: { roles: ["engineer"] },
              })
            ).status,
            204,
          );
          assert.equal((await request("/auth/me", { cookie: engineerCookie })).status, 401);
          await request(`/admin/users/${engineer.userId}/disable`, {
            method: "POST",
            cookie: adminCookie,
          });
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: engineer.email, password: engineer.password },
              })
            ).status,
            401,
          );
          await request(`/admin/users/${engineer.userId}/enable`, {
            method: "POST",
            cookie: adminCookie,
          });
          const audit = await database.query(
            "SELECT event,details FROM airmech.audit_events WHERE entity_id=$1 ORDER BY id",
            [engineer.userId],
          );
          for (const event of [
            "USER_UPDATED",
            "USER_ROLE_CHANGED",
            "USER_DISABLED",
            "USER_ENABLED",
          ])
            assert.ok(
              audit.some((row) => row.event === event),
              event,
            );
          const roleEvent = audit.find((row) => row.event === "USER_ROLE_CHANGED");
          assert.deepEqual(roleEvent.details.before, ["engineer"]);
          assert.deepEqual(roleEvent.details.after, ["engineer"]);
        },
      );
      await t.test(
        "reset mail is asynchronous, provider retries are finite and PKCE is browser-bound",
        async () => {
          fixture.state.pauseRecovery = true;
          const response = await request("/auth/password-reset/request", {
            method: "POST",
            body: { email: manager.email },
          });
          assert.equal(response.status, 202);
          const recoveryCookie = responseCookie(response, "airmech_recovery");
          await until(() => fixture.state.recoveryStarted);
          assert.equal(fixture.recoveries.size, 0, "Mail waits outside the HTTP request");
          fixture.releaseRecovery();
          fixture.state.pauseRecovery = false;
          await until(() => fixture.recoveries.size > 0);
          const [code, recovery] = [...fixture.recoveries.entries()].find(
            ([, value]) => value.user.id === manager.id,
          );
          assert.equal(
            (await request("/auth/recovery/complete", { method: "POST", body: { code } })).status,
            400,
          );
          const completed = await request("/auth/recovery/complete", {
            method: "POST",
            cookie: recoveryCookie,
            body: { code },
          });
          assert.equal(completed.status, 204);
          const passwordCookie = responseCookie(completed);
          assert.equal((await request("/auth/me", { cookie: passwordCookie })).status, 401);
          assert.equal(
            (
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie: managerCookie,
                body: { password: "not-allowed-login-cookie" },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/recovery/complete", {
                method: "POST",
                cookie: recoveryCookie,
                body: { code },
              })
            ).status,
            400,
          );
          assert.equal(recovery.used, true);
          fixture.state.pausePassword = true;
          const change = request("/auth/password-reset/complete", {
            method: "POST",
            cookie: passwordCookie,
            body: { password: "fixture-new-password-123" },
          });
          await until(() => fixture.state.passwordStarted);
          assert.equal((await request("/auth/me", { cookie: managerCookie })).status, 401);
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email: manager.email, password: manager.password },
              })
            ).status,
            401,
          );
          fixture.releasePassword();
          assert.equal((await change).status, 204);
          fixture.state.pausePassword = false;
          assert.equal(
            (
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie: passwordCookie,
                body: { password: "fixture-replay-password" },
              })
            ).status,
            400,
          );
          managerCookie = await login(manager, "fixture-new-password-123");
          const retryUser = await seed("engineer");
          fixture.state.recoveryFailures = 2;
          const before = fixture.state.recoveryCalls;
          assert.equal(
            (
              await request("/auth/password-reset/request", {
                method: "POST",
                body: { email: retryUser.email },
              })
            ).status,
            202,
          );
          await until(async () => {
            const rows = await database.query(
              "SELECT count(*)::integer AS count FROM airmech.audit_events WHERE event='AUTH_MESSAGE_SENT'",
            );
            return fixture.state.recoveryCalls >= before + 3 && rows[0].count >= 2;
          });
          assert.equal(fixture.state.recoveryCalls, before + 3);
          fixture.state.recoveryFailures = 3;
          await request("/auth/password-reset/request", {
            method: "POST",
            body: { email: `${randomUUID()}@example.invalid` },
          });
          await until(async () => {
            const rows = await database.query(
              "SELECT count(*)::integer AS count FROM airmech.auth_messages WHERE state='failed'",
            );
            return rows[0].count > 0;
          });
          assert.equal(fixture.state.recoveryCalls, before + 6);
        },
      );
      await t.test(
        "expired and invalid recovery states, expired sessions and provider failures deny safely",
        async () => {
          async function recovery() {
            const user = await seed("engineer");
            const response = await request("/auth/password-reset/request", {
              method: "POST",
              body: { email: user.email },
            });
            assert.equal(response.status, 202);
            await until(() =>
              [...fixture.recoveries.values()].some((item) => item.user.id === user.id),
            );
            const [code, item] = [...fixture.recoveries.entries()].find(
              ([, value]) => value.user.id === user.id,
            );
            return { user, code, item, cookie: responseCookie(response, "airmech_recovery") };
          }
          const expired = await recovery();
          const stateHash = createHash("sha256").update(expired.cookie.split("=")[1]).digest("hex");
          await database.query(
            "UPDATE airmech.auth_recovery_requests SET expires_at=now()-interval '1 second' WHERE state_hash=$1",
            [stateHash],
          );
          assert.equal(
            (
              await request("/auth/recovery/complete", {
                method: "POST",
                cookie: expired.cookie,
                body: { code: expired.code },
              })
            ).status,
            400,
          );
          const invalid = await recovery();
          assert.equal(
            (
              await request("/auth/recovery/complete", {
                method: "POST",
                cookie: invalid.cookie,
                body: { code: randomUUID() },
              })
            ).status,
            400,
          );
          const providerExpired = await recovery();
          providerExpired.item.expiresAt = Date.now() - 1;
          assert.equal(
            (
              await request("/auth/recovery/complete", {
                method: "POST",
                cookie: providerExpired.cookie,
                body: { code: providerExpired.code },
              })
            ).status,
            400,
          );
          const sessionExpired = await recovery();
          const verified = await request("/auth/recovery/complete", {
            method: "POST",
            cookie: sessionExpired.cookie,
            body: { code: sessionExpired.code },
          });
          assert.equal(verified.status, 204);
          const passwordCookie = responseCookie(verified);
          await database.query(
            "UPDATE airmech.auth_sessions SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' WHERE user_id=$1",
            [sessionExpired.user.userId],
          );
          assert.equal(
            (await request("/auth/recovery/status", { cookie: passwordCookie })).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie: passwordCookie,
                body: { password: "fixture-expired-password" },
              })
            ).status,
            400,
          );
          const failed = await recovery();
          const oldLogin = await login(failed.user);
          const ready = await request("/auth/recovery/complete", {
            method: "POST",
            cookie: failed.cookie,
            body: { code: failed.code },
          });
          assert.equal(ready.status, 204);
          const failedCookie = responseCookie(ready);
          fixture.state.passwordFailures = 1;
          const update = await request("/auth/password-reset/complete", {
            method: "POST",
            cookie: failedCookie,
            body: { password: "fixture-failed-password" },
          });
          assert.equal(update.status, 503);
          assert.equal((await update.text()).includes("fixture-failed-password"), false);
          assert.equal((await request("/auth/me", { cookie: oldLogin })).status, 401);
          assert.equal(
            (await request("/auth/recovery/status", { cookie: failedCookie })).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie: failedCookie,
                body: { password: "fixture-replayed-password" },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await database.query(
                "SELECT count(*)::integer AS count FROM airmech.auth_sessions WHERE user_id=$1",
                [failed.user.userId],
              )
            )[0].count,
            0,
          );
        },
      );
      await t.test(
        "a concurrent disable during provider password update stays disabled",
        async () => {
          const user = await seed("engineer");
          const response = await request("/auth/password-reset/request", {
            method: "POST",
            body: { email: user.email },
          });
          assert.equal(response.status, 202);
          await until(() =>
            [...fixture.recoveries.values()].some((item) => item.user.id === user.id),
          );
          const [code] = [...fixture.recoveries.entries()].find(
            ([, item]) => item.user.id === user.id,
          );
          const verified = await request("/auth/recovery/complete", {
            method: "POST",
            cookie: responseCookie(response, "airmech_recovery"),
            body: { code },
          });
          assert.equal(verified.status, 204);
          fixture.holdPassword();
          const change = request("/auth/password-reset/complete", {
            method: "POST",
            cookie: responseCookie(verified),
            body: { password: "fixture-racing-reset-password" },
          });
          await until(() => fixture.state.passwordStarted);
          assert.equal(
            (
              await request(`/admin/users/${user.userId}/disable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            204,
          );
          fixture.releasePassword();
          fixture.state.pausePassword = false;
          assert.equal((await change).status, 400);
          assert.equal(
            (await database.query("SELECT status FROM airmech.users WHERE id=$1", [user.userId]))[0]
              .status,
            "disabled",
          );
          assert.equal(
            (
              await database.query(
                "SELECT count(*)::integer AS count FROM airmech.auth_sessions WHERE user_id=$1",
                [user.userId],
              )
            )[0].count,
            0,
          );
        },
      );
      await t.test(
        "invited accounts require verified single-use password setup before login",
        async () => {
          const email = `${randomUUID()}@example.invalid`;
          const createdResponse = await request("/admin/users", {
            method: "POST",
            cookie: adminCookie,
            body: { email, displayName: "Invited fixture", roles: ["engineer"] },
          });
          assert.equal(createdResponse.status, 201);
          const identity = fixture.accounts.get(email);
          const rows = await database.query(
            "SELECT id,status FROM airmech.users WHERE identity_id=$1",
            [identity.id],
          );
          assert.equal(rows[0].status, "invited");
          created.push({ userId: rows[0].id });
          await until(() =>
            [...fixture.invitations.values()].some((invite) => invite.user.id === identity.id),
          );
          const [hash] = [...fixture.invitations.entries()].find(
            ([, value]) => value.user.id === identity.id,
          );
          const verified = await request("/auth/invitation/complete", {
            method: "POST",
            body: { tokenHash: hash },
          });
          assert.equal(verified.status, 204);
          const cookie = responseCookie(verified);
          assert.equal((await request("/auth/me", { cookie })).status, 401);
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/enable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            409,
          );
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/disable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            204,
          );
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/enable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            204,
          );
          assert.equal(
            (await database.query("SELECT status FROM airmech.users WHERE id=$1", [rows[0].id]))[0]
              .status,
            "invited",
          );
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/invite`, {
                method: "POST",
                cookie: managerCookie,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/invite`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            202,
          );
          assert.equal((await request("/auth/recovery/status", { cookie })).status, 400);
          await until(() =>
            [...fixture.recoveries.values()].some(
              (value) => value.user.id === identity.id && !value.challenge,
            ),
          );
          const [setupCode] = [...fixture.recoveries.entries()].find(
            ([, value]) => value.user.id === identity.id && !value.challenge,
          );
          const recovered = await fetch(`${fixture.url}/auth/v1/verify`, {
            method: "POST",
            headers: { apikey: "fixture-public-key", "Content-Type": "application/json" },
            body: JSON.stringify({ type: "recovery", token_hash: setupCode }),
          });
          assert.equal(recovered.status, 200);
          const setupSession = await recovered.json();
          const newVerified = await request("/auth/invitation/session", {
            method: "POST",
            body: { accessToken: setupSession.access_token },
          });
          assert.equal(newVerified.status, 204);
          const newCookie = responseCookie(newVerified);
          assert.equal(
            (
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie: newCookie,
                body: { password: "fixture-invite-password-123" },
              })
            ).status,
            204,
          );
          assert.equal(
            (
              await request("/auth/invitation/complete", {
                method: "POST",
                body: { tokenHash: hash },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email, password: "fixture-invite-password-123" },
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await request(`/admin/users/${rows[0].id}/invite`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            409,
          );
          const events = await database.query(
            "SELECT event FROM airmech.audit_events WHERE entity_id=$1",
            [rows[0].id],
          );
          for (const event of ["USER_CREATED", "USER_INVITE_RESENT", "USER_INVITATION_ACCEPTED"])
            assert.ok(events.some((row) => row.event === event));
        },
      );
      await t.test(
        "built desktop/mobile UI completes real API invitation, resend and PKCE recovery",
        async () => {
          const { chromium } = require("@playwright/test");
          const browser = await chromium.launch({
            headless: true,
            ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
              ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
              : {}),
          });
          try {
            const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            const page = await context.newPage();
            // A loopback proxy sends the real browser requests to the owned API;
            // no authentication/admin response is fabricated.
            await page.route("**/api/**", async (route) => {
              const target = new URL(route.request().url());
              const result = await route.fetch({
                url: `${api}${target.pathname.slice(4)}${target.search}`,
              });
              await route.fulfill({ response: result });
            });
            await page.goto(`${appUrl}/login`);
            await page.getByLabel("Email", { exact: true }).fill(admin.email);
            await page.getByLabel("Password", { exact: true }).fill(admin.password);
            await page.getByRole("button", { name: "Sign in", exact: true }).click();
            await page.waitForURL("**/workspace");
            await page.goto(`${appUrl}/admin/users`);
            await page.getByRole("button", { name: "Invite user", exact: true }).click();
            const email = `${randomUUID()}@example.invalid`;
            await page.getByLabel("Email", { exact: true }).fill(email);
            await page.getByLabel("Name", { exact: true }).fill("UI invited colleague");
            await page.getByLabel("Engineer / Technician", { exact: true }).check();
            await page.getByRole("button", { name: "Send invitation", exact: true }).click();
            await page.getByText("Invitation requested.", { exact: true }).waitFor();
            const identity = fixture.accounts.get(email);
            assert.ok(identity);
            const user = (
              await database.query("SELECT id FROM airmech.users WHERE identity_id=$1", [
                identity.id,
              ])
            )[0];
            created.push({ userId: user.id });
            await page.getByLabel("Find users", { exact: true }).fill(email);
            await page.getByRole("button", { name: "Search", exact: true }).click();
            await page
              .getByRole("button", { name: "Edit", exact: true })
              .filter({ visible: true })
              .click();
            await page.getByRole("button", { name: "Resend invitation", exact: true }).click();
            await page
              .getByText("Invitation resend requested. Previous setup sessions were revoked.", {
                exact: true,
              })
              .waitFor();
            await until(() =>
              [...fixture.invitations.values()].some(
                (item) => item.user.id === identity.id && !item.used,
              ),
            );
            const [hash] = [...fixture.invitations.entries()].find(
              ([, value]) => value.user.id === identity.id && !value.used,
            );
            await page.setViewportSize({ width: 390, height: 844 });
            const providerVerification = await fetch(`${fixture.url}/auth/v1/verify`, {
              method: "POST",
              headers: { apikey: "fixture-public-key", "Content-Type": "application/json" },
              body: JSON.stringify({ type: "invite", token_hash: hash }),
            });
            assert.equal(providerVerification.status, 200);
            const providerSession = await providerVerification.json();
            await page.goto(
              `${appUrl}/auth/callback#type=invite&access_token=${encodeURIComponent(providerSession.access_token)}&refresh_token=fixture-unused-refresh`,
            );
            await page.waitForURL("**/auth/reset-password");
            const password = "fixture-ui-setup-password-123";
            await page.getByLabel("Password", { exact: true }).fill(password);
            await page.getByLabel("Confirm password", { exact: true }).fill(password);
            await page.getByRole("button", { name: "Save password" }).click();
            await page
              .getByText("Your password was saved. Sign in with the new password.", { exact: true })
              .waitFor();
            assert.equal(
              (await database.query("SELECT status FROM airmech.users WHERE id=$1", [user.id]))[0]
                .status,
              "active",
            );
            await page.getByRole("link", { name: "Back to sign in" }).click();
            await page.getByLabel("Email", { exact: true }).fill(email);
            await page.getByLabel("Password", { exact: true }).fill(password);
            await page.getByRole("button", { name: "Sign in", exact: true }).click();
            await page.waitForURL("**/workspace");
            await page.getByRole("button", { name: "Account", exact: true }).click();
            await page.getByRole("link", { name: "Reset password", exact: true }).click();
            await page.getByLabel("Email", { exact: true }).fill(email);
            await page.getByRole("button", { name: "Send reset instructions" }).click();
            await page
              .getByText(
                "If your account exists, instructions will arrive by email. Open the link in this browser.",
                { exact: true },
              )
              .waitFor();
            await until(() =>
              [...fixture.recoveries.values()].some((item) => item.user.id === identity.id),
            );
            const [code] = [...fixture.recoveries.entries()].find(
              ([, value]) => value.user.id === identity.id,
            );
            await page.goto(`${appUrl}/auth/callback?code=${code}`);
            await page.waitForURL("**/auth/reset-password");
            await page
              .getByLabel("Password", { exact: true })
              .fill("fixture-ui-reset-password-456");
            await page
              .getByLabel("Confirm password", { exact: true })
              .fill("fixture-ui-reset-password-456");
            await page.getByRole("button", { name: "Save password" }).click();
            await page
              .getByText("Your password was saved. Sign in with the new password.", { exact: true })
              .waitFor();
            assert.equal(identity.password, "fixture-ui-reset-password-456");
            assert.equal(
              (
                await database.query(
                  "SELECT count(*)::integer AS count FROM airmech.auth_sessions WHERE user_id=$1",
                  [user.id],
                )
              )[0].count,
              0,
            );
            await context.close();
          } finally {
            await browser.close();
          }
        },
      );
      await t.test(
        "an active user's provider token cannot become an invitation setup session",
        async () => {
          const providerLogin = await fetch(`${fixture.url}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: { apikey: "fixture-public-key", "Content-Type": "application/json" },
            body: JSON.stringify({ email: admin.email, password: admin.password }),
          });
          assert.equal(providerLogin.status, 200);
          const session = await providerLogin.json();
          assert.equal(
            (
              await request("/auth/invitation/session", {
                method: "POST",
                body: { accessToken: session.access_token },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/auth/invitation/session", {
                method: "POST",
                body: { accessToken: "expired-token" },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "revoked provisioning authority rolls back the profile and removes only its new identity",
        async () => {
          const operator = await seed("super_admin");
          const operatorCookie = await login(operator);
          const email = `${randomUUID()}@example.invalid`;
          fixture.state.pauseProvision = true;
          fixture.state.provisionStarted = false;
          const creation = request("/admin/users", {
            method: "POST",
            cookie: operatorCookie,
            body: { email, displayName: "Revoked provision", roles: ["engineer"] },
          });
          await until(() => fixture.state.provisionStarted);
          assert.equal(
            (
              await request(`/admin/users/${operator.userId}/disable`, {
                method: "POST",
                cookie: adminCookie,
              })
            ).status,
            204,
          );
          fixture.releaseProvision();
          fixture.state.pauseProvision = false;
          assert.equal((await creation).status, 401);
          assert.equal(fixture.accounts.has(email), false);
          assert.equal(
            (
              await database.query(
                "SELECT count(*)::integer AS count FROM airmech.users WHERE email=$1",
                [email],
              )
            )[0].count,
            0,
          );
          assert.equal(
            (
              await database.query(
                "SELECT count(*)::integer AS count FROM airmech.audit_events WHERE actor_id=$1 AND event='USER_INVITE_PROFILE_FAILED'",
                [operator.userId],
              )
            )[0].count,
            1,
          );
        },
      );
      await t.test("concurrent administrator changes leave an active Super Admin", async () => {
        const other = await seed("super_admin");
        const otherCookie = await login(other);
        const results = await Promise.all([
          request(`/admin/users/${other.userId}/disable`, { method: "POST", cookie: adminCookie }),
          request(`/admin/users/${admin.userId}/disable`, { method: "POST", cookie: otherCookie }),
        ]);
        assert.equal(results.filter((result) => result.status === 204).length, 1);
        assert.ok(results.some((result) => [401, 409].includes(result.status)));
        const rows = await database.query(
          "SELECT count(*)::integer AS count FROM airmech.users u JOIN airmech.user_roles ur ON ur.user_id=u.id WHERE ur.role_code='super_admin' AND u.status='active'",
        );
        assert.equal(rows[0].count, 1);
      });
      await t.test(
        "login throttling is shared in PostgreSQL and recorded audit has no passwords or provider tokens",
        async () => {
          const email = `${randomUUID()}@example.invalid`;
          for (let attempt = 0; attempt < 5; attempt++)
            assert.equal(
              (
                await request("/auth/login", {
                  method: "POST",
                  body: { email, password: "fixture-incorrect-password" },
                })
              ).status,
              401,
            );
          assert.equal(
            (
              await request("/auth/login", {
                method: "POST",
                body: { email, password: "fixture-incorrect-password" },
              })
            ).status,
            429,
          );
          const rows = await database.query("SELECT event,details FROM airmech.audit_events");
          const encoded = JSON.stringify(rows);
          for (const secret of [
            "fixture-only-password-123",
            "fixture-new-password-123",
            configuration.auth.secret,
            configuration.storage.serviceRoleKey,
          ])
            assert.equal(encoded.includes(secret), false);
        },
      );
    } finally {
      fixture.releaseRecovery();
      fixture.releasePassword();
      fixture.releaseProvision();
      const cleanup = await Promise.allSettled([
        application.close(),
        delivery.close(),
        web.close(),
      ]);
      try {
        if (created.length)
          await database.query(
            "UPDATE airmech.users SET status='disabled' WHERE id=ANY($1::uuid[])",
            [created.map((user) => user.userId)],
          );
      } finally {
        await database.close();
        await fixture.close();
      }
      assert.ok(
        cleanup.every((result) => result.status === "fulfilled"),
        "Owned auth resources must close successfully",
      );
    }
  },
);
