import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { DatabaseModule } from "../../core/modules/database/database.module";
import { MeshCoreModule } from "@/core/modules/mesh/mesh-core.module";
import { ProjectModule } from "../project/project.module";
import { DeploymentController } from "./controllers/deployment.controller";
import { DeploymentRepository } from "./repositories/deployment.repository";
import { DeploymentService } from "./services/deployment.service";
import { DeploymentEventService } from "./events/deployment-event.service";
import { DeploymentExecutionWorkflowService } from "./services/deployment-execution-workflow.service";
import { DeploymentQueueLifecycleService } from "./queue/deployment-queue-lifecycle.service";
import { DeploymentBullQueueService } from "./queue/deployment-bull-queue.service";
import { DeploymentQueueEventService } from "./queue/deployment-queue-event.service";
import { DeploymentProvidersModule } from "./providers/providers.module";
import { DeploymentRunnersModule } from "./runners/runners.module";
import { DeploymentMeshService } from "./mesh/services/deployment-mesh.service";
import { DeploymentMeshHandlerRegistrar } from "./mesh/registrars/deployment-mesh-handler-registrar.service";
import { PreviewNamingService } from "./services/preview-naming.service";
import { PreviewEnvOverlayService } from "./services/preview-env-overlay.service";
import { PreviewCleanupPolicyService } from "./services/preview-cleanup-policy.service";

@Module({
    imports: [
        DatabaseModule,
        MeshCoreModule,
        ProjectModule,
        DeploymentProvidersModule,
        DeploymentRunnersModule,
        BullModule.registerQueue({ name: "deployment" }),
    ],
    controllers: [DeploymentController],
    providers: [
        DeploymentService,
        DeploymentRepository,
        DeploymentEventService,
        DeploymentExecutionWorkflowService,
        DeploymentQueueLifecycleService,
        DeploymentBullQueueService,
        DeploymentQueueEventService,
        DeploymentMeshService,
        DeploymentMeshHandlerRegistrar,
        PreviewNamingService,
        PreviewEnvOverlayService,
        PreviewCleanupPolicyService,
    ],
    exports: [
        DeploymentService,
        DeploymentRepository,
        DeploymentEventService,
        PreviewNamingService,
        PreviewEnvOverlayService,
        PreviewCleanupPolicyService,
    ],
})
export class DeploymentModule {}
