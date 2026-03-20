import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/modules/database/database.module";
import { ProjectModule } from "../project/project.module";
import { ServiceController } from "./controllers/service.controller";
import { ServiceRepository } from "./repositories/service.repository";
import { ServiceService } from "./services/service.service";
import { ServiceEventService } from "./services/service-event.service";

@Module({
    imports: [DatabaseModule, ProjectModule],
    controllers: [ServiceController],
    providers: [ServiceService, ServiceRepository, ServiceEventService],
    exports: [ServiceService, ServiceRepository, ServiceEventService],
})
export class ServiceModule {}
