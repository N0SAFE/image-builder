import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import z from "zod/v4";
import { contractBuilder } from "@/core/modules/events/event-contract.builder";
import { SystemMeshTopicService } from "./system-mesh-topic.service";
import type { SystemMeshTopologyService } from "./system-mesh-topology.service";

describe("SystemMeshTopicService", () => {
    const createTopologyStub = () => {
        let onEnvelope: ((envelope: unknown) => void) | null = null;
        const localNode = {
            nodeId: randomUUID(),
            clusterId: randomUUID(),
            region: "local",
            roles: ["edge"] as const,
            lifecycleState: "healthy" as const,
            routingMode: "balanced" as const,
            consistencyMode: "hybrid" as const,
            version: "test",
            startedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            metadata: null,
        };

        return {
            getLocalNode: vi.fn(() => localNode),
            upsertResourceIndex: vi.fn(() => ({
                accepted: true,
                sourceNodeId: localNode.nodeId,
                upserted: 0,
                replaced: 0,
            })),
            publishControlEnvelope: vi.fn(() => ({
                accepted: true,
                envelopeId: randomUUID(),
                forwardedTo: [],
            })),
            lookupResource: vi.fn(() => ({
                found: false,
                query: {
                    organizationId: null,
                    kind: "topic",
                    key: "",
                    includeCandidates: true,
                },
                primary: null,
                candidates: [],
            })),
            registerControlEnvelopeHandler: vi.fn((handler: (envelope: unknown) => void) => {
                onEnvelope = handler;
                return () => {
                    onEnvelope = null;
                };
            }),
            __emitEnvelope: (envelope: unknown) => {
                onEnvelope?.(envelope);
            },
        } as unknown as Pick<
            SystemMeshTopologyService,
            "getLocalNode" | "upsertResourceIndex" | "publishControlEnvelope" | "lookupResource" | "registerControlEnvelopeHandler"
        > & {
            __emitEnvelope: (envelope: unknown) => void;
        };
    };

    it("registers namespace and indexes topic resources", () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();

        const handle = service.registerNamespace({
            namespace: "deployments",
            contracts: {
                statusChanged: contractBuilder()
                    .input(
                        z.object({
                            organizationId: z.string().uuid().nullable().optional(),
                            deploymentId: z.string().uuid(),
                        }),
                    )
                    .output(
                        z.object({
                            state: z.enum(["queued", "running", "failed", "succeeded"]),
                        }),
                    )
                    .build(),
            },
        });

        expect(handle.namespace).toBe("deployments");
        expect(handle.topics).toEqual(["statusChanged"]);
        expect(topology.upsertResourceIndex).toHaveBeenCalledTimes(1);
    });

    it("publishes locally and propagates through mesh envelope by default", () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();
        const handle = service.registerNamespace({
            namespace: "search",
            contracts: {
                indexUpdated: contractBuilder()
                    .input(z.object({ organizationId: z.string().uuid().nullable().optional(), topic: z.string() }))
                    .output(z.object({ affected: z.number().int().min(0) }))
                    .build(),
            },
        });

        handle.publish(
            "indexUpdated",
            { topic: "projects" },
            { affected: 3 },
            { organizationId: randomUUID() },
        );

        expect(topology.publishControlEnvelope).toHaveBeenCalledTimes(1);
        expect(topology.publishControlEnvelope).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "event_publish",
                payload: expect.objectContaining({
                    namespace: "search",
                    topic: "indexUpdated",
                }),
            }),
        );
    });

    it("supports type-safe observe subscription and lookup route", () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();
        const handle = service.registerNamespace({
            namespace: "internal-search",
            contracts: {
                query: contractBuilder()
                    .input(
                        z.object({
                            organizationId: z.string().uuid().nullable().optional(),
                            q: z.string(),
                        }),
                    )
                    .output(
                        z.object({
                            ids: z.array(z.string().uuid()),
                        }),
                    )
                    .build(),
            },
        });

        const seen: string[][] = [];
        const subscription = handle.observe$("query", { q: "repo" }).subscribe((event) => {
            seen.push(event.ids);
        });

        const id = randomUUID();
        handle.publish("query", { q: "repo" }, { ids: [id] }, { propagate: false });
        subscription.unsubscribe();

        expect(seen).toEqual([[id]]);

        handle.lookupRoute("query", { organizationId: null, includeCandidates: true });
        expect(topology.lookupResource).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: "topic",
                key: "topic:internal-search:query",
            }),
        );
    });

    it("consumes remote event_publish envelopes and dispatches typed topic payloads", () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();

        const handle = service.registerNamespace({
            namespace: "search",
            contracts: {
                queryResult: contractBuilder()
                    .input(z.object({ organizationId: z.string().uuid().nullable().optional(), query: z.string() }))
                    .output(z.object({ matches: z.array(z.string()) }))
                    .build(),
            },
        });

        const received: string[][] = [];
        const sub = handle.observe$("queryResult", { query: "deploy" }).subscribe((output) => {
            received.push(output.matches);
        });

        topology.__emitEnvelope({
            envelopeId: randomUUID(),
            organizationId: null,
            type: "event_publish",
            sourceNodeId: randomUUID(),
            targetNodeId: null,
            hop: 0,
            maxHops: 16,
            emittedAt: new Date().toISOString(),
            payload: {
                namespace: "search",
                topic: "queryResult",
                input: { query: "deploy" },
                output: { matches: ["svc-1", "svc-2"] },
            },
        });

        sub.unsubscribe();
        service.onModuleDestroy();

        expect(received).toEqual([["svc-1", "svc-2"]]);
    });

    it("supports typed request/reply over mesh envelopes", async () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();

        const handle = service.registerNamespace({
            namespace: "query",
            contracts: {
                findProject: contractBuilder()
                    .input(z.object({ query: z.string() }))
                    .output(z.object({ ids: z.array(z.string()) }))
                    .build(),
                findProjectResult: contractBuilder()
                    .input(z.object({ query: z.string() }))
                    .output(z.object({ ids: z.array(z.string()) }))
                    .build(),
            },
        });

        const localNode = topology.getLocalNode();
        const pendingPromise = handle.request("findProject", "findProjectResult", { query: "api" }, { timeoutMs: 500 });

        const publishMock = topology.publishControlEnvelope as unknown as ReturnType<typeof vi.fn>;
        const publishCalls = publishMock.mock.calls;
        expect(publishCalls.length).toBeGreaterThan(0);
        const lastPublish = publishCalls.at(-1);
        if (!lastPublish) {
            throw new Error("Expected a request envelope publish call");
        }

        const requestEnvelope = lastPublish[0] as {
            payload: { queryId: string };
        };

        topology.__emitEnvelope({
            envelopeId: randomUUID(),
            organizationId: null,
            type: "event_publish",
            sourceNodeId: randomUUID(),
            targetNodeId: localNode.nodeId,
            hop: 0,
            maxHops: 16,
            emittedAt: new Date().toISOString(),
            payload: {
                kind: "topic_query_response",
                queryId: requestEnvelope.payload.queryId,
                namespace: "query",
                responseTopic: "findProjectResult",
                output: { ids: ["project-1"] },
            },
        });

        await expect(pendingPromise).resolves.toEqual({ ids: ["project-1"] });
    });

    it("executes registered query handler and publishes response envelope", async () => {
        const topology = createTopologyStub();
        const service = new SystemMeshTopicService(topology as unknown as SystemMeshTopologyService);
        service.onModuleInit();

        const handle = service.registerNamespace({
            namespace: "search",
            contracts: {
                findService: contractBuilder()
                    .input(z.object({ q: z.string() }))
                    .output(z.object({ results: z.array(z.string()) }))
                    .build(),
                findServiceResult: contractBuilder()
                    .input(z.object({ q: z.string() }))
                    .output(z.object({ results: z.array(z.string()) }))
                    .build(),
            },
        });

        handle.registerQueryHandler("findService", "findServiceResult", (input) => ({
            results: [`${input.q}:svc`],
        }));

        const remoteNodeId = randomUUID();
        topology.__emitEnvelope({
            envelopeId: randomUUID(),
            organizationId: null,
            type: "event_publish",
            sourceNodeId: remoteNodeId,
            targetNodeId: null,
            hop: 0,
            maxHops: 16,
            emittedAt: new Date().toISOString(),
            payload: {
                kind: "topic_query_request",
                queryId: randomUUID(),
                namespace: "search",
                requestTopic: "findService",
                responseTopic: "findServiceResult",
                input: { q: "mesh" },
            },
        });

        await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 0);
        });

        expect(topology.publishControlEnvelope).toHaveBeenCalledWith(
            expect.objectContaining({
                targetNodeId: remoteNodeId,
                payload: expect.objectContaining({
                    kind: "topic_query_response",
                    namespace: "search",
                    responseTopic: "findServiceResult",
                }),
            }),
        );
    });
});
