import type { AccessPrincipal } from "@airmech/contracts";
import type { ServerConfiguration } from "@airmech/config/server";
import type { DatabaseClient, DatabaseTransaction } from "@airmech/database";
import { AuthMessageProducer } from "@airmech/queue";
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { CorrelatedRequest } from "../../common/request-id.js";
import { UserRepository } from "../users/user.repository.js";
import {
  SupabaseAuthProvider,
  IdentityProviderError,
  type VerifiedIdentity,
} from "@airmech/identity";
import { cookieToken, RecoveryCipher, newSessionToken, tokenDigest } from "./session-security.js";

export interface AuthenticatedRequest extends CorrelatedRequest {
  principal?: AccessPrincipal;
}

export interface AuthAuditDetails {
  readonly before?: readonly string[];
  readonly after?: readonly string[];
  readonly changedFields?: readonly string[];
  readonly roleCode?: string;
}
export async function writeAuthAudit(
  database: DatabaseTransaction,
  event: string,
  requestId: string | undefined,
  actorId: string | null,
  entityId: string | null = actorId,
  details: AuthAuditDetails = {},
): Promise<void> {
  await database.query(
    "INSERT INTO airmech.audit_events(actor_id,event,entity_type,entity_id,request_id,details) VALUES($1,$2,'user',$3,$4,$5::jsonb)",
    [actorId, event, entityId, requestId ?? randomUUID(), JSON.stringify(details)],
  );
}

class TooManyRequestsException extends HttpException {
  constructor() {
    super("Request rate exceeded", 429);
  }
}

export class AuthService {
  readonly #configuration: ServerConfiguration;
  readonly #database: DatabaseClient | null;
  readonly #messages: AuthMessageProducer;
  readonly #provider: SupabaseAuthProvider | null;
  readonly #cipher: RecoveryCipher | null;
  readonly #secure: boolean;
  readonly sessionCookie: string;
  readonly recoveryCookie: string;

  constructor(configuration: ServerConfiguration, database: DatabaseClient | null) {
    this.#configuration = configuration;
    this.#database = database;
    this.#messages = new AuthMessageProducer(configuration.redis);
    this.#provider = configuration.auth.enabled ? new SupabaseAuthProvider(configuration) : null;
    this.#cipher = configuration.auth.secret ? new RecoveryCipher(configuration.auth.secret) : null;
    this.#secure = configuration.auth.appUrl?.startsWith("https:") === true;
    this.sessionCookie = this.#secure ? "__Host-airmech_session" : "airmech_session";
    this.recoveryCookie = this.#secure ? "__Host-airmech_recovery" : "airmech_recovery";
  }

  get configuration(): ServerConfiguration {
    return this.#configuration;
  }
  private get database(): DatabaseClient | null {
    return this.#database;
  }

  get databaseClient(): DatabaseClient {
    if (!this.configuration.auth.enabled || !this.database || !this.#provider || !this.#cipher)
      throw new ServiceUnavailableException();
    return this.database;
  }
  get provider(): SupabaseAuthProvider {
    if (!this.configuration.auth.enabled || !this.database || !this.#provider)
      throw new ServiceUnavailableException();
    return this.#provider;
  }
  get cipher(): RecoveryCipher {
    if (!this.configuration.auth.enabled || !this.database || !this.#cipher)
      throw new ServiceUnavailableException();
    return this.#cipher;
  }

  cookie(response: ServerResponse, name: string, token: string, seconds: number): void {
    const existing = response.getHeader("Set-Cookie");
    const previous = Array.isArray(existing)
      ? existing.map(String)
      : typeof existing === "string"
        ? [existing]
        : [];
    response.setHeader("Set-Cookie", [
      ...previous,
      `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.#secure ? "; Secure" : ""}`,
    ]);
    response.setHeader("Cache-Control", "no-store");
  }

  async principal(request: AuthenticatedRequest): Promise<AccessPrincipal> {
    const token = cookieToken(request.headers.cookie, this.sessionCookie);
    if (!token) throw new UnauthorizedException();
    const principal = await new UserRepository(this.databaseClient).findSessionPrincipal(
      tokenDigest(token),
    );
    if (!principal || principal.user.status !== "active") throw new UnauthorizedException();
    return principal;
  }

  async rateLimit(request: AuthenticatedRequest, action: string, email = ""): Promise<void> {
    const database = this.databaseClient;
    const keys = [
      { value: `${action}:network:${request.socket.remoteAddress ?? "unknown"}`, limit: 60 },
      ...(email ? [{ value: `${action}:identity:${email}`, limit: 5 }] : []),
    ];
    for (const key of keys) {
      const rows = await database.query<{ attempts: number }>(
        `INSERT INTO airmech.auth_rate_limits(key_hash,attempts,expires_at) VALUES($1,1,now()+interval '5 minutes')
         ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.expires_at<now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
         expires_at=CASE WHEN auth_rate_limits.expires_at<now() THEN now()+interval '5 minutes' ELSE auth_rate_limits.expires_at END RETURNING attempts`,
        [tokenDigest(key.value)],
      );
      if ((rows[0]?.attempts ?? key.limit + 1) > key.limit) throw new TooManyRequestsException();
    }
  }

  async login(
    email: string,
    password: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<AccessPrincipal> {
    await this.rateLimit(request, "login", email);
    let identity: VerifiedIdentity;
    try {
      identity = await this.provider.signIn(email, password);
    } catch (error: unknown) {
      await writeAuthAudit(this.databaseClient, "LOGIN_FAILED", request.requestId, null);
      if (error instanceof IdentityProviderError && error.code === "RATE_LIMITED")
        throw new TooManyRequestsException();
      if (error instanceof IdentityProviderError && error.code === "INVALID_CREDENTIALS")
        throw new UnauthorizedException();
      throw new ServiceUnavailableException();
    }
    const token = newSessionToken();
    const seconds = this.configuration.auth.sessionSeconds ?? 28_800;
    const principal = await this.databaseClient.transaction(async (transaction) => {
      await transaction.query("SELECT id FROM airmech.users WHERE identity_id=$1 FOR UPDATE", [
        identity.identityId,
      ]);
      const current = await new UserRepository(transaction).findPrincipal(identity.identityId);
      if (
        !current ||
        current.user.status !== "active" ||
        current.user.email.toLowerCase() !== identity.email.toLowerCase()
      ) {
        return null;
      }
      await transaction.query(
        "INSERT INTO airmech.auth_sessions(token_hash,user_id,kind,expires_at) VALUES($1,$2,'login',now()+$3*interval '1 second')",
        [tokenDigest(token), current.user.id, seconds],
      );
      await transaction.query(
        "UPDATE airmech.users SET last_login_at=now(),updated_at=now() WHERE id=$1",
        [current.user.id],
      );
      await writeAuthAudit(transaction, "LOGIN_SUCCESS", request.requestId, current.user.id);
      return current;
    });
    if (!principal) {
      await writeAuthAudit(this.databaseClient, "LOGIN_FAILED", request.requestId, null);
      throw new UnauthorizedException();
    }
    // No provider token/password enters this cookie, database session or response.
    this.cookie(response, this.sessionCookie, token, seconds);
    return principal;
  }

  async logout(request: AuthenticatedRequest, response: ServerResponse): Promise<void> {
    const token = cookieToken(request.headers.cookie, this.sessionCookie);
    if (token)
      await this.databaseClient.transaction(async (transaction) => {
        const removed = await transaction.query<{ user_id: string }>(
          "DELETE FROM airmech.auth_sessions WHERE token_hash=$1 RETURNING user_id",
          [tokenDigest(token)],
        );
        if (removed[0])
          await writeAuthAudit(transaction, "LOGOUT", request.requestId, removed[0].user_id);
      });
    this.cookie(response, this.sessionCookie, "", 0);
    this.cookie(response, this.recoveryCookie, "", 0);
  }

  async requestReset(
    email: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    await this.rateLimit(request, "recovery", email);
    const state = newSessionToken();
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const messageId = await this.databaseClient.transaction(async (transaction) => {
      await transaction.query(
        "INSERT INTO airmech.auth_recovery_requests(state_hash,verifier_ciphertext,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [tokenDigest(state), this.cipher.seal(verifier)],
      );
      const rows = await transaction.query<{ id: string }>(
        "INSERT INTO airmech.auth_messages(kind,payload_ciphertext,recovery_state_hash,request_id,expires_at) VALUES('recovery',$1,$2,$3,now()+interval '10 minutes') RETURNING id",
        [
          this.cipher.seal(JSON.stringify({ email, challenge })),
          tokenDigest(state),
          request.requestId ?? randomUUID(),
        ],
      );
      await writeAuthAudit(transaction, "PASSWORD_RESET_REQUESTED", request.requestId, null);
      if (!rows[0]) throw new ServiceUnavailableException();
      return rows[0].id;
    });
    await this.enqueueMessage(messageId);
    this.cookie(response, this.recoveryCookie, state, 600);
  }

  async completeRecovery(
    code: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    await this.rateLimit(request, "callback");
    const state = cookieToken(request.headers.cookie, this.recoveryCookie);
    if (!state) throw new BadRequestException();
    const rows = await this.databaseClient.query<{ verifier_ciphertext: string }>(
      "DELETE FROM airmech.auth_recovery_requests WHERE state_hash=$1 AND expires_at>now() RETURNING verifier_ciphertext",
      [tokenDigest(state)],
    );
    this.cookie(response, this.recoveryCookie, "", 0);
    if (!rows[0]) throw new BadRequestException();
    let identity: VerifiedIdentity;
    try {
      identity = await this.provider.exchangeRecovery(
        code,
        this.cipher.open(rows[0].verifier_ciphertext),
      );
    } catch {
      throw new BadRequestException();
    }
    await this.#recoverySession(identity, "recovery", request, response);
  }

  async completeInvitation(
    tokenHash: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    await this.rateLimit(request, "callback");
    let identity: VerifiedIdentity;
    try {
      identity = await this.provider.verifyInvitation(tokenHash);
    } catch {
      throw new BadRequestException();
    }
    await this.#recoverySession(identity, "invite", request, response);
  }

  async completeInvitationSession(
    accessToken: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    await this.rateLimit(request, "callback");
    let identity: VerifiedIdentity;
    try {
      identity = await this.provider.verifyInvitationSession(accessToken);
    } catch {
      throw new BadRequestException();
    }
    await this.#recoverySession(identity, "invite", request, response);
  }

  async #recoverySession(
    identity: VerifiedIdentity,
    kind: "recovery" | "invite",
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    const token = newSessionToken();
    await this.databaseClient.transaction(async (transaction) => {
      await transaction.query("SELECT id FROM airmech.users WHERE identity_id=$1 FOR UPDATE", [
        identity.identityId,
      ]);
      const principal = await new UserRepository(transaction).findPrincipal(identity.identityId);
      const sessionKind =
        kind === "recovery" && principal?.user.status === "invited" ? "invite" : kind;
      if (
        !principal ||
        principal.user.email.toLowerCase() !== identity.email.toLowerCase() ||
        principal.user.status !== (sessionKind === "invite" ? "invited" : "active")
      )
        throw new BadRequestException();
      await transaction.query(
        "INSERT INTO airmech.auth_sessions(token_hash,user_id,kind,provider_access_ciphertext,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
        [
          tokenDigest(token),
          principal.user.id,
          sessionKind,
          this.cipher.seal(identity.accessToken),
        ],
      );
      await writeAuthAudit(transaction, "RECOVERY_VERIFIED", request.requestId, principal.user.id);
    });
    this.cookie(response, this.sessionCookie, token, 600);
  }

  async setPassword(
    password: string,
    request: AuthenticatedRequest,
    response: ServerResponse,
  ): Promise<void> {
    await this.rateLimit(request, "password-update");
    const token = cookieToken(request.headers.cookie, this.sessionCookie);
    if (!token) throw new BadRequestException();
    // Consume and revoke before provider I/O. A failure cannot leave old application sessions usable.
    const session = await this.databaseClient.transaction(async (transaction) => {
      await transaction.query(
        "SELECT u.id FROM airmech.users u JOIN airmech.auth_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 FOR UPDATE OF u",
        [tokenDigest(token)],
      );
      const rows = await transaction.query<{
        user_id: string;
        kind: "recovery" | "invite";
        provider_access_ciphertext: string;
      }>(
        `DELETE FROM airmech.auth_sessions s USING airmech.users u WHERE s.token_hash=$1 AND s.user_id=u.id
         AND ((s.kind='invite' AND u.status='invited') OR (s.kind='recovery' AND u.status='active'))
         AND s.kind IN ('recovery','invite') AND s.expires_at>now() RETURNING s.user_id,s.kind,s.provider_access_ciphertext`,
        [tokenDigest(token)],
      );
      const row = rows[0];
      if (!row) throw new BadRequestException();
      await transaction.query("DELETE FROM airmech.auth_sessions WHERE user_id=$1", [row.user_id]);
      await transaction.query(
        "UPDATE airmech.users SET auth_locked_until=now()+interval '10 minutes' WHERE id=$1",
        [row.user_id],
      );
      await writeAuthAudit(transaction, "PASSWORD_RESET_STARTED", request.requestId, row.user_id);
      return row;
    });
    this.cookie(response, this.sessionCookie, "", 0);
    try {
      await this.provider.updatePassword(
        this.cipher.open(session.provider_access_ciphertext),
        password,
      );
    } catch {
      await this.databaseClient.transaction(async (transaction) => {
        await transaction.query("DELETE FROM airmech.auth_sessions WHERE user_id=$1", [
          session.user_id,
        ]);
        await transaction.query("UPDATE airmech.users SET auth_locked_until=NULL WHERE id=$1", [
          session.user_id,
        ]);
        await writeAuthAudit(
          transaction,
          "PASSWORD_RESET_FAILED",
          request.requestId,
          session.user_id,
        );
      });
      throw new ServiceUnavailableException();
    }
    const accepted = await this.databaseClient.transaction(async (transaction) => {
      const current = await transaction.query<{ status: string }>(
        "SELECT status FROM airmech.users WHERE id=$1 FOR UPDATE",
        [session.user_id],
      );
      await transaction.query("DELETE FROM airmech.auth_sessions WHERE user_id=$1", [
        session.user_id,
      ]);
      await transaction.query("UPDATE airmech.users SET auth_locked_until=NULL WHERE id=$1", [
        session.user_id,
      ]);
      if (current[0]?.status !== (session.kind === "invite" ? "invited" : "active")) {
        await writeAuthAudit(
          transaction,
          "PASSWORD_RESET_FAILED",
          request.requestId,
          session.user_id,
        );
        return false;
      }
      if (session.kind === "invite")
        await transaction.query(
          "UPDATE airmech.users SET status='active',updated_at=now() WHERE id=$1 AND status='invited'",
          [session.user_id],
        );
      if (session.kind === "invite")
        await writeAuthAudit(
          transaction,
          "USER_INVITATION_ACCEPTED",
          request.requestId,
          session.user_id,
        );
      await writeAuthAudit(
        transaction,
        "PASSWORD_RESET_COMPLETED",
        request.requestId,
        session.user_id,
      );
      return true;
    });
    if (!accepted) throw new BadRequestException();
  }

  async createInvitationMessage(
    transaction: DatabaseTransaction,
    userId: string,
    email: string,
    name: string,
    actorId: string | null,
    requestId: string | undefined,
  ): Promise<string> {
    const rows = await transaction.query<{ id: string }>(
      "INSERT INTO airmech.auth_messages(kind,payload_ciphertext,user_id,actor_id,request_id,expires_at) VALUES('invite',$1,$2,$3,$4,now()+interval '10 minutes') RETURNING id",
      [
        this.cipher.seal(JSON.stringify({ email, name })),
        userId,
        actorId,
        requestId ?? randomUUID(),
      ],
    );
    if (!rows[0]) throw new ServiceUnavailableException();
    await writeAuthAudit(transaction, "USER_INVITE_QUEUED", requestId, actorId, userId);
    return rows[0].id;
  }

  async enqueueMessage(recordId: string): Promise<void> {
    try {
      await this.#messages.enqueue(recordId);
    } catch {
      await this.databaseClient.transaction(async (transaction) => {
        const rows = await transaction.query<{
          actor_id: string | null;
          user_id: string | null;
          request_id: string;
        }>(
          "UPDATE airmech.auth_messages SET state='failed' WHERE id=$1 AND state='pending' RETURNING actor_id,user_id,request_id",
          [recordId],
        );
        if (rows[0])
          await writeAuthAudit(
            transaction,
            "AUTH_MESSAGE_QUEUE_FAILED",
            rows[0].request_id,
            rows[0].actor_id,
            rows[0].user_id,
          );
      });
      throw new ServiceUnavailableException();
    }
  }

  onApplicationShutdown(): Promise<void> {
    return this.#messages.close();
  }

  async recoveryReady(request: AuthenticatedRequest): Promise<{ ready: true }> {
    const token = cookieToken(request.headers.cookie, this.sessionCookie);
    if (!token) throw new BadRequestException();
    const rows = await this.databaseClient.query(
      `SELECT 1 FROM airmech.auth_sessions s JOIN airmech.users u ON u.id=s.user_id WHERE s.token_hash=$1
       AND ((s.kind='invite' AND u.status='invited') OR (s.kind='recovery' AND u.status='active')) AND s.expires_at>now()`,
      [tokenDigest(token)],
    );
    if (!rows[0]) throw new BadRequestException();
    return { ready: true };
  }
}
