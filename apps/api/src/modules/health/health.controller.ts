import { createHealthResponse, type HealthResponse } from "@airmech/contracts";
import { Controller, Get, Header } from "@nestjs/common";
import { PublicRoute } from "../auth/auth.guard.js";

@Controller("health")
export class HealthController {
  @Get()
  @PublicRoute()
  @Header("Cache-Control", "no-store")
  getHealth(): HealthResponse {
    return createHealthResponse("api");
  }
}
