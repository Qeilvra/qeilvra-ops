import type { ServerConfiguration } from "@airmech/config/server";
import { DatabaseClient } from "@airmech/database";
import { StorageService } from "@airmech/storage";
import { Module, type DynamicModule } from "@nestjs/common";

import { SystemQueueService } from "./queue/system-queue.service.js";

export class ApiDatabaseService {
  readonly client: DatabaseClient | null;

  constructor(configuration: ServerConfiguration) {
    this.client = configuration.database.enabled
      ? new DatabaseClient(configuration.database, (event) => {
          process.stderr.write(`${JSON.stringify({ service: "api", level: "error", ...event })}\n`);
        })
      : null;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.close();
  }
}

@Module({})
export class InfrastructureModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return {
      module: InfrastructureModule,
      providers: [
        { provide: ApiDatabaseService, useFactory: () => new ApiDatabaseService(configuration) },
        {
          provide: SystemQueueService,
          useFactory: () => new SystemQueueService(configuration.redis),
        },
        {
          provide: StorageService,
          useFactory: () =>
            configuration.storage.enabled ? new StorageService(configuration.storage) : null,
        },
      ],
      exports: [ApiDatabaseService, SystemQueueService, StorageService],
    };
  }
}
