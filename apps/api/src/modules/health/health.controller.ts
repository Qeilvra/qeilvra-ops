import { createHealthResponse, type HealthResponse } from "@airmech/contracts";
import { Controller, Get, Header } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  @Header("Cache-Control", "no-store")
  getHealth(): HealthResponse {
    return createHealthResponse("api");
  }
}
