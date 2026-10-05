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
  constructor(
    readonly code:
      | "DATABASE_DISABLED"
      | "DATABASE_UNAVAILABLE"
      | "DATABASE_CLOSED"
      | "DATABASE_CONFLICT"
      | "DATABASE_INVALID_REQUEST",
  ) {
    super(`Database operation failed (${code}). Check server configuration and connectivity.`);
    this.name = "DatabaseError";
  }
}

function databaseFailure(error: unknown): DatabaseError {
  const state = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (state === "23505" || state === "23503") return new DatabaseError("DATABASE_CONFLICT");
  if (state === "23514" || state === "22P02") return new DatabaseError("DATABASE_INVALID_REQUEST");
  return new DatabaseError("DATABASE_UNAVAILABLE");
}

export type DatabaseEvent = Readonly<{ code: "DATABASE_POOL_ERROR" }>;

export interface DatabaseTransaction {
  query<Row extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<Row[]>;
}

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
    } catch (error: unknown) {
      throw databaseFailure(error);
    }
  }

  async verifyConnection(): Promise<void> {
    const rows = await this.query<{ ok: number }>("SELECT 1::integer AS ok");
    if (rows[0]?.ok !== 1) throw new DatabaseError("DATABASE_UNAVAILABLE");
  }

  /** Short application transactions share the existing pool; callers do no external I/O. */
  async transaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (this.#closing) throw new DatabaseError("DATABASE_CLOSED");
    const connection = await this.#pool.connect().catch(() => {
      throw new DatabaseError("DATABASE_UNAVAILABLE");
    });
    const transaction: DatabaseTransaction = {
      async query<Row extends QueryResultRow>(text: string, values: readonly unknown[] = []) {
        try {
          return (await connection.query<Row>(text, [...values])).rows;
        } catch (error: unknown) {
          throw databaseFailure(error);
        }
      },
    };
    try {
      await transaction.query("BEGIN");
      const result = await operation(transaction);
      await transaction.query("COMMIT");
      return result;
    } catch (error: unknown) {
      await transaction.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }

  close(): Promise<void> {
    this.#closing ??= this.#pool.end();
    return this.#closing;
  }
}

export { applyMigrations, readMigrations, MigrationError } from "./migrations";
