import type { ServerConfiguration } from "@airmech/config/server";
import type { DatabaseClient } from "@airmech/database";
import { RecoveryCipher, SupabaseAuthProvider } from "@airmech/identity";
import type { AuthMessageProcessor } from "@airmech/queue";
import { randomUUID } from "node:crypto";

interface MessageRow {
  id: string;
  kind: "recovery" | "invite";
  payload_ciphertext: string;
  user_id: string | null;
  actor_id: string | null;
  request_id: string;
  identity_id: string | null;
  status: string | null;
}

/** One shared database pool; provider work never happens within a transaction. */
export function createAuthMessageProcessor(
  configuration: ServerConfiguration,
  database: DatabaseClient,
): AuthMessageProcessor {
  if (!configuration.auth.secret || !configuration.auth.appUrl)
    throw new Error("Auth message configuration is missing.");
  const cipher = new RecoveryCipher(configuration.auth.secret);
  const provider = new SupabaseAuthProvider(configuration);
  const callback = `${new URL(configuration.auth.appUrl).origin}/auth/callback`;
  return async (data, attempt = 0) => {
    const leaseId = randomUUID();
    await database.query(
      "UPDATE airmech.auth_messages SET state='expired' WHERE id=$1 AND state='pending' AND expires_at<=now()",
      [data.recordId],
    );
    const rows = await database.query<MessageRow>(
      `UPDATE airmech.auth_messages m SET lease_id=$2,lease_until=now()+interval '30 seconds'
      WHERE m.id=$1 AND m.state='pending' AND m.expires_at>now() AND (m.lease_until IS NULL OR m.lease_until<now())
      RETURNING m.*,(SELECT u.identity_id FROM airmech.users u WHERE u.id=m.user_id) AS identity_id,
      (SELECT u.status FROM airmech.users u WHERE u.id=m.user_id) AS status`,
      [data.recordId, leaseId],
    );
    const message = rows[0];
    if (!message) {
      const pending = await database.query(
        "SELECT id FROM airmech.auth_messages WHERE id=$1 AND state='pending' AND expires_at>now()",
        [data.recordId],
      );
      if (pending[0]) throw new Error("Auth message delivery is already leased.");
      return { status: "skipped" };
    }
    try {
      if (message.kind === "invite" && message.status !== "invited") {
        await database.query(
          "UPDATE airmech.auth_messages SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2",
          [message.id, leaseId],
        );
        return { status: "skipped" };
      }
      const decoded: unknown = JSON.parse(cipher.open(message.payload_ciphertext));
      if (
        typeof decoded !== "object" ||
        decoded === null ||
        !("email" in decoded) ||
        typeof decoded.email !== "string" ||
        decoded.email.length > 320
      )
        throw new Error("Auth message payload is invalid.");
      if (message.kind === "recovery") {
        if (
          !("challenge" in decoded) ||
          typeof decoded.challenge !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(decoded.challenge)
        )
          throw new Error("Auth recovery challenge is invalid.");
        await provider.requestRecovery(decoded.email, decoded.challenge, callback);
      } else {
        if (!("name" in decoded) || typeof decoded.name !== "string" || decoded.name.length > 120)
          throw new Error("Auth invitation is invalid.");
        const identity = await provider.invite(decoded.email, decoded.name, callback);
        if (identity.identityId !== message.identity_id)
          throw new Error("Auth invitation identity does not match.");
      }
      await database.transaction(async (transaction) => {
        const marked = await transaction.query(
          "UPDATE airmech.auth_messages SET state='sent',lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 RETURNING id",
          [message.id, leaseId],
        );
        if (marked[0])
          await transaction.query(
            "INSERT INTO airmech.audit_events(actor_id,event,entity_type,entity_id,request_id,details) VALUES($1,'AUTH_MESSAGE_SENT','user',$2,$3,$4::jsonb)",
            [
              message.actor_id,
              message.user_id,
              message.request_id,
              JSON.stringify({ messageId: message.id }),
            ],
          );
      });
      return { status: "sent" };
    } catch {
      await database.transaction(async (transaction) => {
        await transaction.query(
          "UPDATE airmech.auth_messages SET lease_id=NULL,lease_until=NULL,state=$3 WHERE id=$1 AND lease_id=$2",
          [message.id, leaseId, attempt >= 2 ? "failed" : "pending"],
        );
        await transaction.query(
          "INSERT INTO airmech.audit_events(actor_id,event,entity_type,entity_id,request_id,details) VALUES($1,$2,'user',$3,$4,$5::jsonb)",
          [
            message.actor_id,
            attempt >= 2 ? "AUTH_MESSAGE_FAILED" : "AUTH_MESSAGE_ATTEMPT_FAILED",
            message.user_id,
            message.request_id,
            JSON.stringify({ messageId: message.id, attempt: attempt + 1 }),
          ],
        );
      });
      throw new Error("Authentication message delivery failed.");
    }
  };
}
