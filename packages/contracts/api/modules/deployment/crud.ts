import * as z from "zod";
import { standard } from "@repo/orpc-utils";
import { route } from "@repo/orpc-utils/builder";
import {
    deploymentSchema,
    deploymentStatusSchema,
    deploymentEnvironmentSchema,
    sourceTypeSchema,
    deploymentLogSchema,
    deploymentRollbackSchema,
} from "@repo/api-contracts/common/deployment";

const deploymentOps = standard.zod(deploymentSchema, "deployment");

// ─── findById ────────────────────────────────────────────────────────────────

export const deploymentFindByIdContract = deploymentOps
    .read()
    .output((b) => b.entitySchema.nullable())
    .build();

// ─── delete ──────────────────────────────────────────────────────────────────

export const deploymentDeleteContract = deploymentOps.delete().build();

// ─── trigger ─────────────────────────────────────────────────────────────────

export const deploymentTriggerInputSchema = z.object({
    serviceId: z.uuid(),
    environment: deploymentEnvironmentSchema.default("production"),
    sourceType: sourceTypeSchema,
    sourceConfig: z
        .object({
            repositoryUrl: z.string().optional(),
            branch: z.string().optional(),
            commitSha: z.string().optional(),
            pullRequestNumber: z.number().int().positive().optional(),
            fileName: z.string().optional(),
            fileSize: z.number().optional(),
            customData: z.record(z.string(), z.unknown()).optional(),
        })
        .optional(),
});
export type DeploymentTriggerInput = z.infer<typeof deploymentTriggerInputSchema>;

export const deploymentTriggerContract = route({
    method: "POST",
    path: "/trigger",
    summary: "Trigger a new deployment",
})
    .input((b) => b.body(deploymentTriggerInputSchema))
    .output(
        z.object({
            deploymentId: z.string().uuid(),
            status: deploymentStatusSchema,
            message: z.string(),
        }),
    )
    .build();

// ─── cancel ──────────────────────────────────────────────────────────────────

export const deploymentCancelContract = route({
    method: "POST",
    path: "/{id}/cancel",
    summary: "Cancel a running deployment",
})
    .input((b) =>
        b
            .params((p) => p`/${p("id", z.string().uuid())}/cancel`)
            .body(z.object({ reason: z.string().optional() })),
    )
    .output(
        z.object({
            success: z.boolean(),
            message: z.string(),
            deploymentId: z.string().uuid(),
            cancelledAt: z.string(),
        }),
    )
    .build();

// ─── rollback ────────────────────────────────────────────────────────────────

export const deploymentRollbackContract = route({
    method: "POST",
    path: "/{id}/rollback",
    summary: "Roll back to a previous successful deployment",
})
    .input((b) =>
        b
            .params((p) => p`/${p("id", z.string().uuid())}/rollback`)
            .body(
                z.object({
                    targetDeploymentId: z.string().uuid(),
                    reason: z.string().optional(),
                }),
            ),
    )
    .output(
        z.object({
            rollbackDeploymentId: z.string().uuid(),
            message: z.string(),
        }),
    )
    .build();

// ─── getLogs ─────────────────────────────────────────────────────────────────

export const deploymentGetLogsContract = route({
    method: "GET",
    path: "/{id}/logs",
    summary: "Get deployment logs with pagination",
})
    .input((b) =>
        b
            .params((p) => p`/${p("id", z.string().uuid())}/logs`)
            .query(
                z.object({
                    limit: z.coerce.number().int().min(1).max(500).default(100),
                    offset: z.coerce.number().int().min(0).default(0),
                }),
            ),
    )
    .output(
        z.object({
            logs: z.array(deploymentLogSchema),
            total: z.number().int(),
            hasMore: z.boolean(),
        }),
    )
    .build();

// ─── retry ───────────────────────────────────────────────────────────────────

export const deploymentRetryContract = route({
    method: "POST",
    path: "/{id}/retry",
    summary: "Retry a failed or cancelled deployment with the same config",
})
    .input((b) => b.params((p) => p`/${p("id", z.string().uuid())}/retry`))
    .output(
        z.object({
            retryDeploymentId: z.string().uuid(),
            message: z.string(),
        }),
    )
    .build();

// ─── rollback history ────────────────────────────────────────────────────────

export const deploymentGetRollbackHistoryContract = route({
    method: "GET",
    path: "/{id}/rollbacks",
    summary: "Get rollback history for a deployment",
})
    .input((b) => b.params((p) => p`/${p("id", z.string().uuid())}/rollbacks`))
    .output(
        z.object({
            rollbacks: z.array(deploymentRollbackSchema),
        }),
    )
    .build();
