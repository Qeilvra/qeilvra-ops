const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const test = require("node:test");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { applyMigrations, readMigrations, databasePoolOptions } = require("@airmech/database");
const { Pool } = createRequire(require.resolve("@airmech/database"))("pg");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");

test(
  "disposable customer model preserves codes, primary-contact ownership and archive history",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Customer mutations require an explicitly opted-in disposable database"
        : false,
  },
  async () => {
    const configuration = readServerConfiguration("api", loadEnvironment()).database;
    assertDisposableDatabase(configuration);
    await applyMigrations(configuration, await readMigrations());
    const pool = new Pool({ ...databasePoolOptions(configuration), max: 1 });
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const customerId = randomUUID();
      const otherId = randomUUID();
      const contactId = randomUUID();
      const code = `Fixture-${randomUUID()}`;
      await connection.query(
        "INSERT INTO airmech.customers (id,customer_code,company_name) VALUES ($1,$2,$3),($4,$5,$6)",
        [
          customerId,
          code,
          "Disposable customer",
          otherId,
          randomUUID(),
          "Other disposable customer",
        ],
      );
      await connection.query(
        "INSERT INTO airmech.customer_contacts (id,customer_id,display_name) VALUES ($1,$2,$3)",
        [contactId, customerId, "Disposable contact"],
      );
      await connection.query("UPDATE airmech.customers SET primary_contact_id=$1 WHERE id=$2", [
        contactId,
        customerId,
      ]);
      async function rejectsStatement(sql, values, errorCode) {
        await connection.query("SAVEPOINT expected_failure");
        await assert.rejects(connection.query(sql, values), (error) => {
          assert.ok((Array.isArray(errorCode) ? errorCode : [errorCode]).includes(error.code));
          return true;
        });
        await connection.query("ROLLBACK TO SAVEPOINT expected_failure");
        await connection.query("RELEASE SAVEPOINT expected_failure");
      }
      await rejectsStatement(
        "UPDATE airmech.customers SET primary_contact_id=$1 WHERE id=$2",
        [contactId, otherId],
        "23503",
      );
      await rejectsStatement(
        "INSERT INTO airmech.customers (customer_code,company_name) VALUES ($1,'Duplicate')",
        [code],
        "23505",
      );
      // PostgreSQL 18 distinguishes RESTRICT violations from missing foreign keys.
      await rejectsStatement(
        "DELETE FROM airmech.customers WHERE id=$1",
        [customerId],
        ["23503", "23001"],
      );
      await rejectsStatement(
        "UPDATE airmech.customers SET archived_at=now() WHERE id=$1",
        [customerId],
        "23514",
      );
      await connection.query(
        "UPDATE airmech.customers SET status='inactive', archived_at=now() WHERE id=$1",
        [customerId],
      );
      const result = await connection.query(
        "SELECT customer_code, status, archived_at, primary_contact_id FROM airmech.customers WHERE id=$1",
        [customerId],
      );
      assert.equal(result.rows[0].customer_code, code);
      assert.equal(result.rows[0].status, "inactive");
      assert.ok(result.rows[0].archived_at);
      assert.equal(result.rows[0].primary_contact_id, contactId);
      const security = await connection.query(
        "SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='airmech' AND relname=ANY($1::text[])",
        [["customers", "customer_contacts"]],
      );
      assert.equal(security.rows.length, 2);
      assert.ok(security.rows.every((row) => row.relrowsecurity));
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pool.end();
    }
  },
);
