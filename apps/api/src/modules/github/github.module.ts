import { Module } from "@nestjs/common";
import { DeploymentModule } from "@/modules/deployment/deployment.module";
import { GithubWebhookController } from "./controllers/github-webhook.controller";
import { GithubWebhookDispatchService } from "./services/github-webhook-dispatch.service";
import { WebhookIdempotencyService } from "./services/webhook-idempotency.service";
import { PreviewLifecycleEventService } from "./events/preview-lifecycle-event.service";

@Module({
    imports: [DeploymentModule],
    controllers: [GithubWebhookController],
    providers: [
        GithubWebhookDispatchService,
        WebhookIdempotencyService,
        PreviewLifecycleEventService,
    ],
    exports: [GithubWebhookDispatchService, PreviewLifecycleEventService],
})
export class GithubModule {}
