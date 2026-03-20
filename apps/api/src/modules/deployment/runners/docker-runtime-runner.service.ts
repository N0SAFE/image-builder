import { Injectable } from "@nestjs/common";
import { DockerService } from "@/core/modules/docker/services/docker.service";
import { TraefikService } from "@/core/modules/traefik/services/traefik.service";
import type {
    DeploymentRuntimeRunner,
    RuntimeExecutionInput,
    RuntimeExecutionResult,
} from "./runtime-runner.interface";

@Injectable()
export class DockerRuntimeRunnerService implements DeploymentRuntimeRunner {
    readonly runnerKinds = [
        "docker",
        "dockerfile",
        "docker_compose",
        "nixpacks",
        "buildpack",
        "railpack",
    ] as const;

    constructor(
        private readonly dockerService: DockerService,
        private readonly traefikService: TraefikService,
    ) {}

    async executeRuntime(input: RuntimeExecutionInput): Promise<RuntimeExecutionResult> {
        const { deployment, artifact, healthGateConfig } = input;
        const fallbackName = `deployer-${deployment.serviceId.slice(0, 12)}-${deployment.deploymentId.slice(0, 8)}`;
        const containerName = artifact.containerName ?? deployment.deploymentContainerName ?? fallbackName;
        const containerImage = artifact.containerImage ?? deployment.deploymentContainerImage ?? "nginx:alpine";

        let createdContainerId: string | null = null;
        try {
            await this.dockerService.stopContainersByDeployment(deployment.deploymentId);
            const staleContainers = await this.dockerService.listContainersByDeployment(deployment.deploymentId);
            for (const stale of staleContainers) {
                await this.dockerService.removeContainer(stale.id);
            }

            const created = await this.dockerService.createContainer({
                Image: containerImage,
                name: containerName,
                Labels: {
                    "deployer.deployment_id": deployment.deploymentId,
                    "deployer.managed": "true",
                },
            });
            createdContainerId = created.id;
            await this.dockerService.startContainer(created.id);

            const routeVerification = await this.applyRouteAndVerify(deployment.serviceId);
            const healthGate = await this.enforceReadinessHealthGate(
                created.id,
                deployment.healthCheckUrl,
                healthGateConfig,
            );

            return {
                containerId: created.id,
                containerName,
                containerImage,
                routeVerification,
                healthGate,
            };
        } catch (error) {
            if (createdContainerId) {
                await this.dockerService.removeContainer(createdContainerId);
            }
            throw error;
        }
    }

    private async applyRouteAndVerify(serviceId: string) {
        const syncResult = await this.traefikService.syncServiceConfiguration(serviceId);
        if (!syncResult.success) {
            throw new Error(syncResult.message);
        }

        const healthSummary = await this.traefikService.getHealthStatus();

        return {
            applied: true,
            syncResult: {
                configId: syncResult.configId,
                configName: syncResult.configName,
                action: syncResult.action,
                message: syncResult.message,
                syncedAt: syncResult.syncedAt
                    ? new Date(syncResult.syncedAt).toISOString()
                    : null,
            },
            healthSummary,
            verifiedAt: new Date().toISOString(),
        };
    }

    private async enforceReadinessHealthGate(
        containerId: string,
        healthCheckUrl: string | null,
        config: {
            maxRetries: number;
            retryIntervalMs: number;
        },
    ) {
        const isHealthy = await this.dockerService.waitForContainerHealth(
            containerId,
            config.maxRetries,
            config.retryIntervalMs,
            healthCheckUrl ?? undefined,
        );

        if (!isHealthy) {
            throw new Error(
                `Readiness health gate failed for container '${containerId}' after ${String(config.maxRetries)} retries`,
            );
        }

        return {
            passed: true as const,
            containerId,
            healthCheckUrl,
            maxRetries: config.maxRetries,
            retryIntervalMs: config.retryIntervalMs,
            verifiedAt: new Date().toISOString(),
        };
    }
}
