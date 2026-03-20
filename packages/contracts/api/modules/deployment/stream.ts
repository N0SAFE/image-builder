import * as z from "zod";
import { route } from "@repo/orpc-utils/builder";
import { createFilterConfig, standard, type ComputeInputSchema } from "@repo/orpc-utils";
import {
    deploymentConnectivityStatusSchema,
    deploymentExecutionProgressSchema,
    deploymentSchema,
    deploymentStatusSchema,
    deploymentPhaseSchema,
    deploymentEnvironmentSchema,
    deploymentLogSchema,
    deploymentStreamSchema,
    deploymentStreamEventTypeSchema,
} from "@repo/api-contracts/common/deployment";

const streamEventMetaShape = {
    sequence: z.number().int().nonnegative().optional(),
    replayed: z.boolean().optional(),
    emittedAt: z.string().optional(),
    correlationId: z.string().optional(),
    traceId: z.string().optional(),
    spanId: z.string().optional(),
    connectionId: z.string().optional(),
} as const;

// ─── Per-deployment event schema ──────────────────────────────────────────────
// Discriminated union of all events emitted for a single deployment.

export const deploymentProgressEventSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("statusChanged"),
        status: deploymentStatusSchema,
        phase: deploymentPhaseSchema.optional(),
        phaseProgress: z.number().int().min(0).max(100).optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("phaseUpdated"),
        phase: deploymentPhaseSchema,
        phaseProgress: z.number().int().min(0).max(100),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("logAppended"),
        log: deploymentLogSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("cancelled"),
        reason: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("rollbackStarted"),
        rollbackDeploymentId: z.string().uuid(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("rollbackCompleted"),
        rollbackDeploymentId: z.string().uuid(),
        ...streamEventMetaShape,
    }),
    z.object({ type: z.literal("completed"), ...streamEventMetaShape }),
    z.object({
        type: z.literal("progressSnapshot"),
        progress: deploymentExecutionProgressSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("connectivityChanged"),
        connectivityStatus: deploymentConnectivityStatusSchema,
        reason: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("failed"),
        errorMessage: z.string().optional(),
        ...streamEventMetaShape,
    }),
]);
export type DeploymentProgressEvent = z.infer<typeof deploymentProgressEventSchema>;

// ─── Per-service event schema ─────────────────────────────────────────────────
// Discriminated union of all deployment lifecycle events for a service.

export const serviceDeploymentEventSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("deploymentTriggered"),
        deployment: deploymentSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("statusChanged"),
        deploymentId: z.string().uuid(),
        status: deploymentStatusSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("deploymentCompleted"),
        deploymentId: z.string().uuid(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("deploymentFailed"),
        deploymentId: z.string().uuid(),
        errorMessage: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("deploymentCancelled"),
        deploymentId: z.string().uuid(),
        reason: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("connectivityChanged"),
        deploymentId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
        connectivityStatus: deploymentConnectivityStatusSchema,
        ...streamEventMetaShape,
    }),
]);
export type ServiceDeploymentEvent = z.infer<typeof serviceDeploymentEventSchema>;

// ─── Filtered query event schema ──────────────────────────────────────────────

export const deploymentQueryEventSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("deploymentTriggered"),
        deployment: deploymentSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("statusChanged"),
        deploymentId: z.string().uuid(),
        serviceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: deploymentStatusSchema,
        environment: deploymentEnvironmentSchema.optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("phaseUpdated"),
        deploymentId: z.string().uuid(),
        phase: deploymentPhaseSchema,
        phaseProgress: z.number().int().min(0).max(100),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("logAppended"),
        log: deploymentLogSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("deploymentCancelled"),
        deploymentId: z.string().uuid(),
        reason: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("rollbackStarted"),
        fromDeploymentId: z.string().uuid(),
        rollbackDeploymentId: z.string().uuid(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("rollbackCompleted"),
        fromDeploymentId: z.string().uuid(),
        rollbackDeploymentId: z.string().uuid(),
        success: z.boolean(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("healthCheckUpdated"),
        serviceId: z.string().uuid(),
        deploymentId: z.string().uuid().optional(),
        status: z.enum(["healthy", "degraded", "unhealthy"]),
        message: z.string().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("domainRouteUpdated"),
        serviceId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        domain: z.string(),
        action: z.enum(["created", "updated", "deleted", "synced"]),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("metricsSnapshot"),
        deploymentId: z.string().uuid(),
        cpuPercent: z.number().min(0).max(100).optional(),
        memoryMb: z.number().nonnegative().optional(),
        networkRxBytes: z.number().nonnegative().optional(),
        networkTxBytes: z.number().nonnegative().optional(),
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("progressSnapshot"),
        deploymentId: z.string().uuid(),
        serviceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        progress: deploymentExecutionProgressSchema,
        ...streamEventMetaShape,
    }),
    z.object({
        type: z.literal("connectivityChanged"),
        deploymentId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        connectivityStatus: deploymentConnectivityStatusSchema,
        reason: z.string().optional(),
        ...streamEventMetaShape,
    }),
]);
export type DeploymentQueryEvent = z.infer<typeof deploymentQueryEventSchema>;

const streamReplayQuerySchema = z.object({
    replay: z.coerce.boolean().default(false),
    replayLimit: z.coerce.number().int().min(1).max(500).default(100),
});

const deploymentQueryFiltersSchema = z
    .object({
        deploymentId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        replay: z.coerce.boolean().default(false),
        replayLimit: z.coerce.number().int().min(1).max(500).default(100),
    })
    .refine(
        (value) => Boolean(value.deploymentId || value.serviceId || value.projectId),
        "At least one stream filter is required (deploymentId, serviceId, or projectId)",
    );

const deploymentStreamOps = standard.zod(deploymentStreamSchema, "deploymentStream");

const deploymentStreamListConfig = createFilterConfig(deploymentStreamOps)
    .withPagination({
        defaultLimit: 20,
        maxLimit: 100,
        includeOffset: true,
    } as const)
    .withSorting(["createdAt", "updatedAt", "name"] as const, {
        defaultField: "createdAt",
        defaultDirection: "desc",
    })
    .withFiltering({
        name: {
            schema: deploymentStreamSchema.shape.name,
            operators: ["eq", "like", "ilike"] as const,
        },
        isActive: {
            schema: deploymentStreamSchema.shape.isActive,
            operators: ["eq"] as const,
        },
        deploymentId: {
            schema: deploymentStreamSchema.shape.deploymentId,
            operators: ["eq"] as const,
        },
        serviceId: {
            schema: deploymentStreamSchema.shape.serviceId,
            operators: ["eq"] as const,
        },
        projectId: {
            schema: deploymentStreamSchema.shape.projectId,
            operators: ["eq"] as const,
        },
        statusFilter: {
            schema: deploymentStreamSchema.shape.statusFilter,
            operators: ["eq"] as const,
        },
        environmentFilter: {
            schema: deploymentStreamSchema.shape.environmentFilter,
            operators: ["eq"] as const,
        },
        createdBy: {
            schema: deploymentStreamSchema.shape.createdBy,
            operators: ["eq"] as const,
        },
    })
    .buildConfig();

export const deploymentStreamListConfigSchemas = deploymentStreamListConfig;
export const deploymentStreamsListContract = deploymentStreamOps.list(deploymentStreamListConfig).build();
export type DeploymentStreamListInput = ComputeInputSchema<typeof deploymentStreamListConfigSchemas>;

export const deploymentStreamFindByIdContract = deploymentStreamOps.read().build();

// ─── Stream contracts ─────────────────────────────────────────────────────────

/** GET /deployments/{id}/stream — subscribe to a single deployment's lifecycle events */
export const deploymentStreamContract = route({
    method: "GET",
    path: "/{id}/stream",
    summary: "Stream deployment progress events (SSE)",
    description: "Subscribe to real-time events for a specific deployment: status changes, phase updates, log lines, and terminal states.",
})
    .input((b) =>
        b
            .params((p) => p`/${p("id", z.string().uuid())}/stream`)
            .query(streamReplayQuerySchema),
    )
    .output((b) => b.streamed(deploymentProgressEventSchema))
    .build();

/** GET /deployments/services/{serviceId}/stream — subscribe to all deployments for a service */
export const serviceDeploymentsStreamContract = route({
    method: "GET",
    path: "/services/{serviceId}/stream",
    summary: "Stream all deployment events for a service (SSE)",
    description: "Subscribe to real-time deployment lifecycle events for all deployments of a service.",
})
    .input((b) =>
        b
            .params((p) => p`/services/${p("serviceId", z.string().uuid())}/stream`)
            .query(streamReplayQuerySchema),
    )
    .output((b) => b.streamed(serviceDeploymentEventSchema))
    .build();

/** GET /deployments/stream/query — subscribe to filtered deployment events */
export const deploymentQueryStreamContract = route({
    method: "GET",
    path: "/stream/query",
    summary: "Stream deployment events with filters (SSE)",
    description:
        "Subscribe to deployment events filtered by deploymentId/serviceId/projectId, with optional replay.",
})
    .input((b) => b.query(deploymentQueryFiltersSchema))
    .output((b) => b.streamed(deploymentQueryEventSchema))
    .build();

