import z from "zod/v4";

export const coreEventScopeSchema = z.enum(["global", "tenant", "project", "service", "deployment"]);
export type CoreEventScope = z.infer<typeof coreEventScopeSchema>;

export const coreEventStreamDefinitionSchema = z.object({
    id: z.uuid(),
    name: z.string().min(1),
    namespace: z.string().min(1),
    description: z.string().nullable(),
    isActive: z.boolean(),
    scope: coreEventScopeSchema,
    scopeId: z.string().nullable(),
    filters: z.record(z.string(), z.unknown()).nullable(),
    replayDefault: z.boolean(),
    replayLimitDefault: z.number().int().min(1).max(500),
    createdBy: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type CoreEventStreamDefinition = z.infer<typeof coreEventStreamDefinitionSchema>;

export const coreSyncedEventEnvelopeSchema = z.object({
    streamId: z.uuid(),
    namespace: z.string(),
    eventName: z.string(),
    payload: z.unknown(),
    sequence: z.number().int().nonnegative().optional(),
    replayed: z.boolean().optional(),
    emittedAt: z.string().optional(),
});
export type CoreSyncedEventEnvelope = z.infer<typeof coreSyncedEventEnvelopeSchema>;
