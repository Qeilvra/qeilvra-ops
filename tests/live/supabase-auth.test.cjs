const assert = require("node:assert/strict");
const test = require("node:test");
const { randomUUID, randomBytes } = require("node:crypto");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { DatabaseClient, applyMigrations, readMigrations } = require("@airmech/database");
const { SupabaseAuthProvider } = require("@airmech/identity");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");

test(
  "controlled live Supabase identity authenticates through the real API with disposable application data",
  {
    skip:
      process.env.AUTH_PROVIDER_LIVE_VERIFICATION !== "true"
        ? "Live provider identity verification requires explicit opt-in and approved private configuration"
        : false,
    timeout: 120000,
  },
  async (t) => {
    const local = readServerConfiguration("api", loadEnvironment({ envFile: false }));
    assertDisposableDatabase(local.database);
    assert.ok(
      process.env.AUTH_PROVIDER_TEST_ENV_FILE,
      "An explicit private provider file is required",
    );
    const cloud = loadEnvironment({
      environment: { NODE_ENV: "test" },
      envFile: process.env.AUTH_PROVIDER_TEST_ENV_FILE,
    });
    const config = readServerConfiguration("api", {
      NODE_ENV: "test",
      DATABASE_ENABLED: "true",
      DATABASE_URL: local.database.url,
      ...(local.database.migrationUrl
        ? { DATABASE_MIGRATION_URL: local.database.migrationUrl }
        : {}),
      AUTH_ENABLED: "true",
      AUTH_SECRET: randomBytes(48).toString("base64url"),
      APP_URL: "http://localhost:3000",
      SUPABASE_URL: cloud.SUPABASE_URL,
      SUPABASE_ANON_KEY: cloud.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: cloud.SUPABASE_SERVICE_ROLE_KEY,
    });
    await applyMigrations(local.database, await readMigrations());
    const database = new DatabaseClient(local.database);
    const provider = new SupabaseAuthProvider(config);
    const email = `codex-auth-test+${randomUUID()}@example.com`;
    const password = randomBytes(32).toString("base64url");
    let identityId, userId, app;
    try {
      identityId = (await provider.createTestIdentity(email, password)).identityId;
      const { createApiApplication } = await import("../../apps/api/dist/application.js");
      app = await createApiApplication(config);
      await app.listen(0, "127.0.0.1");
      const origin = await app.getUrl();
      async function request(route, body, cookie) {
        return fetch(`${origin}${route}`, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        });
      }
      const noProfile = await request("/auth/login", { email, password });
      assert.equal(
        noProfile.status,
        401,
        "A valid provider identity cannot bypass a missing application profile",
      );
      userId = (
        await database.query(
          "INSERT INTO airmech.users(identity_id,email,display_name,status) VALUES($1,$2,'Temporary live verification','active') RETURNING id",
          [identityId, email],
        )
      )[0].id;
      await database.query("INSERT INTO airmech.user_roles VALUES($1,'engineer')", [userId]);
      await t.test(
        "valid credentials produce an HttpOnly opaque application session without provider tokens",
        async () => {
          const login = await request("/auth/login", { email, password });
          assert.equal(login.status, 200);
          const header = login.headers
            .getSetCookie()
            .find((value) => value.startsWith("airmech_session="));
          assert.ok(header);
          assert.match(header, /HttpOnly/);
          assert.match(header, /SameSite=Lax/);
          const cookie = header.split(";")[0];
          const principal = await login.json();
          assert.equal(principal.user.identityId, identityId);
          assert.equal(principal.user.id, userId);
          assert.deepEqual(principal.roles, ["engineer"]);
          assert.ok(principal.permissions.includes("profile.read"));
          assert.ok(principal.rolePermissions.engineer.includes("workorder.read"));
          assert.equal(principal.permissions.includes("admin.users"), false);
          assert.equal(JSON.stringify(principal).includes(password), false);
          assert.equal("access_token" in principal, false);
          assert.equal((await request("/auth/me", undefined, cookie)).status, 200);
          assert.equal((await request("/admin/users", undefined, cookie)).status, 403);
          const logout = await request("/auth/logout", {}, cookie);
          assert.equal(logout.status, 204);
          assert.equal((await request("/auth/me", undefined, cookie)).status, 401);
        },
      );
      await t.test("invalid and disabled credentials have the same safe denial", async () => {
        const invalid = await request("/auth/login", {
          email,
          password: randomBytes(32).toString("base64url"),
        });
        assert.equal(invalid.status, 401);
        await database.query("UPDATE airmech.users SET status='disabled' WHERE id=$1", [userId]);
        const disabled = await request("/auth/login", { email, password });
        assert.equal(disabled.status, 401);
        assert.equal((await invalid.json()).error.code, (await disabled.json()).error.code);
        const audit = await database.query(
          "SELECT event,details FROM airmech.audit_events WHERE actor_id=$1 OR event='LOGIN_FAILED'",
          [userId],
        );
        assert.ok(audit.some((row) => row.event === "LOGIN_SUCCESS"));
        assert.ok(audit.some((row) => row.event === "LOGOUT"));
        const encoded = JSON.stringify(audit);
        for (const secret of [password, config.auth.secret, config.storage.serviceRoleKey])
          assert.equal(encoded.includes(secret), false);
      });
    } finally {
      try {
        if (app) await app.close();
      } finally {
        try {
          if (identityId) {
            await provider.deleteTestIdentity(identityId);
            t.diagnostic("Owned temporary Supabase identity deleted successfully.");
          }
        } finally {
          await database.close();
        }
      }
    }
  },
);
