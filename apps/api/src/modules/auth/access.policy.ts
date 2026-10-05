import { hasPermission, type AccessPrincipal } from "@airmech/contracts";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

/** Object policies must be supplied by the owning module, using trusted DB records. */
export function requireAccess(
  principal: AccessPrincipal | null,
  permission: string,
  objectAllowed = false,
): asserts principal is AccessPrincipal {
  if (!principal || principal.user.status !== "active") throw new UnauthorizedException();
  if (!hasPermission(principal, permission) || !objectAllowed) throw new ForbiddenException();
}
