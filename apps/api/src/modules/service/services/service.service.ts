import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { EMPTY, type Observable, concat, defer, from, map, mergeMap } from "rxjs";
import { filter as rxFilter } from "rxjs/operators";
import { observableToAsyncIterable } from "@/core/utils/observable.utils";
import { CoreEventSyncService } from "@/core/modules/events";
import { ServiceRepository } from "../repositories/service.repository";
import { ProjectRepository } from "../../project/repositories/project.repository";
import { ServiceEventService } from "./service-event.service";
import type { ServiceListInput } from "@repo/api-contracts/modules/service/list";
import type { ServiceCreateInput, ServiceUpdateInput } from "@repo/api-contracts/modules/service/crud";
import type {
    ServiceStreamEvent,
    ServiceStreamQueryInput,
} from "@repo/api-contracts/modules/service/stream";

type StreamEventWithMeta<T extends object> = T & {
    sequence: number;
    replayed: boolean;
    emittedAt: string;
};

@Injectable()
export class ServiceService {
    constructor(
        private readonly serviceRepository: ServiceRepository,
        private readonly serviceEventService: ServiceEventService,
        private readonly coreEventSyncService: CoreEventSyncService,
        private readonly projectRepository: ProjectRepository,
    ) {
        this.coreEventSyncService.registerNamespaceAdapter("service", ({ definition, replay, replayLimit }) =>
            this.toCoreAdapterStream(definition, replay, replayLimit),
        );
    }

    private async assertProjectAccess(projectId: string, requesterId: string, allowedRoles: string[]) {
        const project = await this.projectRepository.findById(projectId);
        if (!project) {
            throw new NotFoundException(`Project ${projectId} not found`);
        }
        if (project.ownerId === requesterId) {
            return project;
        }
        const collaborator = await this.projectRepository.findCollaboratorByUserAndProject(requesterId, projectId);
        if (!collaborator || !allowedRoles.includes(collaborator.role)) {
            throw new ForbiddenException("You do not have permission to perform this action");
        }
        return project;
    }

    private async assertServiceAccess(serviceId: string, requesterId: string, allowedRoles: string[]) {
        const service = await this.serviceRepository.findById(serviceId);
        if (!service) {
            throw new NotFoundException(`Service ${serviceId} not found`);
        }
        await this.assertProjectAccess(service.projectId, requesterId, allowedRoles);
        return service;
    }

    async listServices(input: ServiceListInput) {
        return this.serviceRepository.list(input);
    }

    async getServiceById(id: string) {
        const service = await this.serviceRepository.findById(id);
        if (!service) {
            throw new NotFoundException(`Service ${id} not found`);
        }
        return service;
    }

    async createService(
        input: ServiceCreateInput,
        requesterId: string,
    ) {
        await this.assertProjectAccess(input.projectId, requesterId, ["owner", "admin", "developer"]);
        const created = await this.serviceRepository.create(input);
        const timestamp = new Date().toISOString();
        this.serviceEventService.emit(
            "serviceCreated",
            { projectId: created.projectId },
            {
                serviceId: created.id,
                projectId: created.projectId,
                name: created.name,
                type: created.type,
                isActive: created.isActive,
                timestamp,
            },
        );
        return created;
    }

    async updateService(id: string, input: Omit<ServiceUpdateInput, 'id'>, requesterId: string) {
        const existing = await this.assertServiceAccess(id, requesterId, ["owner", "admin", "developer"]);
        const updated = await this.serviceRepository.update(id, input);
        if (!updated) {
            throw new NotFoundException(`Service ${id} not found`);
        }

        const changedFields = Object.keys(input).filter(
            (key) => (input as Record<string, unknown>)[key] !== undefined,
        );
        this.serviceEventService.emit(
            "serviceUpdated",
            { serviceId: id },
            {
                serviceId: id,
                projectId: updated.projectId,
                changedFields,
                timestamp: new Date().toISOString(),
            },
        );
        return updated;
    }

    async deleteService(id: string, requesterId: string) {
        const existing = await this.assertServiceAccess(id, requesterId, ["owner", "admin"]);
        await this.serviceRepository.delete(id);

        this.serviceEventService.emit(
            "serviceDeleted",
            { serviceId: id },
            {
                serviceId: id,
                projectId: existing.projectId,
                timestamp: new Date().toISOString(),
            },
        );
    }

    async toggleActive(id: string, isActive: boolean, requesterId: string) {
        const existing = await this.assertServiceAccess(id, requesterId, ["owner", "admin", "developer"]);
        const updated = await this.serviceRepository.toggleActive(id, isActive);
        if (!updated) {
            throw new NotFoundException(`Service ${id} not found`);
        }

        this.serviceEventService.emit(
            "serviceActivationChanged",
            { serviceId: id },
            {
                serviceId: id,
                projectId: updated.projectId,
                isActive: updated.isActive,
                timestamp: new Date().toISOString(),
            },
        );
        return updated;
    }

    async getDependencies(serviceId: string) {
        await this.getServiceById(serviceId);
        const dependencies = await this.serviceRepository.getDependencies(serviceId);
        return { dependencies };
    }

    async addDependency(serviceId: string, dependsOnServiceId: string, isRequired: boolean, requesterId: string) {
        if (serviceId === dependsOnServiceId) {
            throw new BadRequestException("A service cannot depend on itself");
        }
        await this.assertServiceAccess(serviceId, requesterId, ["owner", "admin", "developer"]);
        await this.getServiceById(dependsOnServiceId);

        const exists = await this.serviceRepository.dependencyExists(serviceId, dependsOnServiceId);
        if (exists) {
            throw new ConflictException("Dependency already exists");
        }
        const created = await this.serviceRepository.addDependency(serviceId, dependsOnServiceId, isRequired);
        this.serviceEventService.emit(
            "serviceDependencyAdded",
            { serviceId },
            {
                serviceId,
                dependsOnServiceId,
                isRequired,
                timestamp: new Date().toISOString(),
            },
        );
        return created;
    }

    async removeDependency(serviceId: string, dependencyId: string, requesterId: string) {
        await this.assertServiceAccess(serviceId, requesterId, ["owner", "admin", "developer"]);
        await this.serviceRepository.removeDependency(dependencyId, serviceId);

        this.serviceEventService.emit(
            "serviceDependencyRemoved",
            { serviceId },
            {
                serviceId,
                dependencyId,
                timestamp: new Date().toISOString(),
            },
        );
    }

    streamQueryEvents(input: ServiceStreamQueryInput): AsyncIterable<StreamEventWithMeta<ServiceStreamEvent>> {
        let query = this.coreEventSyncService.selectMany({
            service: this.serviceEventService,
            selections: [
                { eventName: "serviceCreated" },
                { eventName: "serviceUpdated" },
                { eventName: "serviceDeleted" },
                { eventName: "serviceActivationChanged" },
                { eventName: "serviceDependencyAdded" },
                { eventName: "serviceDependencyRemoved" },
            ] as const,
        });

        if (input.eventTypes && input.eventTypes.length > 0) {
            const accepted = new Set(input.eventTypes);
            query = query.whereEventName((eventName) => accepted.has(eventName as never));
        }

        if (input.serviceId) {
            query = query.wherePayload((payload) => {
                const value = payload as { serviceId?: string };
                return value.serviceId === input.serviceId;
            });
        }

        if (input.projectId) {
            query = query.wherePayload((payload) => {
                const value = payload as { projectId?: string };
                return value.projectId === input.projectId;
            });
        }

        if (input.serviceType) {
            query = query.wherePayload((payload) => {
                const value = payload as { type?: string };
                return value.type === input.serviceType;
            });
        }

        if (input.isActive !== undefined) {
            query = query.wherePayload((payload) => {
                const value = payload as { isActive?: boolean };
                return value.isActive === input.isActive;
            });
        }

        if (input.fuzzy) {
            query = query.whereFuzzy(input.fuzzy);
        }

        const live$ = query
            .execute()
            .pipe(
                map((row) => this.toServiceStreamEvent(row.service)),
                rxFilter((event): event is ServiceStreamEvent => event !== null),
            );

        return this.toSequencedAsyncIterable({
            replay$: input.replay
                ? defer(() => from(this.getReplayEvents(input))).pipe(mergeMap((events) => from(events)))
                : EMPTY,
            live$,
        });
    }

    private async getReplayEvents(input: ServiceStreamQueryInput): Promise<ServiceStreamEvent[]> {
        const list = await this.serviceRepository.list({
            limit: input.replayLimit,
            offset: 0,
            filter: {
                ...(input.projectId ? { projectId: { value: input.projectId, operator: "eq" as const } } : {}),
                ...(input.serviceType ? { type: { value: input.serviceType, operator: "eq" as const } } : {}),
                ...(input.fuzzy ? { name: { value: input.fuzzy, operator: "ilike" as const } } : {}),
            },
            sortBy: "updatedAt",
            sortDirection: "desc",
        });

        let events = list.data
            .filter((service) => !input.serviceId || service.id === input.serviceId)
            .filter((service) => input.isActive === undefined || service.isActive === input.isActive)
            .map((service) => ({
                type: "serviceCreated" as const,
                serviceId: service.id,
                projectId: service.projectId,
                name: service.name,
                serviceType: service.type,
                isActive: service.isActive,
                timestamp: service.updatedAt,
            }));

        if (input.eventTypes && input.eventTypes.length > 0) {
            const accepted = new Set(input.eventTypes);
            events = events.filter((event) => accepted.has(event.type));
        }

        return events.slice(0, input.replayLimit);
    }

    private toServiceStreamEvent(
        envelope: {
            eventName: string;
            payload: unknown;
        } | null,
    ): ServiceStreamEvent | null {
        if (!envelope) return null;

        switch (envelope.eventName) {
            case "serviceCreated": {
                const payload = envelope.payload as {
                    serviceId: string;
                    projectId: string;
                    name: string;
                    type: string;
                    isActive: boolean;
                    timestamp: string;
                };
                return {
                    type: "serviceCreated",
                    serviceId: payload.serviceId,
                    projectId: payload.projectId,
                    name: payload.name,
                    serviceType: payload.type,
                    isActive: payload.isActive,
                    timestamp: payload.timestamp,
                };
            }
            case "serviceUpdated": {
                return {
                    type: "serviceUpdated",
                    ...(envelope.payload as {
                        serviceId: string;
                        projectId: string;
                        changedFields: string[];
                        timestamp: string;
                    }),
                };
            }
            case "serviceDeleted": {
                return {
                    type: "serviceDeleted",
                    ...(envelope.payload as {
                        serviceId: string;
                        projectId: string;
                        timestamp: string;
                    }),
                };
            }
            case "serviceActivationChanged": {
                return {
                    type: "serviceActivationChanged",
                    ...(envelope.payload as {
                        serviceId: string;
                        projectId: string;
                        isActive: boolean;
                        timestamp: string;
                    }),
                };
            }
            case "serviceDependencyAdded": {
                return {
                    type: "serviceDependencyAdded",
                    ...(envelope.payload as {
                        serviceId: string;
                        dependsOnServiceId: string;
                        isRequired: boolean;
                        timestamp: string;
                    }),
                };
            }
            case "serviceDependencyRemoved": {
                return {
                    type: "serviceDependencyRemoved",
                    ...(envelope.payload as {
                        serviceId: string;
                        dependencyId: string;
                        timestamp: string;
                    }),
                };
            }
            default:
                return null;
        }
    }

    private toSequencedAsyncIterable<TEvent extends object>(input: {
        replay$: Observable<TEvent>;
        live$: Observable<TEvent>;
    }): AsyncIterable<StreamEventWithMeta<TEvent>> {
        let sequence = 0;
        const stream$ = concat(
            input.replay$.pipe(map((event) => ({ event, replayed: true }))),
            input.live$.pipe(map((event) => ({ event, replayed: false }))),
        ).pipe(
            map(({ event, replayed }) => {
                sequence += 1;
                return {
                    ...event,
                    sequence,
                    replayed,
                    emittedAt: new Date().toISOString(),
                } as StreamEventWithMeta<TEvent>;
            }),
        );

        return observableToAsyncIterable(stream$);
    }

    private toCoreAdapterStream(
        definition: {
            scope: "global" | "tenant" | "project" | "service" | "deployment";
            scopeId: string | null;
            filters: Record<string, unknown> | null;
        },
        replay: boolean,
        replayLimit: number,
    ): AsyncIterable<{ eventName: string; payload: unknown; replayed?: boolean; emittedAt?: string }> {
        const filters = definition.filters ?? {};
        const scopedServiceId = definition.scope === "service" ? definition.scopeId ?? undefined : undefined;
        const scopedProjectId = definition.scope === "project" ? definition.scopeId ?? undefined : undefined;

        const source = this.streamQueryEvents({
            serviceId: typeof filters.serviceId === "string" ? filters.serviceId : scopedServiceId,
            projectId: typeof filters.projectId === "string" ? filters.projectId : scopedProjectId,
            serviceType: typeof filters.serviceType === "string" ? filters.serviceType : undefined,
            isActive: typeof filters.isActive === "boolean" ? filters.isActive : undefined,
            eventTypes: Array.isArray(filters.eventTypes)
                ? filters.eventTypes.filter((v): v is ServiceStreamEvent["type"] => typeof v === "string")
                : undefined,
            fuzzy: typeof filters.fuzzy === "string" ? filters.fuzzy : undefined,
            replay,
            replayLimit,
        });

        return {
            async *[Symbol.asyncIterator]() {
                for await (const event of source) {
                    yield {
                        eventName: event.type,
                        payload: event,
                        replayed: event.replayed,
                        emittedAt: event.emittedAt,
                    };
                }
            },
        } as AsyncIterable<{ eventName: string; payload: unknown; replayed?: boolean; emittedAt?: string }>;
    }
}
