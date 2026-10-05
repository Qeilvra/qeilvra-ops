const { loadEnvironment, readServerConfiguration } = require("@airmech/config/server");
const { DatabaseClient, applyMigrations, readMigrations } = require("@airmech/database");

async function main() {
  const command = process.argv[2];
  const configuration = readServerConfiguration("api", loadEnvironment());
  if (command === "migrate") {
    const count = await applyMigrations(configuration.database, await readMigrations());
    process.stdout.write(`Database migrations applied: ${count}.\n`);
    return;
  }
  if (!["verify", "seed"].includes(command)) throw new Error("INVALID_DATABASE_COMMAND");
  if (command === "seed" && configuration.runtime.environment !== "development") {
    throw new Error("DEVELOPMENT_SEED_ONLY");
  }
  const database = new DatabaseClient(configuration.database);
  try {
    await database.verifyConnection();
    process.stdout.write(
      command === "seed"
        ? "Development seed verified: no domain records required.\n"
        : "Database connection verified.\n",
    );
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write(
    "Database command failed. Check configuration, connectivity and migration history. No reset was performed.\n",
  );
  process.exitCode = 1;
});
