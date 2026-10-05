import type { AccessPrincipal, UserProfile, UserStatus } from "@airmech/contracts";
import type { DatabaseTransaction } from "@airmech/database";

interface UserRow {
  [column: string]: unknown;
  id: string;
  identity_id: string;
  email: string;
  display_name: string;
  employee_code: string | null;
  job_title: string | null;
  phone: string | null;
  status: UserStatus;
  last_login_at: Date | null;
  roles: string[];
  permissions: string[];
  grants: { role: string; permission: string | null }[];
}

/** One parameterized read resolves current status, roles and grants without N+1 queries. */
export class UserRepository {
  constructor(private readonly database: DatabaseTransaction) {}

  async findPrincipal(identityId: string): Promise<AccessPrincipal | null> {
    return this.#find("u.identity_id=$1", identityId);
  }

  async findSessionPrincipal(tokenHash: string): Promise<AccessPrincipal | null> {
    return this.#find(
      "u.id=(SELECT s.user_id FROM airmech.auth_sessions s WHERE s.token_hash=$1 AND s.kind='login' AND s.expires_at>now())",
      tokenHash,
    );
  }

  async #find(predicate: string, value: string): Promise<AccessPrincipal | null> {
    const rows = await this.database.query<UserRow>(
      `SELECT u.*, COALESCE(array_agg(DISTINCT ur.role_code)
         FILTER (WHERE ur.role_code IS NOT NULL), '{}') AS roles,
         COALESCE(array_agg(DISTINCT rp.permission_code)
         FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions,
         COALESCE(jsonb_agg(DISTINCT jsonb_build_object('role',ur.role_code,'permission',rp.permission_code))
         FILTER (WHERE ur.role_code IS NOT NULL), '[]') AS grants
       FROM airmech.users u
       LEFT JOIN airmech.user_roles ur ON ur.user_id=u.id
       LEFT JOIN airmech.role_permissions rp ON rp.role_code=ur.role_code
       WHERE ${predicate} AND (u.auth_locked_until IS NULL OR u.auth_locked_until<now()) GROUP BY u.id`,
      [value],
    );
    const row = rows[0];
    if (!row) return null;
    const user: UserProfile = {
      id: row.id,
      identityId: row.identity_id,
      email: row.email,
      displayName: row.display_name,
      employeeCode: row.employee_code,
      jobTitle: row.job_title,
      phone: row.phone,
      status: row.status,
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
    };
    const grants = new Map<string, string[]>();
    for (const grant of row.grants) {
      if (!grants.has(grant.role)) grants.set(grant.role, []);
      if (grant.permission) grants.get(grant.role)?.push(grant.permission);
    }
    return {
      user,
      roles: row.roles,
      permissions: row.permissions,
      rolePermissions: Object.fromEntries(grants),
    };
  }
}
