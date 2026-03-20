import { Module, Global, Logger } from "@nestjs/common";
import { DatabaseService } from "./services/database.service";
import { DATABASE_CONNECTION } from "./database-connection";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../../config/drizzle/schema";
import { EnvService } from "../../../config/env/env.service";
import { EnvModule } from "../../../config/env/env.module";
import { LocalDatabaseModule } from "../local-database/local-database.module";
import { LocalDatabaseService } from "../local-database/local-database.service";
import { nodeConfig } from "@/config/drizzle/local-schema";

const logger = new Logger("DatabaseModule");

@Global()
@Module({
    imports: [EnvModule, LocalDatabaseModule],
    providers: [
        DatabaseService,
        {
            provide: DATABASE_CONNECTION,
            useFactory: (envService: EnvService, localDb: LocalDatabaseService) => {
                // Env var takes priority (useful for compose overrides, CI, tests)
                const urlFromEnv = envService.get("DATABASE_URL");
                const urlFromConfig = localDb.db
                    .select({ databaseUrl: nodeConfig.databaseUrl })
                    .from(nodeConfig)
                    .limit(1)
                    .all()[0]?.databaseUrl ?? undefined;

                const connectionString = urlFromEnv ?? urlFromConfig;

                if (!connectionString) {
                    logger.warn(
                        "No DATABASE_URL configured — starting in setup mode. " +
                        "Connect to a Postgres database through the setup wizard.",
                    );
                    return null;
                }

                logger.log(`Connecting to Postgres (source: ${urlFromEnv ? "env" : "local config"})`);
                const pool = new Pool({ connectionString });
                return drizzle(pool, { schema });
            },
            inject: [EnvService, LocalDatabaseService],
        },
    ],
    exports: [DatabaseService, DATABASE_CONNECTION],
})
export class DatabaseModule {}
