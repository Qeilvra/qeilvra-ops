const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { readServerConfiguration, ConfigurationError } = require("@airmech/config/server");
const {
  DatabaseClient,
  DatabaseError,
  databasePoolOptions,
  readMigrations,
  applyMigrations,
} = require("@airmech/database");

function config(url, extra = {}) {
  return readServerConfiguration("api", { DATABASE_ENABLED: "true", DATABASE_URL: url, ...extra })
    .database;
}

test("database configuration integrates server validation and cannot enable missing credentials", () => {
  assert.throws(
    () => readServerConfiguration("api", { DATABASE_ENABLED: "true" }),
    ConfigurationError,
  );
  assert.throws(
    () => new DatabaseClient(readServerConfiguration("api", {}).database),
    DatabaseError,
  );
  assert.throws(
    () => readServerConfiguration("api", { DATABASE_MIGRATION_URL: "https://example.invalid" }),
    ConfigurationError,
  );
  const database = config("postgresql://localhost/fixture");
  assert.ok(Object.isFrozen(database));
  assert.equal(database.migrationUrl, null);
});

test("database pool is bounded and remote TLS cannot be weakened by URI flags", () => {
  const remote = databasePoolOptions(
    config("postgresql://fixture.invalid/db?ssl=false&sslmode=no-verify&sslrootcert=private"),
  );
  assert.equal(remote.ssl.rejectUnauthorized, true);
  assert.equal(new URL(remote.connectionString).search, "");
  assert.equal(remote.max, 5);
  assert.ok(remote.connectionTimeoutMillis > 0 && remote.query_timeout > 0);
  assert.equal(databasePoolOptions(config("postgresql://127.0.0.1/db")).ssl, false);
  assert.throws(
    () =>
      databasePoolOptions(
        config("postgresql://fixture.invalid/db", { DATABASE_CA_FILE: "missing-private-ca-file" }),
      ),
    (error) => error.setting === "DATABASE_CA_FILE" && !error.message.includes("missing-private"),
  );
});

test("pool construction is lazy, shutdown idempotent, and failure details are redacted", async () => {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const database = new DatabaseClient(
    config(`postgresql://sentinel_user:sentinel_password@127.0.0.1:${port}/db`),
  );
  assert.equal(JSON.stringify(database), "{}");
  try {
    await assert.rejects(database.verifyConnection(), (error) => {
      assert.equal(error.code, "DATABASE_UNAVAILABLE");
      assert.ok(!JSON.stringify(error).includes("sentinel"));
      assert.equal("cause" in error, false);
      return true;
    });
  } finally {
    const closing = database.close();
    assert.equal(database.close(), closing);
    await closing;
  }
  await assert.rejects(database.verifyConnection(), { code: "DATABASE_CLOSED" });
});

test("versioned migrations have immutable checksums and prohibit transaction-pooler migration sessions", async () => {
  const migrations = await readMigrations();
  assert.equal(migrations[0].name, "0001_infrastructure.sql");
  assert.match(migrations[0].checksum, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readMigrations(), migrations);
  assert.ok(!/CREATE TABLE\s+(users|customers|complaints)/i.test(migrations[0].sql));
  await assert.rejects(
    applyMigrations(config("postgresql://fixture.pooler.supabase.com:6543/db"), migrations),
    { code: "MIGRATION_CONFIGURATION" },
  );
});
