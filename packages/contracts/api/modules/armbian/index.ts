import { oc } from "@orpc/contract";
import { route } from "@repo/orpc-utils/builder";
import z from "zod/v4";

export const armbianReleaseSchema = z.enum(["bookworm", "bullseye", "jammy", "noble"]);

export const armbianConfigValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const armbianFieldTypeSchema = z.enum(["text", "password", "number", "boolean", "select", "textarea"]);

export const armbianFieldOptionSchema = z.object({
    label: z.string(),
    value: armbianConfigValueSchema,
});

export const armbianFieldVisibilitySchema = z.object({
    fieldKey: z.string(),
    equals: armbianConfigValueSchema,
});

export const armbianFormFieldSchema = z.object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
    type: armbianFieldTypeSchema,
    required: z.boolean(),
    placeholder: z.string().optional(),
    defaultValue: armbianConfigValueSchema.optional(),
    options: z.array(armbianFieldOptionSchema).optional(),
    visibleWhen: armbianFieldVisibilitySchema.optional(),
});

export const armbianPluginDependencySchema = z.object({
    pluginId: z.string(),
    reason: z.string().optional(),
});

export const armbianPluginDefinitionSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(["runtime", "service", "tooling", "custom"]),
    dependencies: z.array(armbianPluginDependencySchema),
    fields: z.array(armbianFormFieldSchema),
});

export const armbianBuildFormSchema = z.object({
    version: z.string(),
    coreFields: z.array(armbianFormFieldSchema),
    plugins: z.array(armbianPluginDefinitionSchema),
});

export const armbianPluginSelectionSchema = z.object({
    pluginId: z.string().min(1),
    config: z.record(z.string(), armbianConfigValueSchema).optional(),
});

export const armbianBuildRequestSchema = z.object({
    board: z.string().min(1),
    release: armbianReleaseSchema,
    branch: z.string().min(1).optional(),
    buildMinimal: z.boolean().optional(),
    buildDesktop: z.boolean().optional(),
    kernelConfigure: z.boolean().optional(),
    kernelBtf: z.boolean().optional(),
    wifiSsid: z.string().optional(),
    wifiPassword: z.string().optional(),
    hostname: z.string().optional(),
    timezone: z.string().optional(),
    username: z.string().optional(),
    userPassword: z.string().optional(),
    plugins: z.array(armbianPluginSelectionSchema).optional(),
});

export const armbianBuildStatusSchema = z.enum([
    "queued",
    "running",
    "success",
    "failed",
    "not_found",
]);

export const armbianArtifactSchema = z.object({
    fileName: z.string(),
    filePath: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.string(),
});

export const armbianBuildDetailsSchema = z.object({
    buildId: z.uuid(),
    status: armbianBuildStatusSchema,
    containerId: z.string().nullable(),
    containerName: z.string().nullable(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    exitCode: z.number().int().nullable(),
    artifacts: z.array(armbianArtifactSchema),
});

export const armbianBuildStreamEventSchema = z.object({
    buildId: z.uuid(),
    status: armbianBuildStatusSchema,
    step: z.string(),
    stepIndex: z.number().int().nonnegative(),
    totalSteps: z.number().int().positive(),
    logsTail: z.string(),
    artifacts: z.array(armbianArtifactSchema),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    updatedAt: z.string(),
});

export const armbianBuildRecordSchema = z.object({
    buildId: z.uuid(),
    details: armbianBuildDetailsSchema,
    request: armbianBuildRequestSchema.nullable(),
});

export const armbianBuildStartResultSchema = z.object({
    buildId: z.uuid(),
    containerId: z.string(),
    containerName: z.string(),
    workspaceDir: z.string(),
    artifactsDir: z.string(),
    startedAt: z.string(),
});

export const armbianDeleteBuildResultSchema = z.object({
    buildId: z.uuid(),
    deleted: z.boolean(),
    stoppedRunningContainer: z.boolean(),
});

export const armbianCreateBuildContract = route({
    method: "POST",
    path: "/builds",
    summary: "Create and start an Armbian build",
})
    .input((b) => b.body(armbianBuildRequestSchema))
    .output((b) => b.body(armbianBuildStartResultSchema))
    .build();

export const armbianGetBuildFormConfigContract = route({
    method: "GET",
    path: "/form-config",
    summary: "Get dynamic Armbian build form configuration",
})
    .input(z.object({}))
    .output((b) => b.body(armbianBuildFormSchema))
    .build();

export const armbianListBuildsContract = route({
    method: "GET",
    path: "/builds",
    summary: "List recent Armbian builds",
})
    .input((b) =>
        b.query(
            z.object({
                limit: z.coerce.number().int().positive().max(200).optional(),
            }),
        ),
    )
    .output((b) => b.body(z.array(armbianBuildRecordSchema)))
    .build();

export const armbianGetBuildContract = route({
    method: "GET",
    path: "/builds/{buildId}",
    summary: "Get Armbian build details",
})
    .input((b) => b.params((p) => p`/builds/${p("buildId", z.uuid())}`))
    .output((b) => b.body(armbianBuildDetailsSchema))
    .build();

export const armbianDeleteBuildContract = route({
    method: "DELETE",
    path: "/builds/{buildId}",
    summary: "Delete Armbian build data and stop/remove its worker container",
})
    .input((b) => b.params((p) => p`/builds/${p("buildId", z.uuid())}`))
    .output((b) => b.body(armbianDeleteBuildResultSchema))
    .build();

export const armbianGetBuildLogsContract = route({
    method: "GET",
    path: "/builds/{buildId}/logs",
    summary: "Get Armbian build logs",
})
    .input((b) =>
        b
            .params((p) => p`/builds/${p("buildId", z.uuid())}/logs`)
            .query(
                z.object({
                    tail: z.coerce.number().int().positive().max(5000).optional(),
                }),
            ),
    )
    .output((b) =>
        b.body(
            z.object({
                buildId: z.uuid(),
                tail: z.number().int().positive(),
                logs: z.string(),
            }),
        ),
    )
    .build();

export const armbianListArtifactsContract = route({
    method: "GET",
    path: "/builds/{buildId}/artifacts",
    summary: "List Armbian build artifacts",
})
    .input((b) => b.params((p) => p`/builds/${p("buildId", z.uuid())}/artifacts`))
    .output((b) =>
        b.body(
            z.object({
                buildId: z.uuid(),
                artifacts: z.array(armbianArtifactSchema),
            }),
        ),
    )
    .build();

export const armbianBuildStreamContract = route({
    method: "GET",
    path: "/builds/{buildId}/stream",
    summary: "Stream Armbian build events",
})
    .input((b) =>
        b
            .params((p) => p`/builds/${p("buildId", z.uuid())}/stream`)
            .query(
                z.object({
                    intervalMs: z.coerce.number().int().positive().max(10000).optional(),
                    tail: z.coerce.number().int().positive().max(5000).optional(),
                }),
            ),
    )
    .output((b) => b.streamed(armbianBuildStreamEventSchema))
    .build();

export const armbianContract = oc.tag("Armbian").prefix("/armbian").router({
    getBuildFormConfig: armbianGetBuildFormConfigContract,
    createBuild: armbianCreateBuildContract,
    listBuilds: armbianListBuildsContract,
    getBuild: armbianGetBuildContract,
    deleteBuild: armbianDeleteBuildContract,
    getBuildLogs: armbianGetBuildLogsContract,
    listArtifacts: armbianListArtifactsContract,
    streamBuild: armbianBuildStreamContract,
});

export type ArmbianContract = typeof armbianContract;
