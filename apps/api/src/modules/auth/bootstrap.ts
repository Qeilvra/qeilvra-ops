import { loadEnvironment, readServerConfiguration } from "@airmech/config/server";
import { DatabaseClient } from "@airmech/database";
import { AuthService, writeAuthAudit } from "./auth.service.js";
import { randomUUID } from "node:crypto";

/** Explicit one-time provisioning; never imported by application startup. */
async function bootstrap(): Promise<void> {
  if (!process.argv.includes("--apply")) throw new Error("Explicit --apply is required");
  const configuration = readServerConfiguration("api", loadEnvironment());
  const { bootstrapEmail: email, bootstrapName: name } = configuration.auth;
  if (!email || !name || !configuration.auth.enabled)
    throw new Error("Bootstrap configuration is missing");
  const database = new DatabaseClient(configuration.database);
  try {
    const existing = await database.query(
      "SELECT user_id FROM airmech.user_roles WHERE role_code='super_admin' LIMIT 1",
    );
    if (existing.length) throw new Error("Bootstrap is already provisioned");
    const auth = new AuthService(configuration, database);
    const identity = await auth.provider.invite(
      email,
      name,
      `${configuration.auth.appUrl}/auth/callback`,
    );
    await database.transaction(async (transaction) => {
      await transaction.query("SELECT pg_advisory_xact_lock(130010)");
      if (
        (
          await transaction.query(
            "SELECT user_id FROM airmech.user_roles WHERE role_code='super_admin' LIMIT 1",
          )
        ).length
      )
        throw new Error("Bootstrap is already provisioned");
      const rows = await transaction.query<{ id: string }>(
        "INSERT INTO airmech.users(identity_id,email,display_name,status) VALUES($1,$2,$3,'invited') RETURNING id",
        [identity.identityId, email, name],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error("Bootstrap insert failed");
      await transaction.query("INSERT INTO airmech.user_roles VALUES($1,'super_admin')", [id]);
      await writeAuthAudit(transaction, "BOOTSTRAP_ADMIN_INVITED", randomUUID(), null, id, {
        after: ["super_admin"],
      });
    });
    process.stdout.write(
      "Bootstrap invitation prepared. Complete verified invitation/password setup to activate the administrator.\n",
    );
  } finally {
    await database.close();
  }
}

bootstrap().catch(() => {
  process.stderr.write(
    "Bootstrap was not completed. Check ignored configuration, provider email setup and existing administrator state; no credentials were logged.\n",
  );
  process.exitCode = 1;
});
