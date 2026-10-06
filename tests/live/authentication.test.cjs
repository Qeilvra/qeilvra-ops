const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { DatabaseClient, applyMigrations, readMigrations } = require("@airmech/database");
const { startAuthMessageWorker } = require("@airmech/queue");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");
const { startAuthProviderFixture } = require("../helpers/auth-provider-fixture.cjs");

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
    const appUrl = "http://localhost:3000";
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
              await request("/auth/password-reset/complete", {
                method: "POST",
                cookie,
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
      const cleanup = await Promise.allSettled([application.close(), delivery.close()]);
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
