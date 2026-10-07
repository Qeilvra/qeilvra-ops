import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { RequireAccess } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.service.js";
import { NotificationService } from "./notification.service.js";

function userId(request: AuthenticatedRequest): string {
  if (!request.principal) throw new BadRequestException();
  return request.principal.user.id;
}

@Controller("notifications")
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @RequireAccess("notification.read", "self")
  list(@Req() request: AuthenticatedRequest, @Query("page") page = "1") {
    return this.notifications.list(userId(request), /^\d+$/.test(page) ? Number(page) : NaN);
  }

  @Post(":id/read")
  @RequireAccess("notification.read", "self")
  @HttpCode(204)
  async read(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    await this.notifications.markRead(userId(request), id);
  }
}
