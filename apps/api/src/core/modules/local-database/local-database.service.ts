import { Inject, Injectable } from "@nestjs/common";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as localSchema from "@/config/drizzle/local-schema";
import { nodeConfig } from "@/config/drizzle/local-schema";
import { LOCAL_DATABASE_CONNECTION } from "./local-database.token";

export type LocalDatabase = BetterSQLite3Database<typeof localSchema> | null;

@Injectable()
export class LocalDatabaseService {
    constructor(
        @Inject(LOCAL_DATABASE_CONNECTION)
        private readonly _db: LocalDatabase,
    ) {}

    get db(): BetterSQLite3Database<typeof localSchema> {
        if (!this._db) {
            throw new Error(
                "Local SQLite database is unavailable in this runtime. " +
                "Set DATABASE_URL explicitly to run without setup-local persistence.",
            );
        }

        return this._db;
    }

    get isAvailable(): boolean {
        return this._db !== null;
    }

    getConfiguredDatabaseUrl(): string | undefined {
        if (!this._db) return undefined;

        return this._db
            .select({ databaseUrl: nodeConfig.databaseUrl })
            .from(nodeConfig)
            .limit(1)
            .all()[0]?.databaseUrl ?? undefined;
    }

    isHealthy(): boolean {
        if (!this._db) return false;

        try {
            this._db.run("SELECT 1");
            return true;
        } catch {
            return false;
        }
    }
}
