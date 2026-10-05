import { hasPermission } from "@airmech/contracts";
import {
  ForbiddenException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { ServerResponse } from "node:http";
import { writeAuthAudit, type AuthService, type AuthenticatedRequest } from "./auth.service.js";

const PUBLIC = "airmech.public";
const ACCESS = "airmech.access";
export const PublicRoute = () => SetMetadata(PUBLIC, true);
export const RequireAccess = (permission: string, scope: "self" | "security") =>
  SetMetadata(ACCESS, { permission, scope });

/** Global default-deny guard. Controllers must explicitly declare public/self/security scope. */
export class ApplicationAccessGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<ServerResponse>();
    response.setHeader("Cache-Control", "no-store");
    const publicRoute =
      this.reflector.getAllAndOverride<boolean>(PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method ?? "")) {
      // Fail closed before credentials or cookies are processed. No trust in forwarded origins.
      const expected = this.auth.configuration.auth.appUrl;
      if (
        !expected ||
        request.headers.origin !== new URL(expected).origin ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        throw new ForbiddenException();
    }
    if (publicRoute) return true;
    response.setHeader("Cache-Control", "no-store");
    const principal = await this.auth.principal(request);
    const access = this.reflector.getAllAndOverride<{
      permission: string;
      scope: "self" | "security";
    }>(ACCESS, [context.getHandler(), context.getClass()]);
    const securityRead = ["user.read", "role.read", "permission.read", "audit.read"].includes(
      access?.permission ?? "",
    );
    const securityRoleAllowed =
      !!access &&
      (principal.rolePermissions?.super_admin?.includes(access.permission) === true ||
        (securityRead &&
          principal.rolePermissions?.management?.includes(access.permission) === true));
    if (
      !access ||
      !hasPermission(principal, access.permission) ||
      (access.scope === "security" && !securityRoleAllowed)
    ) {
      await writeAuthAudit(
        this.auth.databaseClient,
        "ACCESS_DENIED",
        request.requestId,
        principal.user.id,
      );
      throw new ForbiddenException();
    }
    request.principal = principal;
    return true;
  }
}
