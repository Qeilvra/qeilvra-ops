import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import type { DatabaseTransaction } from "@airmech/database";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  writeAuthAudit,
  type AuthService,
  type AuthenticatedRequest,
} from "../auth/auth.service.js";
import { UserRepository } from "./user.repository.js";
import {
  ADMIN_REQUIRED_PERMISSIONS,
  ROLE_PERMISSION_BASELINE,
} from "../auth/permission-baseline.js";
import { inputEmail, inputText, requireFields } from "../auth/session-security.js";

export const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUserId(value: string): string {
  if (!ID_PATTERN.test(value)) throw new BadRequestException();
  return value;
}

function stringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every((item) => typeof item === "string") ||
    new Set(value).size !== value.length
  )
    throw new BadRequestException();
  return value as string[];
}

export class UserAdministrationService {
  constructor(private readonly auth: AuthService) {}

  async #actor(
    transaction: DatabaseTransaction,
    actor: AccessPrincipal,
    permission: string,
  ): Promise<AccessPrincipal> {
    // Every security mutation uses the same bounded transaction lock, then rechecks
    // current authority; stale guards or concurrent admin requests cannot escalate.
    await transaction.query("SELECT pg_advisory_xact_lock(130010)");
    const current = await new UserRepository(transaction).findPrincipal(actor.user.identityId);
    if (!current || current.user.status !== "active") throw new UnauthorizedException();
    if (
      !current.roles.includes("super_admin") ||
      !hasPermission(current, permission) ||
      !current.rolePermissions?.super_admin?.includes(permission)
    )
      throw new ForbiddenException();
    return current;
  }

  async #protectLastAdmin(transaction: DatabaseTransaction): Promise<void> {
    const rows = await transaction.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM airmech.users u JOIN airmech.user_roles ur ON ur.user_id=u.id WHERE ur.role_code='super_admin' AND u.status='active'",
    );
    if ((rows[0]?.count ?? 0) < 1) throw new ConflictException();
  }

  async list(page: number, search: string, status = "") {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000 ||
      search.length > 120 ||
      !["", "active", "invited", "disabled"].includes(status)
    )
      throw new BadRequestException();
    const items = await this.auth.databaseClient.query<{
      id: string;
      email: string;
      display_name: string;
      status: string;
      employee_code: string | null;
      job_title: string | null;
      phone: string | null;
      roles: string[];
      total: number;
    }>(
      `SELECT u.id,u.email,u.display_name,u.status,u.employee_code,u.job_title,u.phone,
         ARRAY(SELECT ur.role_code FROM airmech.user_roles ur WHERE ur.user_id=u.id ORDER BY ur.role_code) AS roles,
         count(*) OVER()::integer AS total FROM airmech.users u
       WHERE ($1='' OR lower(u.email) LIKE lower($1)||'%' OR lower(u.display_name) LIKE lower($1)||'%')
         AND ($3='' OR u.status=$3)
       ORDER BY u.created_at DESC,u.id LIMIT 25 OFFSET $2`,
      [
        search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"),
        (page - 1) * 25,
        status,
      ],
    );
    return { items, page, pageSize: 25, total: items[0]?.total ?? 0 };
  }

  async roles() {
    const items = await this.auth.databaseClient.query<{
      code: string;
      name: string;
      permissions: string[];
    }>(
      "SELECT r.code,r.name,ARRAY(SELECT rp.permission_code FROM airmech.role_permissions rp WHERE rp.role_code=r.code ORDER BY rp.permission_code) AS permissions FROM airmech.roles r ORDER BY r.code",
    );
    const permissions = await this.auth.databaseClient.query<{ code: string; description: string }>(
      "SELECT code,description FROM airmech.permissions ORDER BY code",
    );
    return {
      items: items.map((item) => ({
        ...item,
        allowedPermissions: ROLE_PERMISSION_BASELINE[item.code] ?? [],
      })),
      permissions,
    };
  }

  async updateProfile(
    id: string,
    body: unknown,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    requireUserId(id);
    const fields = requireFields(body, ["displayName", "employeeCode", "jobTitle", "phone"]);
    const displayName = inputText(fields, "displayName", 120).trim();
    if (!displayName) throw new BadRequestException();
    const optional = (name: string, max: number) =>
      fields[name] === null || fields[name] === undefined || fields[name] === ""
        ? null
        : inputText(fields, name, max).trim();
    const values = [
      displayName,
      optional("employeeCode", 64),
      optional("jobTitle", 120),
      optional("phone", 40),
    ];
    await this.auth.databaseClient.transaction(async (transaction) => {
      await this.#actor(transaction, actor, "user.update");
      const rows = await transaction.query<{ id: string }>(
        "UPDATE airmech.users SET display_name=$2,employee_code=$3,job_title=$4,phone=$5,updated_at=now() WHERE id=$1 RETURNING id",
        [id, ...values],
      );
      if (!rows[0]) throw new NotFoundException();
      await writeAuthAudit(transaction, "USER_UPDATED", request.requestId, actor.user.id, id, {
        changedFields: Object.keys(fields),
      });
    });
  }

  async status(
    id: string,
    enabled: boolean,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    requireUserId(id);
    await this.auth.databaseClient.transaction(async (transaction) => {
      await this.#actor(transaction, actor, enabled ? "user.update" : "user.disable");
      const changed = await transaction.query<{ id: string }>(
        "UPDATE airmech.users SET status=$2,updated_at=now() WHERE id=$1 RETURNING id",
        [id, enabled ? "active" : "disabled"],
      );
      if (!changed[0]) throw new ConflictException();
      await this.#protectLastAdmin(transaction);
      await transaction.query("DELETE FROM airmech.auth_sessions WHERE user_id=$1", [id]);
      await writeAuthAudit(
        transaction,
        enabled ? "USER_ENABLED" : "USER_DISABLED",
        request.requestId,
        actor.user.id,
        id,
      );
    });
  }

  async assignRoles(
    id: string,
    value: unknown,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    requireUserId(id);
    const roles = stringArray(value);
    if (roles.some((role) => !Object.hasOwn(ROLE_PERMISSION_BASELINE, role)))
      throw new BadRequestException();
    await this.auth.databaseClient.transaction(async (transaction) => {
      const current = await this.#actor(transaction, actor, "admin.users");
      const grants = await transaction.query<{ permission_code: string }>(
        "SELECT DISTINCT permission_code FROM airmech.role_permissions WHERE role_code=ANY($1::text[])",
        [roles],
      );
      if (grants.some((grant) => !current.permissions.includes(grant.permission_code)))
        throw new ForbiddenException();
      const target = await transaction.query<{ id: string }>(
        "SELECT id FROM airmech.users WHERE id=$1",
        [id],
      );
      if (!target[0]) throw new NotFoundException();
      const previous = await transaction.query<{ role_code: string }>(
        "SELECT role_code FROM airmech.user_roles WHERE user_id=$1 ORDER BY role_code",
        [id],
      );
      await transaction.query("DELETE FROM airmech.user_roles WHERE user_id=$1", [id]);
      await transaction.query(
        "INSERT INTO airmech.user_roles(user_id,role_code) SELECT $1,unnest($2::text[])",
        [id, roles],
      );
      await this.#protectLastAdmin(transaction);
      await transaction.query("DELETE FROM airmech.auth_sessions WHERE user_id=$1", [id]);
      await writeAuthAudit(transaction, "USER_ROLE_CHANGED", request.requestId, actor.user.id, id, {
        before: previous.map((row) => row.role_code),
        after: roles,
      });
    });
  }

  async updateRole(
    code: string,
    body: unknown,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    if (!Object.hasOwn(ROLE_PERMISSION_BASELINE, code)) throw new NotFoundException();
    const fields = requireFields(body, ["name", "permissions"]);
    const name = inputText(fields, "name", 120).trim();
    const permissions = stringArray(fields.permissions);
    if (
      !name ||
      permissions.some(
        (permission) => !ROLE_PERMISSION_BASELINE[code]?.some((allowed) => allowed === permission),
      )
    )
      throw new BadRequestException();
    if (
      code === "super_admin" &&
      ADMIN_REQUIRED_PERMISSIONS.some((permission) => !permissions.includes(permission))
    )
      throw new ConflictException();
    await this.auth.databaseClient.transaction(async (transaction) => {
      const current = await this.#actor(transaction, actor, "admin.roles");
      if (permissions.some((permission) => !current.permissions.includes(permission)))
        throw new ForbiddenException();
      const previous = await transaction.query<{ permission_code: string }>(
        "SELECT permission_code FROM airmech.role_permissions WHERE role_code=$1 ORDER BY permission_code",
        [code],
      );
      await transaction.query("UPDATE airmech.roles SET name=$2 WHERE code=$1", [code, name]);
      await transaction.query("DELETE FROM airmech.role_permissions WHERE role_code=$1", [code]);
      await transaction.query(
        "INSERT INTO airmech.role_permissions(role_code,permission_code) SELECT $1,unnest($2::text[])",
        [code, permissions],
      );
      await transaction.query(
        "DELETE FROM airmech.auth_sessions WHERE user_id IN (SELECT user_id FROM airmech.user_roles WHERE role_code=$1)",
        [code],
      );
      await writeAuthAudit(
        transaction,
        "ROLE_PERMISSIONS_CHANGED",
        request.requestId,
        actor.user.id,
        null,
        { roleCode: code, before: previous.map((row) => row.permission_code), after: permissions },
      );
    });
  }

  async invite(
    body: unknown,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    const fields = requireFields(body, ["email", "displayName", "roles"]);
    const email = inputEmail(fields);
    const name = inputText(fields, "displayName", 120).trim();
    const roles = stringArray(fields.roles);
    if (!name || roles.some((role) => !Object.hasOwn(ROLE_PERMISSION_BASELINE, role)))
      throw new BadRequestException();
    await this.auth.databaseClient.transaction(async (transaction) => {
      const current = await this.#actor(transaction, actor, "user.create");
      const grants = await transaction.query<{ permission_code: string }>(
        "SELECT DISTINCT permission_code FROM airmech.role_permissions WHERE role_code=ANY($1::text[])",
        [roles],
      );
      if (grants.some((grant) => !current.permissions.includes(grant.permission_code)))
        throw new ForbiddenException();
      const exists = await transaction.query("SELECT id FROM airmech.users WHERE lower(email)=$1", [
        email,
      ]);
      if (exists[0]) throw new ConflictException();
    });
    // Identity provisioning is bounded and outside the transaction. Email goes to the worker.
    let identityId: string;
    try {
      identityId = (await this.auth.provider.createInvitationIdentity(email, name)).identityId;
    } catch {
      await writeAuthAudit(
        this.auth.databaseClient,
        "USER_INVITE_FAILED",
        request.requestId,
        actor.user.id,
      );
      throw new ServiceUnavailableException();
    }
    const messageId = await this.auth.databaseClient.transaction(async (transaction) => {
      const current = await this.#actor(transaction, actor, "user.create");
      const grants = await transaction.query<{ permission_code: string }>(
        "SELECT DISTINCT permission_code FROM airmech.role_permissions WHERE role_code=ANY($1::text[])",
        [roles],
      );
      if (grants.some((grant) => !current.permissions.includes(grant.permission_code)))
        throw new ForbiddenException();
      const rows = await transaction.query<{ id: string }>(
        "INSERT INTO airmech.users(identity_id,email,display_name,status) VALUES($1,$2,$3,'invited') RETURNING id",
        [identityId, email, name],
      );
      const id = rows[0]?.id;
      if (!id) throw new ConflictException();
      await transaction.query(
        "INSERT INTO airmech.user_roles(user_id,role_code) SELECT $1,unnest($2::text[])",
        [id, roles],
      );
      await writeAuthAudit(transaction, "USER_CREATED", request.requestId, actor.user.id, id, {
        after: roles,
      });
      return this.auth.createInvitationMessage(
        transaction,
        id,
        email,
        name,
        actor.user.id,
        request.requestId,
      );
    });
    await this.auth.enqueueMessage(messageId);
  }

  async resendInvitation(
    id: string,
    actor: AccessPrincipal,
    request: AuthenticatedRequest,
  ): Promise<void> {
    requireUserId(id);
    const messageId = await this.auth.databaseClient.transaction(async (transaction) => {
      await this.#actor(transaction, actor, "user.create");
      const rows = await transaction.query<{ email: string; display_name: string }>(
        "SELECT email,display_name FROM airmech.users WHERE id=$1 AND status='invited'",
        [id],
      );
      if (!rows[0]) throw new ConflictException();
      return this.auth.createInvitationMessage(
        transaction,
        id,
        rows[0].email,
        rows[0].display_name,
        actor.user.id,
        request.requestId,
      );
    });
    await this.auth.enqueueMessage(messageId);
  }
}
