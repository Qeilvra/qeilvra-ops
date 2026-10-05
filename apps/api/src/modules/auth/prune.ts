import { loadEnvironment, readServerConfiguration } from "@airmech/config/server";
import { DatabaseClient } from "@airmech/database";

async function prune(): Promise<void> {
  const configuration = readServerConfiguration("api", loadEnvironment());
  const database = new DatabaseClient(configuration.database);
  try {
    // Bounded expired operational records only; user profiles and audit are untouched.
    for (const table of [
      "auth_messages",
      "auth_sessions",
      "auth_recovery_requests",
      "auth_rate_limits",
    ]) {
      await database.query(
        `DELETE FROM airmech.${table} WHERE ctid IN (SELECT ctid FROM airmech.${table} WHERE expires_at<now() LIMIT 1000)`,
      );
    }
    process.stdout.write("Expired authentication records pruned within the batch limit.\n");
  } finally {
    await database.close();
  }
}
prune().catch(() => {
  process.stderr.write("Authentication cleanup failed. Check server connectivity.\n");
  process.exitCode = 1;
});
