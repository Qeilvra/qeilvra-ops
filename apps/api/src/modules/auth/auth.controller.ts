import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { AuthService, type AuthenticatedRequest } from "./auth.service.js";
import { PublicRoute, RequireAccess } from "./auth.guard.js";
import { inputEmail, inputText, requireFields } from "./session-security.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @PublicRoute()
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["email", "password"]);
    return this.auth.login(
      inputEmail(fields),
      inputText(fields, "password", 1024),
      request,
      response,
    );
  }

  @Get("me")
  @RequireAccess("profile.read", "self")
  me(@Req() request: AuthenticatedRequest) {
    return request.principal;
  }

  @Post("logout")
  @PublicRoute()
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await this.auth.logout(request, response);
  }

  @Post("password-reset/request")
  @PublicRoute()
  @HttpCode(202)
  async resetRequest(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["email"]);
    await this.auth.requestReset(inputEmail(fields), request, response);
    return { message: "If the account exists, password reset instructions will be sent." };
  }

  @Post("recovery/complete")
  @PublicRoute()
  @HttpCode(204)
  async complete(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["code"]);
    await this.auth.completeRecovery(inputText(fields, "code", 256), request, response);
  }

  @Post("invitation/complete")
  @PublicRoute()
  @HttpCode(204)
  async invitation(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["tokenHash"]);
    await this.auth.completeInvitation(inputText(fields, "tokenHash", 256), request, response);
  }

  @Post("invitation/session")
  @PublicRoute()
  @HttpCode(204)
  async invitationSession(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["accessToken"]);
    await this.auth.completeInvitationSession(
      inputText(fields, "accessToken", 16_384),
      request,
      response,
    );
  }

  @Post("password-reset/complete")
  @PublicRoute()
  @HttpCode(204)
  async password(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const fields = requireFields(body, ["password"]);
    await this.auth.setPassword(inputText(fields, "password", 128, 12), request, response);
  }

  @Get("recovery/status")
  @PublicRoute()
  recoveryStatus(@Req() request: AuthenticatedRequest) {
    return this.auth.recoveryReady(request);
  }
}
