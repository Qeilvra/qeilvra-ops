import type { DatabaseConfiguration } from "@airmech/config/server";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

import { databasePoolOptions } from "./index";

export class MigrationError extends Error {
  constructor(readonly code: "MIGRATION_CONFIGURATION" | "MIGRATION_HISTORY" | "MIGRATION_FAILED") {
    super(`Database migration failed (${code}). Review configuration and migration history.`);
    this.name = "MigrationError";
  }
}

export interface Migration {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export async function readMigrations(
  directory = path.resolve(__dirname, "../migrations"),
): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (names.length === 0) throw new MigrationError("MIGRATION_HISTORY");
  return await Promise.all(
    names.map(async (name) => {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) throw new MigrationError("MIGRATION_HISTORY");
      const sql = await readFile(path.join(directory, name), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    }),
  );
}

/** Explicit deployment command only; DDL and its ledger are atomic, with no reset/down command. */
export async function applyMigrations(
  configuration: DatabaseConfiguration,
  migrations: readonly Migration[],
): Promise<number> {
  if (!configuration.enabled || configuration.url === null)
    throw new MigrationError("MIGRATION_CONFIGURATION");
  const migrationUrl = configuration.migrationUrl ?? configuration.url;
  const endpoint = new URL(migrationUrl);
  if (endpoint.hostname.endsWith(".pooler.supabase.com") && endpoint.port === "6543") {
    throw new MigrationError("MIGRATION_CONFIGURATION");
  }
  const pool = new Pool({
    ...databasePoolOptions({ ...configuration, url: migrationUrl }),
    max: 1,
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });
  let poolError = false;
  pool.on("error", () => {
    poolError = true;
  });
  let client: PoolClient | undefined;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT pg_advisory_xact_lock(741901, 5)");
    await client.query("CREATE SCHEMA IF NOT EXISTS airmech_infrastructure");
    await client.query("REVOKE ALL ON SCHEMA airmech_infrastructure FROM PUBLIC");
    await client.query(`CREATE TABLE IF NOT EXISTS airmech_infrastructure.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const history = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM airmech_infrastructure.schema_migrations ORDER BY name",
    );
    for (const [position, row] of history.rows.entries()) {
      if (
        migrations[position]?.name !== row.name ||
        migrations[position]?.checksum !== row.checksum
      ) {
        throw new MigrationError("MIGRATION_HISTORY");
      }
    }
    let applied = 0;
    for (const migration of migrations.slice(history.rows.length)) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO airmech_infrastructure.schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      applied++;
    }
    if (poolError) throw new MigrationError("MIGRATION_FAILED");
    await client.query("COMMIT");
    committed = true;
    return applied;
  } catch (error: unknown) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("MIGRATION_FAILED");
  } finally {
    if (client) client.release(!committed);
    await pool.end();
  }
}
