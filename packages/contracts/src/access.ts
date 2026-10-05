export type UserStatus = "invited" | "active" | "disabled";

export interface UserProfile {
  readonly id: string;
  readonly identityId: string;
  readonly email: string;
  readonly displayName: string;
  readonly employeeCode: string | null;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly status: UserStatus;
  readonly lastLoginAt: string | null;
}

export interface AccessPrincipal {
  readonly user: UserProfile;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly rolePermissions?: Readonly<Record<string, readonly string[]>>;
}

/** Role names carry no implicit authority, including super_admin. */
export function hasPermission(principal: AccessPrincipal | null, permission: string): boolean {
  return principal?.user.status === "active" && principal.permissions.includes(permission);
}
