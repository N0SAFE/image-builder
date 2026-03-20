import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeploymentController } from './deployment.controller';
import { DeploymentService } from '../services/deployment.service';
import { SystemMeshTopologyService } from '@/core/modules/mesh/services/system-mesh-topology.service';

function createImplementMock() {
    type HandlerFn = (opts: { input: unknown; context: unknown }) => unknown;

    const chainable = {
        use: vi.fn().mockReturnThis(),
        handler: vi.fn((fn: HandlerFn) => ({ handler: fn })),
    };

    return chainable;
}

vi.mock('@orpc/nest', () => ({
    implement: vi.fn(() => createImplementMock()),
    Implement: vi.fn(() => () => {}),
}));

vi.mock('@/core/modules/auth/orpc/middlewares', () => ({
    requireAuth: vi.fn(() => ({})),
}));

describe('DeploymentController', () => {
    let controller: DeploymentController;
    let mockDeploymentService: {
        listDeployments: ReturnType<typeof vi.fn>;
        getDeploymentById: ReturnType<typeof vi.fn>;
        triggerDeployment: ReturnType<typeof vi.fn>;
        cancelDeployment: ReturnType<typeof vi.fn>;
        rollbackDeployment: ReturnType<typeof vi.fn>;
        getDeploymentLogs: ReturnType<typeof vi.fn>;
        deleteDeployment: ReturnType<typeof vi.fn>;
        retryDeployment: ReturnType<typeof vi.fn>;
        getRollbackHistory: ReturnType<typeof vi.fn>;
        getFilteredReplayEvents: ReturnType<typeof vi.fn>;
        getServiceReplayEvents: ReturnType<typeof vi.fn>;
        getDeploymentReplayEvents: ReturnType<typeof vi.fn>;
        getProjectServiceIds: ReturnType<typeof vi.fn>;
        streamDeploymentEvents: ReturnType<typeof vi.fn>;
        streamServiceEvents: ReturnType<typeof vi.fn>;
        streamQueryEvents: ReturnType<typeof vi.fn>;
        listStreamDefinitions: ReturnType<typeof vi.fn>;
        getStreamDefinitionById: ReturnType<typeof vi.fn>;
    };
    let mockMeshTopologyService: {
        getLocalNode: ReturnType<typeof vi.fn>;
        upsertResourceIndex: ReturnType<typeof vi.fn>;
        lookupResource: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
        mockDeploymentService = {
            listDeployments: vi.fn(),
            getDeploymentById: vi.fn(),
            triggerDeployment: vi.fn(),
            cancelDeployment: vi.fn(),
            rollbackDeployment: vi.fn(),
            getDeploymentLogs: vi.fn(),
            deleteDeployment: vi.fn(),
            retryDeployment: vi.fn(),
            getRollbackHistory: vi.fn(),
            getFilteredReplayEvents: vi.fn(),
            getServiceReplayEvents: vi.fn(),
            getDeploymentReplayEvents: vi.fn(),
            getProjectServiceIds: vi.fn(),
            streamDeploymentEvents: vi.fn(),
            streamServiceEvents: vi.fn(),
            streamQueryEvents: vi.fn(),
            listStreamDefinitions: vi.fn(),
            getStreamDefinitionById: vi.fn(),
        };

        mockMeshTopologyService = {
            getLocalNode: vi.fn(() => ({ nodeId: 'node-local' })),
            upsertResourceIndex: vi.fn(),
            lookupResource: vi.fn(() => ({ primary: null, candidates: [] })),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [DeploymentController],
            providers: [
                {
                    provide: DeploymentService,
                    useFactory: () => mockDeploymentService,
                },
                {
                    provide: SystemMeshTopologyService,
                    useFactory: () => mockMeshTopologyService,
                },
            ],
        }).compile();

        controller = module.get<DeploymentController>(DeploymentController);
        (controller as unknown as { deploymentService: typeof mockDeploymentService }).deploymentService =
            mockDeploymentService;
        (
            controller as unknown as { meshTopologyService: typeof mockMeshTopologyService }
        ).meshTopologyService = mockMeshTopologyService;
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('ORPC implementation methods', () => {
        const methods: Array<keyof DeploymentController> = [
            'list',
            'findById',
            'trigger',
            'cancel',
            'rollback',
            'getLogs',
            'delete',
            'retry',
            'getRollbackHistory',
            'stream',
            'streamService',
            'streamQuery',
            'streamsList',
            'streamFindById',
        ];

        for (const method of methods) {
            it(`${method} should return an implementation with a handler`, () => {
                const impl = (controller[method] as () => any)();
                expect(impl).toBeDefined();
                expect(typeof impl.handler).toBe('function');
            });
        }
    });

    describe('stream delegation', () => {
        it('stream should proxy to remote owner when lookup resolves a different mesh node', async () => {
            const textEncoder = new TextEncoder();
            const ssePayload =
                'data: {"type":"statusChanged","status":"queued","replayed":false,"sequence":1}\n\n';

            const responseBody = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(textEncoder.encode(ssePayload));
                    controller.close();
                },
            });

            const fetchSpy = vi
                .spyOn(globalThis, 'fetch')
                .mockResolvedValue(new Response(responseBody, { status: 200 }));

            mockMeshTopologyService.lookupResource.mockReturnValue({
                primary: {
                    kind: 'stream',
                    key: 'stream:deployment:00000000-0000-0000-0000-000000000010',
                    ownerNodeId: 'node-remote',
                    ownerServerUrl: 'http://remote-node:3005',
                    endpointPath: '/deployments/00000000-0000-0000-0000-000000000010/stream',
                },
                candidates: [],
            });

            const impl = controller.stream() as any;
            const returnedStream = impl.handler.call(controller, {
                input: {
                    params: { id: '00000000-0000-0000-0000-000000000010' },
                    query: { replay: true, replayLimit: 25 },
                },
                context: {
                    request: {
                        headers: new Headers({
                            authorization: 'Bearer test-token',
                            cookie: 'sid=abc',
                        }),
                    },
                },
            });

            const iterator = returnedStream[Symbol.asyncIterator]();
            const nextValue = await iterator.next();

            expect(nextValue.done).toBe(false);
            expect(nextValue.value).toEqual({
                type: 'statusChanged',
                status: 'queued',
                replayed: false,
                sequence: 1,
            });

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ href: 'http://remote-node:3005/deployments/00000000-0000-0000-0000-000000000010/stream?replay=true&replayLimit=25' }),
                expect.objectContaining({ method: 'GET' }),
            );
            expect(mockDeploymentService.streamDeploymentEvents).not.toHaveBeenCalled();
            expect(mockMeshTopologyService.upsertResourceIndex).toHaveBeenCalledTimes(1);

            fetchSpy.mockRestore();
        });

        it('streamQuery should delegate stream creation to deployment service', () => {
            const serviceStream = {
                async *[Symbol.asyncIterator]() {
                    await Promise.resolve();
                    yield { type: 'statusChanged', sequence: 1, replayed: true };
                },
            };
            mockDeploymentService.streamQueryEvents.mockReturnValue(serviceStream);

            const impl = controller.streamQuery() as any;
            const returned = impl.handler.call(controller, {
                input: {
                    query: {
                        deploymentId: '00000000-0000-0000-0000-000000000001',
                        replay: true,
                        replayLimit: 10,
                    },
                },
                context: {},
            });

            expect(mockDeploymentService.streamQueryEvents).toHaveBeenCalledWith({
                deploymentId: '00000000-0000-0000-0000-000000000001',
                serviceId: undefined,
                projectId: undefined,
                replay: true,
                replayLimit: 10,
            });
            expect(returned).toBe(serviceStream);
        });
    });

});
