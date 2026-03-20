import type { DeploymentObservabilityContext } from "@repo/api-contracts/common/deployment";

export interface BuildArtifactResult {
    containerImage: string | null;
    containerName: string | null;
    artifactDigest: string | null;
    artifactSizeBytes: number | null;
    buildLogsUrl: string | null;
}

export interface HealthGateConfig {
    maxRetries: number;
    retryIntervalMs: number;
}

export interface RuntimeDeploymentContext {
    deploymentId: string;
    serviceId: string;
    deploymentContainerName: string | null;
    deploymentContainerImage: string | null;
    healthCheckUrl: string | null;
}

export interface RuntimeExecutionInput {
    deployment: RuntimeDeploymentContext;
    artifact: BuildArtifactResult;
    healthGateConfig: HealthGateConfig;
    observability?: DeploymentObservabilityContext | null;
}

export interface RuntimeExecutionResult {
    containerId: string;
    containerName: string;
    containerImage: string;
    routeVerification: {
        applied: boolean;
        syncResult: {
            configId: string;
            configName: string;
            action: string;
            message: string;
            syncedAt: string | null;
        };
        healthSummary: unknown;
        verifiedAt: string;
    };
    healthGate: {
        passed: true;
        containerId: string;
        healthCheckUrl: string | null;
        maxRetries: number;
        retryIntervalMs: number;
        verifiedAt: string;
    };
}

export interface DeploymentRuntimeRunner {
    readonly runnerKinds: readonly string[];
    executeRuntime(input: RuntimeExecutionInput): Promise<RuntimeExecutionResult>;
}
