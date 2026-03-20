import { BadRequestException, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import { BaseEventService, type AnyEventEmission, type EventSubscription } from "@/core/modules/events/base-event.service";
import type { EventContracts, EventInput, EventOutput } from "@/core/modules/events/event-contract.builder";
import type { MeshControlEnvelope, MeshResourceLocation, MeshResourceLookupResult } from "@repo/api-contracts/common/mesh";
import { SystemMeshTopologyService } from "./system-mesh-topology.service";

interface MeshTopicReplayOptions {
    replayLimit?: number;
    includePersisted?: boolean;
}

interface MeshTopicRequestOptions {
    organizationId?: string | null;
    timeoutMs?: number;
    traceId?: string;
    partitionKey?: string;
}

interface MeshTopicQueryOptions<TInput> extends MeshTopicReplayOptions {
    fuzzy?: string;
    predicate?: (input: TInput) => boolean;
}

export interface MeshTopicPublishOptions {
    organizationId?: string | null;
    traceId?: string;
    partitionKey?: string;
    propagate?: boolean;
}

export interface MeshTopicNamespaceDefinition<TContracts extends EventContracts> {
    namespace: string;
    contracts: TContracts;
    organizationId?: string | null;
}

export interface MeshTopicNamespaceHandle<TContracts extends EventContracts> {
    readonly namespace: string;
    readonly topics: (keyof TContracts & string)[];
    publish<K extends keyof TContracts>(
        topic: K,
        input: EventInput<TContracts[K]>,
        output: EventOutput<TContracts[K]>,
        options?: MeshTopicPublishOptions,
    ): void;
    subscribe<K extends keyof TContracts>(
        topic: K,
        input: EventInput<TContracts[K]>,
        options?: MeshTopicReplayOptions,
    ): EventSubscription<TContracts[K]>;
    observe$<K extends keyof TContracts>(
        topic: K,
        input: EventInput<TContracts[K]>,
        options?: MeshTopicReplayOptions,
    ): Observable<EventOutput<TContracts[K]>>;
    queryByInput$<K extends keyof TContracts>(
        topic: K,
        options?: MeshTopicQueryOptions<EventInput<TContracts[K]>>,
    ): Observable<AnyEventEmission<TContracts[K]>>;
    lookupRoute<K extends keyof TContracts>(
        topic: K,
        options?: { organizationId?: string | null; includeCandidates?: boolean },
    ): MeshResourceLookupResult;
    request<KRequest extends keyof TContracts, KResponse extends keyof TContracts>(
        requestTopic: KRequest,
        responseTopic: KResponse,
        input: EventInput<TContracts[KRequest]>,
        options?: MeshTopicRequestOptions,
    ): Promise<EventOutput<TContracts[KResponse]>>;
    registerQueryHandler<KRequest extends keyof TContracts, KResponse extends keyof TContracts>(
        requestTopic: KRequest,
        responseTopic: KResponse,
        handler: (input: EventInput<TContracts[KRequest]>) =>
            | EventOutput<TContracts[KResponse]>
            | Promise<EventOutput<TContracts[KResponse]>>,
    ): () => void;
}

class MeshTopicNamespaceRuntime<TContracts extends EventContracts> extends BaseEventService<TContracts> {
    constructor(namespace: string, contracts: TContracts) {
        super(`mesh-topic:${namespace}`, contracts);
    }

    protected override buildFullEventName(eventName: string, input: Record<string, unknown>): string {
        const organizationId =
            typeof input.organizationId === "string" && input.organizationId.length > 0
                ? input.organizationId
                : "__global__";

        return `${this.namespace}:${eventName}:${organizationId}`;
    }

    parseInput<K extends keyof TContracts>(topic: K, input: unknown): unknown {
        const contract = this.contracts[topic];
        if (!contract) {
            throw new BadRequestException(`Topic contract '${String(topic)}' is not registered in namespace '${this.namespace}'`);
        }

        const parsed: unknown = contract.input.parse(input);
        return parsed;
    }

    parseOutput<K extends keyof TContracts>(topic: K, output: unknown): unknown {
        const contract = this.contracts[topic];
        if (!contract) {
            throw new BadRequestException(`Topic contract '${String(topic)}' is not registered in namespace '${this.namespace}'`);
        }

        const parsed: unknown = contract.output.parse(output);
        return parsed;
    }
}

interface PendingMeshQuery {
    namespace: string;
    responseTopic: string;
    runtime: MeshTopicNamespaceRuntime<EventContracts>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
}

interface MeshQueryHandlerRegistration {
    namespace: string;
    requestTopic: string;
    responseTopic: string;
    runtime: MeshTopicNamespaceRuntime<EventContracts>;
    handler: (input: unknown) => Promise<unknown>;
}

@Injectable()
export class SystemMeshTopicService implements OnModuleInit, OnModuleDestroy {
    private readonly runtimes = new Map<string, MeshTopicNamespaceRuntime<EventContracts>>();
    private readonly queryHandlers = new Map<string, MeshQueryHandlerRegistration>();
    private readonly pendingQueries = new Map<string, PendingMeshQuery>();
    private unsubscribeFromMesh: (() => void) | null = null;

    constructor(private readonly meshTopologyService: SystemMeshTopologyService) {}

    onModuleInit(): void {
        this.unsubscribeFromMesh = this.meshTopologyService.registerControlEnvelopeHandler((envelope) => {
            this.handleMeshEnvelope(envelope);
        });
    }

    onModuleDestroy(): void {
        this.unsubscribeFromMesh?.();
        this.unsubscribeFromMesh = null;

        for (const pending of this.pendingQueries.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new Error("mesh_topic_service_shutdown"));
        }
        this.pendingQueries.clear();
    }

    registerNamespace<TContracts extends EventContracts>(
        definition: MeshTopicNamespaceDefinition<TContracts>,
    ): MeshTopicNamespaceHandle<TContracts> {
        const namespace = definition.namespace.trim();
        if (!namespace) {
            throw new BadRequestException("Mesh topic namespace is required");
        }

        if (this.runtimes.has(namespace)) {
            throw new BadRequestException(`Mesh topic namespace '${namespace}' already registered`);
        }

        const topicNames = Object.keys(definition.contracts);
        if (topicNames.length === 0) {
            throw new BadRequestException(`Mesh topic namespace '${namespace}' must declare at least one topic contract`);
        }

        const runtime = new MeshTopicNamespaceRuntime(namespace, definition.contracts);
        this.runtimes.set(namespace, runtime as MeshTopicNamespaceRuntime<EventContracts>);

        this.indexNamespaceTopics(namespace, topicNames, definition.organizationId ?? null);

        return this.createNamespaceHandle(namespace, runtime, topicNames as (keyof TContracts & string)[]);
    }

    hasNamespace(namespace: string): boolean {
        return this.runtimes.has(namespace);
    }

    private createNamespaceHandle<TContracts extends EventContracts>(
        namespace: string,
        runtime: MeshTopicNamespaceRuntime<TContracts>,
        topicNames: (keyof TContracts & string)[],
    ): MeshTopicNamespaceHandle<TContracts> {
        return {
            namespace,
            topics: topicNames,
            publish: (topic, input, output, options) => {
                runtime.emit(topic, input, output);

                if (options?.propagate === false) {
                    return;
                }

                const localNode = this.meshTopologyService.getLocalNode();
                this.meshTopologyService.publishControlEnvelope({
                    envelopeId: randomUUID(),
                    organizationId: options?.organizationId ?? null,
                    type: "event_publish",
                    sourceNodeId: localNode.nodeId,
                    targetNodeId: null,
                    partitionKey: options?.partitionKey,
                    traceId: options?.traceId,
                    hop: 0,
                    maxHops: 16,
                    emittedAt: new Date().toISOString(),
                    payload: {
                        namespace,
                        topic: String(topic),
                        input,
                        output,
                    },
                });
            },
            subscribe: (topic, input, options) => runtime.subscribe(topic, input, options),
            observe$: (topic, input, options) => runtime.subscribe$(topic, input, options),
            queryByInput$: (topic, options) => runtime.queryByInput$(topic, options),
            lookupRoute: (topic, options) => {
                return this.meshTopologyService.lookupResource({
                    organizationId: options?.organizationId ?? null,
                    kind: "topic",
                    key: this.buildTopicResourceKey(namespace, String(topic)),
                    includeCandidates: options?.includeCandidates ?? true,
                });
            },
            request: (requestTopic, responseTopic, input, options) =>
                this.requestOverMesh(
                    namespace,
                    runtime as MeshTopicNamespaceRuntime<EventContracts>,
                    String(requestTopic),
                    String(responseTopic),
                    input as unknown,
                    options,
                ) as Promise<EventOutput<TContracts[typeof responseTopic]>>,
            registerQueryHandler: (requestTopic, responseTopic, handler) =>
                this.registerQueryHandler(
                    namespace,
                    runtime as MeshTopicNamespaceRuntime<EventContracts>,
                    String(requestTopic),
                    String(responseTopic),
                    async (input) => {
                        const typedInput = input as EventInput<TContracts[typeof requestTopic]>;
                        const typedOutput = await handler(typedInput);
                        return typedOutput as unknown;
                    },
                ),
        };
    }

    private indexNamespaceTopics(namespace: string, topics: string[], organizationId: string | null): void {
        const localNode = this.meshTopologyService.getLocalNode();
        const now = new Date().toISOString();
        const serverUrl = this.resolveLocalServerUrl();

        const resources: MeshResourceLocation[] = topics.map((topic) => ({
            organizationId,
            kind: "topic",
            key: this.buildTopicResourceKey(namespace, topic),
            ownerNodeId: localNode.nodeId,
            ownerServerUrl: serverUrl,
            endpointPath: `/internal/mesh/topics/${namespace}/${topic}`,
            endpointMethod: "POST",
            protocol: "ws",
            persistentConnectionRequired: true,
            priority: 50,
            version: 1,
            updatedAt: now,
            metadata: {
                namespace,
                topic,
            },
        }));

        this.meshTopologyService.upsertResourceIndex({
            organizationId,
            sourceNodeId: localNode.nodeId,
            resources,
            replaceExistingForSource: false,
        });
    }

    private buildTopicResourceKey(namespace: string, topic: string): string {
        return `topic:${namespace}:${topic}`;
    }

    private resolveLocalServerUrl(): string {
        const candidate = process.env.APP_URL?.trim() ?? "http://localhost:3001";

        try {
            return new URL(candidate).origin;
        } catch {
            return "http://localhost:3001";
        }
    }

    private handleMeshEnvelope(envelope: MeshControlEnvelope): void {
        if (envelope.type !== "event_publish") {
            return;
        }

        const localNode = this.meshTopologyService.getLocalNode();
        if (envelope.sourceNodeId === localNode.nodeId) {
            return;
        }

        const payload = envelope.payload;
        const kind = typeof payload.kind === "string" ? payload.kind : "topic_event";
        if (kind === "topic_query_request") {
            this.handleMeshQueryRequest(envelope);
            return;
        }

        if (kind === "topic_query_response") {
            this.handleMeshQueryResponse(envelope);
            return;
        }

        this.handleMeshTopicEvent(envelope);
    }

    private handleMeshTopicEvent(envelope: MeshControlEnvelope): void {
        const payload = envelope.payload;
        const namespace = typeof payload.namespace === "string" ? payload.namespace : null;
        const topic = typeof payload.topic === "string" ? payload.topic : null;

        if (!namespace || !topic) {
            return;
        }

        const runtime = this.runtimes.get(namespace);
        if (!runtime) {
            return;
        }

        try {
            runtime.emit(topic as never, payload.input as never, payload.output as never);
        } catch {
            // Ignore incompatible/malformed envelope payloads; contract validation happens in runtime.emit.
        }
    }

    private registerQueryHandler(
        namespace: string,
        runtime: MeshTopicNamespaceRuntime<EventContracts>,
        requestTopic: string,
        responseTopic: string,
        handler: (input: unknown) => Promise<unknown>,
    ): () => void {
        const key = this.queryHandlerKey(namespace, requestTopic);
        this.queryHandlers.set(key, {
            namespace,
            requestTopic,
            responseTopic,
            runtime,
            handler,
        });

        return () => {
            const current = this.queryHandlers.get(key);
            if (current?.handler === handler) {
                this.queryHandlers.delete(key);
            }
        };
    }

    private requestOverMesh(
        namespace: string,
        runtime: MeshTopicNamespaceRuntime<EventContracts>,
        requestTopic: string,
        responseTopic: string,
        input: unknown,
        options?: MeshTopicRequestOptions,
    ): Promise<unknown> {
        const queryId = randomUUID();
        const localNode = this.meshTopologyService.getLocalNode();
        const timeoutMs = options?.timeoutMs ?? 8_000;

        const validatedInput: unknown = runtime.parseInput(requestTopic as never, input);

        return new Promise<unknown>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingQueries.delete(queryId);
                reject(new Error(`mesh_topic_query_timeout:${namespace}:${responseTopic}`));
            }, timeoutMs);

            this.pendingQueries.set(queryId, {
                namespace,
                responseTopic,
                runtime,
                resolve,
                reject,
                timeout,
            });

            this.meshTopologyService.publishControlEnvelope({
                envelopeId: randomUUID(),
                organizationId: options?.organizationId ?? null,
                type: "event_publish",
                sourceNodeId: localNode.nodeId,
                targetNodeId: null,
                partitionKey: options?.partitionKey,
                traceId: options?.traceId,
                hop: 0,
                maxHops: 16,
                emittedAt: new Date().toISOString(),
                payload: {
                    kind: "topic_query_request",
                    queryId,
                    namespace,
                    requestTopic,
                    responseTopic,
                    input: validatedInput,
                },
            });
        });
    }

    private handleMeshQueryRequest(envelope: MeshControlEnvelope): void {
        const payload = envelope.payload;
        const namespace = typeof payload.namespace === "string" ? payload.namespace : null;
        const requestTopic = typeof payload.requestTopic === "string" ? payload.requestTopic : null;
        const responseTopic = typeof payload.responseTopic === "string" ? payload.responseTopic : null;
        const queryId = typeof payload.queryId === "string" ? payload.queryId : null;

        if (!namespace || !requestTopic || !responseTopic || !queryId) {
            return;
        }

        const registration = this.queryHandlers.get(this.queryHandlerKey(namespace, requestTopic));
        if (!registration) {
            return;
        }

        let parsedInput: unknown;
        try {
            parsedInput = registration.runtime.parseInput(requestTopic as never, payload.input);
        } catch {
            return;
        }

        void registration.handler(parsedInput)
            .then((output) => registration.runtime.parseOutput(responseTopic as never, output))
            .then((validatedOutput) => {
                const localNode = this.meshTopologyService.getLocalNode();
                this.meshTopologyService.publishControlEnvelope({
                    envelopeId: randomUUID(),
                    organizationId: envelope.organizationId ?? null,
                    type: "event_publish",
                    sourceNodeId: localNode.nodeId,
                    targetNodeId: envelope.sourceNodeId,
                    partitionKey: envelope.partitionKey,
                    traceId: envelope.traceId,
                    hop: 0,
                    maxHops: 16,
                    emittedAt: new Date().toISOString(),
                    payload: {
                        kind: "topic_query_response",
                        queryId,
                        namespace,
                        responseTopic,
                        output: validatedOutput,
                    },
                });
            })
            .catch(() => {
                // Swallow handler/validation failures for now; response timeout covers caller behavior.
            });
    }

    private handleMeshQueryResponse(envelope: MeshControlEnvelope): void {
        const payload = envelope.payload;
        const queryId = typeof payload.queryId === "string" ? payload.queryId : null;
        const namespace = typeof payload.namespace === "string" ? payload.namespace : null;
        const responseTopic = typeof payload.responseTopic === "string" ? payload.responseTopic : null;

        if (!queryId || !namespace || !responseTopic) {
            return;
        }

        const pending = this.pendingQueries.get(queryId);
        if (!pending) {
            return;
        }

        if (pending.namespace !== namespace || pending.responseTopic !== responseTopic) {
            return;
        }

        try {
            const validated: unknown = pending.runtime.parseOutput(responseTopic as never, payload.output);
            clearTimeout(pending.timeout);
            this.pendingQueries.delete(queryId);
            pending.resolve(validated);
        } catch {
            clearTimeout(pending.timeout);
            this.pendingQueries.delete(queryId);
            pending.reject(new Error("mesh_topic_query_invalid_response"));
        }
    }

    private queryHandlerKey(namespace: string, requestTopic: string): string {
        return `${namespace}:${requestTopic}`;
    }
}
