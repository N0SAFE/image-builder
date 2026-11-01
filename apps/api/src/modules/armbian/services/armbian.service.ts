import { Injectable } from "@nestjs/common";
import {
    ArmbianBuilderService,
    type ArmbianBuildDetails,
    type ArmbianBuildRequest,
    type ArmbianBuildStatus,
    type ArmbianBuildStreamEvent,
} from "@repo/nest-modules/armbian";
import { DockerService } from "@/core/modules/docker/services/docker.service";
import { EnvService } from "@/config/env/env.service";

@Injectable()
export class ArmbianService {
    private readonly builder: ArmbianBuilderService;

    constructor(
        dockerService: DockerService,
        envService: EnvService,
    ) {
        this.builder = new ArmbianBuilderService(dockerService, {
            workerImage:
                envService.get("ARMBIAN_WORKER_IMAGE") ??
                "ghcr.io/armbian/docker-armbian-build:armbian-ubuntu-noble-latest",
            storageRootPath: envService.get("ARMBIAN_STORAGE_PATH") ?? "/tmp/armbian-storage",
            workspaceRootPath: envService.get("ARMBIAN_WORKSPACE_PATH") ?? "/tmp/armbian-workspaces",
            buildEntrypoint: envService.get("ARMBIAN_BUILD_ENTRYPOINT") ?? "auto",
        });
    }

    startBuild(input: ArmbianBuildRequest) {
        return this.builder.startBuild(input);
    }

    getBuildFormConfig() {
        return this.builder.getBuildFormConfig();
    }

    getBuild(buildId: string) {
        return this.builder.getBuild(buildId);
    }

    deleteBuild(buildId: string) {
        return this.builder.deleteBuild(buildId);
    }

    getBuildLogs(buildId: string, tail?: number) {
        return this.builder.getBuildLogs(buildId, tail);
    }

    listBuilds(limit?: number) {
        return this.builder.listBuilds(limit);
    }

    listArtifacts(buildId: string) {
        return this.builder.listArtifacts(buildId);
    }

    async *streamBuildEvents(buildId: string, options?: { intervalMs?: number; tail?: number }): AsyncGenerator<ArmbianBuildStreamEvent> {
        const intervalMs = Math.max(500, options?.intervalMs ?? 2000);
        const tail = Math.max(50, options?.tail ?? 400);
        let previousSignature: string | null = null;

        for (;;) {
            const [details, logsTail] = await Promise.all([
                this.builder.getBuild(buildId),
                this.builder.getBuildLogs(buildId, tail),
            ]);

            const event = this.toBuildStreamEvent(buildId, details, logsTail);
            const signature = JSON.stringify(event);

            if (signature !== previousSignature) {
                previousSignature = signature;
                yield event;
            }

            if (details.status === "success" || details.status === "failed" || details.status === "not_found") {
                return;
            }

            await this.delay(intervalMs);
        }
    }

    private async delay(ms: number) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    private toBuildStreamEvent(
        buildId: string,
        details: ArmbianBuildDetails,
        logsTail: string,
    ): ArmbianBuildStreamEvent {
        const stepInfo = this.deriveStep(details.status, logsTail);

        return {
            buildId,
            status: details.status,
            step: stepInfo.step,
            stepIndex: stepInfo.stepIndex,
            totalSteps: 6,
            logsTail,
            artifacts: details.artifacts,
            startedAt: details.startedAt,
            finishedAt: details.finishedAt,
            updatedAt: new Date().toISOString(),
        };
    }

    private deriveStep(status: ArmbianBuildStatus, logsTail: string) {
        const normalized = logsTail.toLowerCase();

        if (status === "queued") {
            return { step: "Queued", stepIndex: 0 };
        }

        if (status === "success") {
            return { step: "Completed", stepIndex: 6 };
        }

        if (status === "failed") {
            return { step: "Failed", stepIndex: 6 };
        }

        if (normalized.includes("git clone") || normalized.includes("cloning into")) {
            return { step: "Preparing sources", stepIndex: 1 };
        }

        if (
            normalized.includes("./compile") ||
            normalized.includes("compile.sh") ||
            normalized.includes(" compiling ") ||
            normalized.includes("build invocation")
        ) {
            return { step: "Compiling image", stepIndex: 2 };
        }

        if (normalized.includes("customize-image start")) {
            return { step: "Applying customization", stepIndex: 3 };
        }

        if (normalized.includes("copy") && normalized.includes("/artifacts")) {
            return { step: "Exporting artifacts", stepIndex: 4 };
        }

        if (normalized.includes("customize-image done")) {
            return { step: "Finalizing", stepIndex: 5 };
        }

        return { step: "Running build", stepIndex: 2 };
    }
}
