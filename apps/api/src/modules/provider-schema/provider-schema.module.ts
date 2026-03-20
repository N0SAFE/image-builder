import { Module } from "@nestjs/common";
import { ProviderSchemaController } from "./controllers/provider-schema.controller";
import { ProviderSchemaService } from "./services/provider-schema.service";

@Module({
    controllers: [ProviderSchemaController],
    providers: [ProviderSchemaService],
    exports: [ProviderSchemaService],
})
export class ProviderSchemaModule {}
