const assert = require("node:assert/strict");
const test = require("node:test");
const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { DatabaseClient, applyMigrations, readMigrations } = require("@airmech/database");
const { assertDisposableDatabase } = require("../helpers/disposable-database.cjs");

const configuration = readServerConfiguration("api", loadEnvironment()).database;

test(
  "live PostgreSQL executes safe parameterized queries and reuses its pool",
  {
    skip: !configuration.enabled
      ? "DATABASE_ENABLED is false; live connection not verified"
      : false,
  },
  async () => {
    const database = new DatabaseClient(configuration);
    try {
      await database.verifyConnection();
      const rows = await database.query("SELECT $1::integer AS value", [42]);
      assert.equal(rows[0].value, 42);
      const first = await database.query("SELECT pg_backend_pid() AS pid");
      const second = await database.query("SELECT pg_backend_pid() AS pid");
      // Supavisor may change backend sessions; the application pool still reuses client connections.
      if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(configuration.url).hostname)) {
        assert.equal(first[0].pid, second[0].pid);
      } else {
        const tls = await database.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
        assert.equal(tls[0]?.ssl, true, "Remote PostgreSQL must use verified TLS.");
      }
    } finally {
      await database.close();
    }
  },
);

test(
  "disposable PostgreSQL migrates atomically, rejects history changes, and rolls back failures",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Disposable-database mutation checks require explicit opt-in"
        : false,
  },
  async () => {
    assertDisposableDatabase(configuration);
    const migrations = await readMigrations();
    await applyMigrations(configuration, migrations);
    assert.equal(await applyMigrations(configuration, migrations), 0);
    await assert.rejects(
      applyMigrations(configuration, [{ ...migrations[0], checksum: "changed" }]),
      { code: "MIGRATION_HISTORY" },
    );
    const failing = [
      ...migrations,
      {
        name: "9999_test_rollback.sql",
        checksum: "test-only",
        sql: "CREATE TABLE airmech_infrastructure.rollback_probe (id integer); SELECT missing_test_function();",
      },
    ];
    await assert.rejects(applyMigrations(configuration, failing), { code: "MIGRATION_FAILED" });
    const database = new DatabaseClient(configuration);
    try {
      const rows = await database.query(
        "SELECT to_regclass('airmech_infrastructure.rollback_probe') AS table_name",
      );
      assert.equal(rows[0].table_name, null);
      const ledger = await database.query(
        "SELECT count(*)::integer AS count FROM airmech_infrastructure.schema_migrations",
      );
      assert.equal(ledger[0].count, migrations.length);
    } finally {
      await database.close();
    }
  },
);

test(
  "restricted deletion returns a safe database conflict on supported PostgreSQL versions",
  {
    skip:
      process.env.INFRASTRUCTURE_TEST_DATABASE_MUTATIONS !== "true"
        ? "Conflict regression requires an opted-in disposable database"
        : false,
  },
  async () => {
    assertDisposableDatabase(configuration);
    const database = new DatabaseClient(configuration);
    try {
      await assert.rejects(
        database.transaction(async (transaction) => {
          await transaction.query(
            "CREATE TEMP TABLE audit_conflict_parent(id integer PRIMARY KEY)",
          );
          await transaction.query(
            "CREATE TEMP TABLE audit_conflict_child(parent_id integer REFERENCES audit_conflict_parent(id) ON DELETE RESTRICT)",
          );
          await transaction.query("INSERT INTO audit_conflict_parent VALUES(1)");
          await transaction.query("INSERT INTO audit_conflict_child VALUES(1)");
          await transaction.query("DELETE FROM audit_conflict_parent WHERE id=1");
        }),
        (error) => {
          assert.equal(error.code, "DATABASE_CONFLICT");
          assert.equal("cause" in error, false);
          assert.equal(error.message.includes("audit_conflict_parent"), false);
          return true;
        },
      );
    } finally {
      await database.close();
    }
  },
);
