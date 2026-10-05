import type { AccessPrincipal, UserStatus } from "@airmech/contracts";
import { isRecord } from "@/lib/api/client";

export function readPrincipal(value: unknown): AccessPrincipal {
  if (!isRecord(value) || !isRecord(value.user)) throw new Error("Invalid session response");
  const user = value.user;
  const required = (field: string) => {
    const item = user[field];
    if (typeof item !== "string") throw new Error("Invalid session response");
    return item;
  };
  const nullable = (field: string) => {
    const item = user[field];
    if (item !== null && typeof item !== "string") throw new Error("Invalid session response");
    return item;
  };
  const list = (items: unknown) => {
    if (
      !Array.isArray(items) ||
      items.length > 100 ||
      !items.every((item) => typeof item === "string")
    )
      throw new Error("Invalid session response");
    return items as string[];
  };
  const status = required("status");
  if (!["active", "invited", "disabled"].includes(status))
    throw new Error("Invalid session response");
  return {
    user: {
      id: required("id"),
      identityId: required("identityId"),
      email: required("email"),
      displayName: required("displayName"),
      status: status as UserStatus,
      employeeCode: nullable("employeeCode"),
      jobTitle: nullable("jobTitle"),
      phone: nullable("phone"),
      lastLoginAt: nullable("lastLoginAt"),
    },
    roles: list(value.roles),
    permissions: list(value.permissions),
  };
}
