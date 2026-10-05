import type { AccessPrincipal, UserProfile, UserStatus } from "@airmech/contracts";
import type { DatabaseClient } from "@airmech/database";

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
}

/** One parameterized read resolves current status, roles and grants without N+1 queries. */
export class UserRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findPrincipal(identityId: string): Promise<AccessPrincipal | null> {
    const rows = await this.database.query<UserRow>(
      `SELECT u.*, COALESCE(array_agg(DISTINCT ur.role_code)
         FILTER (WHERE ur.role_code IS NOT NULL), '{}') AS roles,
         COALESCE(array_agg(DISTINCT rp.permission_code)
         FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
       FROM airmech.users u
       LEFT JOIN airmech.user_roles ur ON ur.user_id=u.id
       LEFT JOIN airmech.role_permissions rp ON rp.role_code=ur.role_code
       WHERE u.identity_id=$1 GROUP BY u.id`,
      [identityId],
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
    return { user, roles: row.roles, permissions: row.permissions };
  }
}
