const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const test = require("node:test");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { applyMigrations, readMigrations, databasePoolOptions } = require("@airmech/database");
const { hasPermission } = require("@airmech/contracts");
const { Pool } = createRequire(require.resolve("@airmech/database"))("pg");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");

test(
  "disposable PostgreSQL enforces identity uniqueness, explicit RBAC, RLS and append-only audit",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Identity mutations require an explicitly opted-in disposable database"
        : false,
  },
  async () => {
    const configuration = readServerConfiguration("api", loadEnvironment()).database;
    assertDisposableDatabase(configuration);
    await applyMigrations(configuration, await readMigrations());
    const { UserRepository } = await import("../../apps/api/dist/modules/users/user.repository.js");
    const pool = new Pool({ ...databasePoolOptions(configuration), max: 1 });
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      // Real PostgreSQL transaction adapter: all generated fixtures roll back together.
      const repository = new UserRepository({
        query: async (sql, values) => (await connection.query(sql, values)).rows,
      });
      const identityId = randomUUID();
      const email = `${randomUUID()}@example.invalid`;
      const inserted = await connection.query(
        "INSERT INTO airmech.users (identity_id, email, display_name) VALUES ($1,$2,$3) RETURNING id",
        [identityId, email, "Disposable verification user"],
      );
      const userId = inserted.rows[0].id;
      let principal = await repository.findPrincipal(identityId);
      assert.equal(principal.user.status, "invited");
      assert.deepEqual(principal.permissions, []);
      await connection.query("UPDATE airmech.users SET status='active' WHERE id=$1", [userId]);
      await connection.query("INSERT INTO airmech.user_roles VALUES ($1,'super_admin')", [userId]);
      principal = await repository.findPrincipal(identityId);
      assert.deepEqual(principal.roles, ["super_admin"]);
      assert.equal(hasPermission(principal, "admin.users"), false);
      await connection.query(
        "INSERT INTO airmech.role_permissions VALUES ('super_admin','admin.users')",
      );
      principal = await repository.findPrincipal(identityId);
      assert.equal(hasPermission(principal, "admin.users"), true);
      await connection.query("DELETE FROM airmech.role_permissions WHERE role_code='super_admin'");
      assert.equal(hasPermission(await repository.findPrincipal(identityId), "admin.users"), false);
      await connection.query("UPDATE airmech.users SET status='disabled' WHERE id=$1", [userId]);
      assert.equal((await repository.findPrincipal(identityId)).user.status, "disabled");
      assert.equal(await repository.findPrincipal(randomUUID()), null);

      async function rejectsStatement(sql, values, code) {
        await connection.query("SAVEPOINT expected_failure");
        await assert.rejects(connection.query(sql, values), { code });
        await connection.query("ROLLBACK TO SAVEPOINT expected_failure");
        await connection.query("RELEASE SAVEPOINT expected_failure");
      }
      await rejectsStatement(
        "INSERT INTO airmech.users (identity_id,email,display_name) VALUES ($1,$2,'Duplicate')",
        [randomUUID(), email.toUpperCase()],
        "23505",
      );
      await rejectsStatement(
        "INSERT INTO airmech.users (identity_id,email,display_name) VALUES ($1,$2,'Duplicate')",
        [identityId, `${randomUUID()}@example.invalid`],
        "23505",
      );
      await rejectsStatement(
        "INSERT INTO airmech.user_roles VALUES ($1,'missing_role')",
        [userId],
        "23503",
      );
      await connection.query(
        "INSERT INTO airmech.audit_events (actor_id,event,entity_type,entity_id,request_id) VALUES ($1,'ROLE_CHANGED','user',$1,$2)",
        [userId, randomUUID()],
      );
      for (const sql of [
        "UPDATE airmech.audit_events SET event='LOGIN_SUCCESS'",
        "DELETE FROM airmech.audit_events",
        "TRUNCATE airmech.audit_events",
      ]) {
        await rejectsStatement(sql, [], "42501");
      }
      const security = await connection.query(
        "SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='airmech' AND relkind='r' AND relname=ANY($1::text[])",
        [["users", "roles", "permissions", "user_roles", "role_permissions", "audit_events"]],
      );
      assert.equal(security.rows.length, 6);
      assert.ok(security.rows.every((row) => row.relrowsecurity));
      const policies = await connection.query(
        "SELECT count(*)::integer AS count FROM pg_policies WHERE schemaname='airmech'",
      );
      assert.equal(policies.rows[0].count, 0);
      const roles = await connection.query("SELECT count(*)::integer AS count FROM airmech.roles");
      assert.equal(roles.rows[0].count, 8);
      // A non-owner with table privileges still receives zero rows through RLS.
      // The generated role and its grants are rolled back with the fixtures.
      const restrictedRole = `fixture_${randomUUID().replaceAll("-", "")}`;
      await connection.query(`CREATE ROLE "${restrictedRole}" NOLOGIN NOBYPASSRLS`);
      await connection.query(`GRANT USAGE ON SCHEMA airmech TO "${restrictedRole}"`);
      await connection.query(`GRANT SELECT ON airmech.users, airmech.roles TO "${restrictedRole}"`);
      await connection.query(`SET LOCAL ROLE "${restrictedRole}"`);
      const invisible = await connection.query(
        "SELECT (SELECT count(*) FROM airmech.users)::integer AS users, (SELECT count(*) FROM airmech.roles)::integer AS roles",
      );
      assert.deepEqual(invisible.rows[0], { users: 0, roles: 0 });
      await connection.query("RESET ROLE");
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pool.end();
    }
  },
);
