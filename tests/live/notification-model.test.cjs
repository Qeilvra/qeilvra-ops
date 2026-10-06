const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const test = require("node:test");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { applyMigrations, readMigrations, databasePoolOptions } = require("@airmech/database");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");
const { Pool } = createRequire(require.resolve("@airmech/database"))("pg");

test(
  "disposable notification model enforces recipient ownership, channels, deduplication and read state",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Notification mutations require an explicitly opted-in disposable database"
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
      const userId = randomUUID();
      await connection.query(
        "INSERT INTO airmech.users (id,identity_id,email,display_name) VALUES ($1,$2,$3,'Disposable recipient')",
        [userId, randomUUID(), `${randomUUID()}@example.invalid`],
      );
      const id = randomUUID();
      const key = createHash("sha256").update(randomUUID()).digest("hex");
      await connection.query(
        "INSERT INTO airmech.notifications (id,recipient_id,channel,title,message,deduplication_key) VALUES ($1,$2,'in_app','Model fixture','No actual notification is sent',$3)",
        [id, userId, key],
      );
      async function rejectsStatement(sql, values, code) {
        await connection.query("SAVEPOINT expected_failure");
        await assert.rejects(connection.query(sql, values), (error) => {
          assert.ok((Array.isArray(code) ? code : [code]).includes(error.code));
          return true;
        });
        await connection.query("ROLLBACK TO SAVEPOINT expected_failure");
        await connection.query("RELEASE SAVEPOINT expected_failure");
      }
      await rejectsStatement(
        "INSERT INTO airmech.notifications (recipient_id,channel,title,message,deduplication_key) VALUES ($1,'in_app','Duplicate','Fixture',$2)",
        [userId, key],
        "23505",
      );
      await rejectsStatement(
        "INSERT INTO airmech.notifications (recipient_id,channel,title,message) VALUES ($1,'in_app','Missing recipient','Fixture')",
        [randomUUID()],
        "23503",
      );
      await rejectsStatement(
        "INSERT INTO airmech.notifications (recipient_id,channel,title,message) VALUES ($1,'whatsapp','Phase 2','Fixture')",
        [userId],
        "23514",
      );
      await rejectsStatement(
        "UPDATE airmech.notifications SET entity_type='customer' WHERE id=$1",
        [id],
        "23514",
      );
      await connection.query(
        "UPDATE airmech.notifications SET read_at=clock_timestamp() WHERE id=$1 AND recipient_id=$2",
        [id, userId],
      );
      const read = await connection.query("SELECT read_at FROM airmech.notifications WHERE id=$1", [
        id,
      ]);
      assert.ok(read.rows[0].read_at);
      await connection.query(
        "INSERT INTO airmech.notifications (recipient_id,channel,title,message,deduplication_key) VALUES ($1,'email','Email model fixture','No email is sent',$2)",
        [userId, key],
      );
      // PostgreSQL 18 distinguishes RESTRICT violations from missing foreign keys.
      await rejectsStatement("DELETE FROM airmech.users WHERE id=$1", [userId], ["23503", "23001"]);
      const security = await connection.query(
        "SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='airmech' AND relname='notifications'",
      );
      assert.equal(security.rows[0].relrowsecurity, true);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pool.end();
    }
  },
);
