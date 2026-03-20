import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DeploymentObservabilityContext } from "@repo/api-contracts/common/deployment";
import { DeploymentRepository } from "../repositories/deployment.repository";
import { RuntimeRunnerRegistryService } from "../runners/runtime-runner-registry.service";
import type { BuildArtifactResult, HealthGateConfig } from "../runners/runtime-runner.interface";
import { DeploymentEventService } from "../events/deployment-event.service";

@Injectable()
export class DeploymentExecutionWorkflowService {
    constructor(
        private readonly deploymentRepository: DeploymentRepository,
        private readonly runtimeRunnerRegistryService: RuntimeRunnerRegistryService,
        private readonly deploymentEventService: DeploymentEventService,
    ) {}

    async markBuildExecutionStarted(
        deploymentId: string,
        startedAt: Date,
        observability?: DeploymentObservabilityContext | null,
    ) {
        const deployment = await this.getDeploymentById(deploymentId);
        const metadata = this.mergeMetadata(deployment.metadata, {
            buildExecution: {
                status: "started",
                startedAt: startedAt.toISOString(),
            },
            stage: "building",
        });

        await this.deploymentRepository.persistBuildArtifacts(deploymentId, {
            buildStartedAt: startedAt,
            status: "building",
            phase: "building",
            phaseProgress: 25,
            metadata,
        });

        await this.deploymentRepository.insertLog(deploymentId, {
            level: "info",
            message: "Build execution started",
            phase: "building",
            stage: "build",
            correlationId: observability?.correlationId ?? deploymentId,
            traceId: observability?.traceId,
            spanId: observability?.spanId,
            metadata: {
                startedAt: startedAt.toISOString(),
                structured: true,
            },
        });
    }

    async persistBuildExecutionResult(
        deploymentId: string,
        result: Record<string, unknown> | undefined,
        observability?: DeploymentObservabilityContext | null,
    ) {
        const completedAt = this.getResultDate(result, "buildCompletedAt") ?? new Date();
        const startedAt = this.getResultDate(result, "buildStartedAt");
        const artifact = this.extractArtifactResult(result);
        const deployment = await this.getDeploymentById(deploymentId);
        const buildDuration =
            startedAt !== undefined
                ? Math.max(0, completedAt.getTime() - startedAt.getTime())
                : undefined;

        const metadata = this.mergeMetadata(deployment.metadata, {
            artifact: {
                containerImage: artifact.containerImage,
                containerName: artifact.containerName,
                digest: artifact.artifactDigest,
                sizeBytes: artifact.artifactSizeBytes,
                buildLogsUrl: artifact.buildLogsUrl,
                persistedAt: completedAt.toISOString(),
            },
            buildExecution: {
                status: "completed",
                startedAt: startedAt?.toISOString() ?? deployment.buildStartedAt ?? null,
                completedAt: completedAt.toISOString(),
                durationMs: buildDuration,
            },
            ...(buildDuration !== undefined ? { buildDuration } : {}),
            stage: "deploying",
        });

        await this.deploymentRepository.persistBuildArtifacts(deploymentId, {
            buildCompletedAt: completedAt,
            ...(startedAt ? { buildStartedAt: startedAt } : {}),
            containerImage: artifact.containerImage,
            containerName: artifact.containerName,
            status: "deploying",
            phase: "copying_files",
            phaseProgress: 50,
            metadata,
        });

        await this.deploymentRepository.insertLog(deploymentId, {
            level: "info",
            message: "Build execution completed and artifact metadata persisted",
            phase: "building",
            stage: "build",
            correlationId: observability?.correlationId ?? deploymentId,
            traceId: observability?.traceId,
            spanId: observability?.spanId,
            metadata: {
                containerImage: artifact.containerImage,
                containerName: artifact.containerName,
                digest: artifact.artifactDigest,
                sizeBytes: artifact.artifactSizeBytes,
                buildLogsUrl: artifact.buildLogsUrl,
                durationMs: buildDuration,
                structured: true,
            },
        });

        await this.applyContainerLifecycle(deploymentId, artifact, result, observability);
    }

    async markRollbackExecutionStarted(
        rollbackDeploymentId: string,
        rollbackId: string | null,
        fromDeploymentId: string | null,
        observability?: DeploymentObservabilityContext | null,
    ) {
        const startedAt = new Date();
        const rollbackDeployment = await this.getDeploymentById(rollbackDeploymentId);
        const metadata = this.mergeMetadata(rollbackDeployment.metadata, {
            rollbackExecution: {
                status: "in_progress",
                rollbackId,
                startedAt: startedAt.toISOString(),
            },
            stage: "rollback",
        });

        await this.deploymentRepository.persistBuildArtifacts(rollbackDeploymentId, {
            status: "deploying",
            phase: "copying_files",
            phaseProgress: 65,
            metadata,
        });

        if (rollbackId) {
            await this.deploymentRepository.updateRollbackStatus(rollbackId, "in_progress", {
                startedAt,
            });
        }

        await this.deploymentRepository.insertLog(rollbackDeploymentId, {
            level: "info",
            message: "Rollback execution started",
            phase: "deploying",
            stage: "rollback",
            step: "rollback_start",
            correlationId: observability?.correlationId ?? rollbackDeploymentId,
            traceId: observability?.traceId,
            spanId: observability?.spanId,
            metadata: {
                rollbackId,
                fromDeploymentId,
                startedAt: startedAt.toISOString(),
                structured: true,
            },
        });
    }

    async persistRollbackExecutionResult(
        rollbackDeploymentId: string,
        rollbackId: string | null,
        fromDeploymentId: string | null,
        observability?: DeploymentObservabilityContext | null,
        result?: Record<string, unknown>,
    ) {
        const completedAt = this.getResultDate(result, "rollbackCompletedAt") ?? new Date();
        const rollbackDeployment = await this.getDeploymentById(rollbackDeploymentId);
        const metadata = this.mergeMetadata(rollbackDeployment.metadata, {
            rollbackExecution: {
                status: "completed",
                rollbackId,
                completedAt: completedAt.toISOString(),
            },
            stage: "active",
        });

        await this.deploymentRepository.persistBuildArtifacts(rollbackDeploymentId, {
            deployCompletedAt: completedAt,
            status: "success",
            phase: "active",
            phaseProgress: 100,
            metadata,
        });

        if (rollbackId) {
            await this.deploymentRepository.updateRollbackStatus(rollbackId, "completed", {
                completedAt,
                metadata: {
                    ...(rollbackDeployment.metadata ?? {}),
                    completedByQueue: true,
                },
            });
        }

        await this.deploymentRepository.insertLog(rollbackDeploymentId, {
            level: "info",
            message: "Rollback execution completed",
            phase: "active",
            stage: "rollback",
            step: "rollback_complete",
            correlationId: observability?.correlationId ?? rollbackDeploymentId,
            traceId: observability?.traceId,
            spanId: observability?.spanId,
            metadata: {
                rollbackId,
                fromDeploymentId,
                completedAt: completedAt.toISOString(),
                structured: true,
            },
        });

        if (fromDeploymentId) {
            this.deploymentEventService.emit(
                "rollbackCompleted",
                { serviceId: rollbackDeployment.serviceId },
                {
                    serviceId: rollbackDeployment.serviceId,
                    fromDeploymentId,
                    toDeploymentId: rollbackDeploymentId,
                    success: true,
                    timestamp: completedAt.toISOString(),
                },
            );
        }
    }

    async persistRollbackExecutionFailure(
        rollbackDeploymentId: string,
        rollbackId: string | null,
        fromDeploymentId: string | null,
        errorMessage: string,
    ) {
        const failedAt = new Date();
        const rollbackDeployment = await this.getDeploymentById(rollbackDeploymentId);
        const metadata = this.mergeMetadata(rollbackDeployment.metadata, {
            rollbackExecution: {
                status: "failed",
                rollbackId,
                failedAt: failedAt.toISOString(),
                error: errorMessage,
            },
            stage: "failed",
        });

        await this.deploymentRepository.updateStatus(rollbackDeploymentId, "failed", metadata);
        await this.deploymentRepository.updatePhase(rollbackDeploymentId, "failed", 100);

        if (rollbackId) {
            await this.deploymentRepository.updateRollbackStatus(rollbackId, "failed", {
                failedAt,
                errorMessage,
            });
        }

        await this.deploymentRepository.insertLog(rollbackDeploymentId, {
            level: "error",
            message: "Rollback execution failed",
            phase: "failed",
            stage: "rollback",
            step: "rollback_fail",
            metadata: {
                rollbackId,
                fromDeploymentId,
                errorMessage,
                failedAt: failedAt.toISOString(),
                structured: true,
            },
        });

        if (fromDeploymentId) {
            this.deploymentEventService.emit(
                "rollbackCompleted",
                { serviceId: rollbackDeployment.serviceId },
                {
                    serviceId: rollbackDeployment.serviceId,
                    fromDeploymentId,
                    toDeploymentId: rollbackDeploymentId,
                    success: false,
                    timestamp: failedAt.toISOString(),
                },
            );
        }
    }

    private async applyContainerLifecycle(
        deploymentId: string,
        artifact: BuildArtifactResult,
        result: Record<string, unknown> | undefined,
        observability?: DeploymentObservabilityContext | null,
    ) {
        const deployment = await this.getDeploymentById(deploymentId);
        const deployStartedAt = deployment.deployStartedAt ? new Date(deployment.deployStartedAt) : new Date();

        try {
            await this.deploymentRepository.insertLog(deploymentId, {
                level: "info",
                message: "Container lifecycle cleanup started",
                phase: "deploying",
                step: "cleanup",
                stage: "container_lifecycle",
                correlationId: observability?.correlationId ?? deploymentId,
                traceId: observability?.traceId,
                spanId: observability?.spanId,
                metadata: {
                    runner: this.resolveRuntimeRunnerKind(result),
                },
            });

            const runtimeResult = await this.runtimeRunnerRegistryService.execute(
                this.resolveRuntimeRunnerKind(result),
                {
                    deployment: {
                        deploymentId,
                        serviceId: deployment.serviceId,
                        deploymentContainerName: deployment.containerName,
                        deploymentContainerImage: deployment.containerImage,
                        healthCheckUrl: deployment.healthCheckUrl,
                    },
                    artifact,
                    healthGateConfig: this.resolveHealthGateConfig(result),
                    observability,
                },
            );

            const deployCompletedAt = new Date();
            const deployDuration = Math.max(0, deployCompletedAt.getTime() - deployStartedAt.getTime());

            const metadata = this.mergeMetadata(deployment.metadata, {
                containerLifecycle: {
                    status: "started",
                    containerId: runtimeResult.containerId,
                    containerName: runtimeResult.containerName,
                    containerImage: runtimeResult.containerImage,
                    startedAt: new Date().toISOString(),
                },
                routeVerification: runtimeResult.routeVerification,
                healthGate: runtimeResult.healthGate,
                deployDuration,
                stage: "active",
            });

            await this.deploymentRepository.persistBuildArtifacts(deploymentId, {
                deployStartedAt,
                deployCompletedAt,
                containerName: runtimeResult.containerName,
                containerImage: runtimeResult.containerImage,
                status: "success",
                phase: "active",
                phaseProgress: 100,
                metadata,
            });

            await this.deploymentRepository.insertLog(deploymentId, {
                level: "info",
                message: "Container lifecycle create/start completed",
                phase: "deploying",
                step: "start",
                stage: "container_lifecycle",
                correlationId: observability?.correlationId ?? deploymentId,
                traceId: observability?.traceId,
                spanId: observability?.spanId,
                metadata: {
                    containerId: runtimeResult.containerId,
                    containerName: runtimeResult.containerName,
                    containerImage: runtimeResult.containerImage,
                    deployStartedAt: deployStartedAt.toISOString(),
                    deployCompletedAt: deployCompletedAt.toISOString(),
                    durationMs: deployDuration,
                    structured: true,
                },
            });

            await this.deploymentRepository.insertLog(deploymentId, {
                level: "info",
                message: "Traefik route apply and verification completed",
                phase: "deploying",
                step: "route_verification",
                stage: "routing",
                correlationId: observability?.correlationId ?? deploymentId,
                traceId: observability?.traceId,
                spanId: observability?.spanId,
                metadata: runtimeResult.routeVerification,
            });
            await this.deploymentRepository.insertLog(deploymentId, {
                level: "info",
                message: "Readiness health gate passed",
                phase: "health_check",
                step: "readiness_gate",
                stage: "health",
                correlationId: observability?.correlationId ?? deploymentId,
                traceId: observability?.traceId,
                spanId: observability?.spanId,
                metadata: runtimeResult.healthGate,
            });
            await this.deploymentRepository.insertLog(deploymentId, {
                level: "info",
                message: "Deployment timeline persisted",
                phase: "active",
                step: "timeline",
                stage: "timeline",
                correlationId: observability?.correlationId ?? deploymentId,
                traceId: observability?.traceId,
                spanId: observability?.spanId,
                metadata: {
                    deployStartedAt: deployStartedAt.toISOString(),
                    deployCompletedAt: deployCompletedAt.toISOString(),
                    deployDuration,
                    structured: true,
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const metadata = this.mergeMetadata(deployment.metadata, {
                containerLifecycle: {
                    status: "failed",
                    error: message,
                    failedAt: new Date().toISOString(),
                },
            });

            await this.deploymentRepository.updateStatus(deploymentId, "failed", metadata);
            await this.deploymentRepository.insertLog(deploymentId, {
                level: "error",
                message: "Container lifecycle failed",
                phase: "failed",
                step: "container_lifecycle",
                stage: "container_lifecycle",
                metadata: {
                    error: message,
                },
            });

            throw new BadRequestException(`Container lifecycle failed: ${message}`);
        }
    }

    private resolveHealthGateConfig(result: Record<string, unknown> | undefined): HealthGateConfig {
        const maxRetries = this.getResultNumber(result, "healthCheckMaxRetries");
        const retryIntervalMs = this.getResultNumber(result, "healthCheckRetryIntervalMs");

        return {
            maxRetries:
                typeof maxRetries === "number" && Number.isInteger(maxRetries) && maxRetries > 0
                    ? maxRetries
                    : 10,
            retryIntervalMs:
                typeof retryIntervalMs === "number" && Number.isInteger(retryIntervalMs) && retryIntervalMs > 0
                    ? retryIntervalMs
                    : 2_000,
        };
    }

    private resolveRuntimeRunnerKind(result: Record<string, unknown> | undefined): string {
        const runtimeRunner = this.getResultString(result, "runtimeRunner");
        const buildRunner = this.getResultString(result, "buildRunner");
        return runtimeRunner ?? buildRunner ?? "docker";
    }

    private extractArtifactResult(result: Record<string, unknown> | undefined): BuildArtifactResult {
        const containerImage = this.getResultString(result, "containerImage");
        const containerName = this.getResultString(result, "containerName");
        const artifactDigest = this.getResultString(result, "artifactDigest");
        const buildLogsUrl = this.getResultString(result, "buildLogsUrl");
        const artifactSizeBytes = this.getResultNumber(result, "artifactSizeBytes");

        return {
            containerImage,
            containerName,
            artifactDigest,
            artifactSizeBytes,
            buildLogsUrl,
        };
    }

    private getResultString(result: Record<string, unknown> | undefined, key: string): string | null {
        const value = result?.[key];
        return typeof value === "string" && value.trim().length > 0 ? value : null;
    }

    private getResultNumber(result: Record<string, unknown> | undefined, key: string): number | null {
        const value = result?.[key];
        return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    private getResultDate(result: Record<string, unknown> | undefined, key: string): Date | undefined {
        const raw = this.getResultString(result, key);
        if (!raw) {
            return undefined;
        }

        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    private mergeMetadata(
        current: Record<string, unknown> | null,
        patch: Record<string, unknown>,
    ): Record<string, unknown> {
        return {
            ...(current ?? {}),
            ...patch,
        };
    }

    private async getDeploymentById(deploymentId: string) {
        const deployment = await this.deploymentRepository.findById(deploymentId);
        if (!deployment) {
            throw new NotFoundException(`Deployment with id '${deploymentId}' not found`);
        }
        return deployment;
    }
}
