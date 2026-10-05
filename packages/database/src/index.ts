import { ConfigurationError, type DatabaseConfiguration } from "@airmech/config/server";
import { readFileSync } from "node:fs";
import { Pool, type PoolConfig, type QueryResultRow } from "pg";

export interface DatabaseConnectionSettings {
  readonly connectionString: string;
  readonly maximumConnections: number;
  readonly connectionTimeoutMilliseconds: number;
  readonly idleTimeoutMilliseconds: number;
}

export class DatabaseError extends Error {
  constructor(readonly code: "DATABASE_DISABLED" | "DATABASE_UNAVAILABLE" | "DATABASE_CLOSED") {
    super(`Database operation failed (${code}). Check server configuration and connectivity.`);
    this.name = "DatabaseError";
  }
}

export type DatabaseEvent = Readonly<{ code: "DATABASE_POOL_ERROR" }>;

/** URL SSL parameters must not override strict verification supplied to pg. */
export function databasePoolOptions(configuration: DatabaseConfiguration): PoolConfig {
  if (!configuration.enabled || configuration.url === null)
    throw new DatabaseError("DATABASE_DISABLED");
  const url = new URL(configuration.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  for (const setting of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(setting);
  }
  let ca: string | undefined;
  if (configuration.caFile !== null) {
    try {
      ca = readFileSync(configuration.caFile, "utf8");
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error();
    } catch {
      throw new ConfigurationError("DATABASE_CA_FILE");
    }
  }
  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
    maxLifetimeSeconds: 300,
    application_name: "airmech-one",
    ssl: local ? false : { rejectUnauthorized: true, ...(ca === undefined ? {} : { ca }) },
  };
}

/** One instance per process: pg opens connections on first query, never on construction. */
export class DatabaseClient {
  readonly #pool: Pool;
  #closing: Promise<void> | undefined;

  constructor(
    configuration: DatabaseConfiguration,
    report: (event: DatabaseEvent) => void = () => {},
  ) {
    this.#pool = new Pool(databasePoolOptions(configuration));
    this.#pool.on("error", () => report({ code: "DATABASE_POOL_ERROR" }));
  }

  async query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<Row[]> {
    if (this.#closing) throw new DatabaseError("DATABASE_CLOSED");
    try {
      const result = await this.#pool.query<Row>(text, [...values]);
      return result.rows;
    } catch {
      throw new DatabaseError("DATABASE_UNAVAILABLE");
    }
  }

  async verifyConnection(): Promise<void> {
    const rows = await this.query<{ ok: number }>("SELECT 1::integer AS ok");
    if (rows[0]?.ok !== 1) throw new DatabaseError("DATABASE_UNAVAILABLE");
  }

  close(): Promise<void> {
    this.#closing ??= this.#pool.end();
    return this.#closing;
  }
}

export { applyMigrations, readMigrations, MigrationError } from "./migrations";
