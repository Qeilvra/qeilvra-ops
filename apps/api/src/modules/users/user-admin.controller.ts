import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AccessPrincipal } from "@airmech/contracts";
import { RequireAccess } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.service.js";
import { requireFields } from "../auth/session-security.js";
import { UserAdministrationService } from "./user-admin.service.js";

function actor(request: AuthenticatedRequest): AccessPrincipal {
  if (!request.principal) throw new BadRequestException();
  return request.principal;
}

@Controller("admin")
export class UserAdministrationController {
  constructor(private readonly users: UserAdministrationService) {}

  @Post("users/:id/invite")
  @RequireAccess("user.create", "security")
  @HttpCode(202)
  async resend(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.users.resendInvitation(id, actor(request), request);
  }

  @Get("users")
  @RequireAccess("user.read", "security")
  list(@Query("page") page: string = "1", @Query("search") search: string = "") {
    return this.users.list(/^\d+$/.test(page) ? Number(page) : NaN, search);
  }

  @Get("roles")
  @RequireAccess("role.read", "security")
  roles() {
    return this.users.roles();
  }

  @Post("users")
  @RequireAccess("user.create", "security")
  @HttpCode(201)
  async invite(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.users.invite(body, actor(request), request);
  }

  @Patch("users/:id")
  @RequireAccess("user.update", "security")
  @HttpCode(204)
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.users.updateProfile(id, body, actor(request), request);
  }

  @Post("users/:id/disable")
  @RequireAccess("user.disable", "security")
  @HttpCode(204)
  async disable(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.users.status(id, false, actor(request), request);
  }

  @Post("users/:id/enable")
  @RequireAccess("user.update", "security")
  @HttpCode(204)
  async enable(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.users.status(id, true, actor(request), request);
  }

  @Post("users/:id/roles")
  @RequireAccess("admin.users", "security")
  @HttpCode(204)
  async assign(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const fields = requireFields(body, ["roles"]);
    await this.users.assignRoles(id, fields.roles, actor(request), request);
  }

  @Patch("roles/:code")
  @RequireAccess("admin.roles", "security")
  @HttpCode(204)
  async updateRole(
    @Param("code") code: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.users.updateRole(code, body, actor(request), request);
  }
}
