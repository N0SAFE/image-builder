import { Module } from "@nestjs/common";
import { CoreDomainModule } from "@/core/modules/domain/domain.module";
import { ProjectModule } from "@/modules/project/project.module";
import { OrganizationDomainController } from "./controllers/organization-domain.controller";
import { ProjectDomainController } from "./controllers/project-domain.controller";
import { ServiceDomainController } from "./controllers/service-domain.controller";
import { DomainOrganizationService } from "./services/domain-organization.service";
import { DomainProjectService } from "./services/domain-project.service";
import { DomainServiceService } from "./services/domain-service.service";

@Module({
    imports: [CoreDomainModule, ProjectModule],
    controllers: [OrganizationDomainController, ProjectDomainController, ServiceDomainController],
    providers: [DomainOrganizationService, DomainProjectService, DomainServiceService],
    exports: [DomainOrganizationService, DomainProjectService, DomainServiceService],
})
export class DomainModule {}