import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import type Docker from "dockerode";
import { DockerService } from "../docker/docker.service";
import {
    buildArmbianCustomizeImageScript,
    getArmbianBuildFormConfig,
    resolveArmbianPluginExecutionPlan,
} from "./plugin-system";
import type {
    ArmbianArtifact,
    ArmbianDeleteBuildResult,
    ArmbianBuildDetails,
    ArmbianBuildFormConfig,
    ArmbianBuildMetadata,
    ArmbianBuildRecord,
    ArmbianBuilderServiceOptions,
    ArmbianBuildRequest,
    ArmbianBuildStartResult,
    ArmbianBuildStatus,
} from "./types";

@Injectable()
export class ArmbianBuilderService {
    private readonly logger = new Logger(ArmbianBuilderService.name);
    private readonly workerImage: string;
    private readonly storageRootPath: string;
    private readonly workspaceRootPath: string;
    private readonly cloneDepth: number;
    private readonly buildEntrypoint: string;
    private readonly metadataFileName = "build.metadata.json";
    private selfContainerMountsCache: Array<{ source: string; destination: string }> | null = null;

    constructor(
        private readonly dockerService: DockerService,
        options?: ArmbianBuilderServiceOptions,
    ) {
        this.workerImage = options?.workerImage ?? "ghcr.io/armbian/docker-armbian-build:armbian-ubuntu-noble-latest";
        this.storageRootPath = options?.storageRootPath ?? "/tmp/armbian-storage";
        this.workspaceRootPath = options?.workspaceRootPath ?? "/tmp/armbian-workspaces";
        this.cloneDepth = options?.cloneDepth ?? 1;
        this.buildEntrypoint = options?.buildEntrypoint?.trim() || "auto";

        fs.mkdirSync(this.storageRootPath, { recursive: true });
        fs.mkdirSync(this.workspaceRootPath, { recursive: true });
    }

    async startBuild(request: ArmbianBuildRequest): Promise<ArmbianBuildStartResult> {
        this.assertRequest(request);

        const buildId = randomUUID();
        const workspaceDir = path.join(this.workspaceRootPath, buildId);
        const buildSourceDir = path.join(workspaceDir, "armbian-build");
        const artifactsDir = path.join(this.storageRootPath, buildId);
        fs.mkdirSync(workspaceDir, { recursive: true });
        fs.mkdirSync(artifactsDir, { recursive: true });

        await this.ensureBuildSources(buildSourceDir);
        this.writeCustomizeImageScript(buildSourceDir, request);

        const buildCommand = this.resolveBuildCommand(request, buildSourceDir);

        await this.dockerService.pullImage(this.workerImage);

        const containerName = `armbian-build-${buildId.slice(0, 12)}`;
        const docker = this.dockerService.getDockerClient();
        const workspaceBindSource = await this.resolveDockerBindSource(workspaceDir);
        const artifactsBindSource = await this.resolveDockerBindSource(artifactsDir);

        const container = await docker.createContainer({
            Image: this.workerImage,
            name: containerName,
            Cmd: buildCommand,
            WorkingDir: "/workspace/armbian-build",
            HostConfig: {
                AutoRemove: false,
                Binds: [
                    `${workspaceBindSource}:/workspace`,
                    `${artifactsBindSource}:/workspace/armbian-build/output/images`,
                ],
            },
            Labels: {
                "armbian.build_id": buildId,
                "armbian.managed": "true",
                "armbian.board": request.board,
                "armbian.release": request.release,
            },
        });

        await container.start();
        const containerInfo = await container.inspect();
        this.logger.log(`Armbian build started id=${buildId} container=${containerInfo.Id}`);

        const startedAt = new Date().toISOString();
        this.writeBuildMetadata(buildId, {
            buildId,
            request,
            startedAt,
            containerId: containerInfo.Id,
            containerName,
            workspaceDir,
            artifactsDir,
        });

        return {
            buildId,
            containerId: containerInfo.Id,
            containerName,
            workspaceDir,
            artifactsDir,
            startedAt,
        };
    }

    getBuildFormConfig(): ArmbianBuildFormConfig {
        return getArmbianBuildFormConfig();
    }

    async listBuilds(limit = 50): Promise<ArmbianBuildRecord[]> {
        if (!fs.existsSync(this.storageRootPath)) {
            return [];
        }

        const buildIds = fs
            .readdirSync(this.storageRootPath)
            .filter((entry) => {
                const fullPath = path.join(this.storageRootPath, entry);
                return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
            })
            .sort((a, b) => {
                const aTime = fs.statSync(path.join(this.storageRootPath, a)).mtimeMs;
                const bTime = fs.statSync(path.join(this.storageRootPath, b)).mtimeMs;
                return bTime - aTime;
            })
            .slice(0, Math.max(1, limit));

        const records = await Promise.all(
            buildIds.map(async (buildId) => {
                const details = await this.getBuild(buildId);
                const metadata = this.readBuildMetadata(buildId);
                return {
                    buildId,
                    details,
                    request: metadata?.request ?? null,
                } satisfies ArmbianBuildRecord;
            }),
        );

        return records;
    }

    async deleteBuild(buildId: string): Promise<ArmbianDeleteBuildResult> {
        const docker = this.dockerService.getDockerClient();
        const containerInfo = await this.findBuildContainer(buildId);

        let stoppedRunningContainer = false;

        if (containerInfo) {
            const container = docker.getContainer(containerInfo.Id);

            if (containerInfo.State?.Running) {
                try {
                    await container.stop({ t: 10 });
                    stoppedRunningContainer = true;
                } catch (error) {
                    this.logger.warn(`Failed to stop running container for build ${buildId}: ${String(error)}`);
                }
            }

            try {
                await container.remove({ force: true, v: true });
            } catch (error) {
                this.logger.warn(`Failed to remove container for build ${buildId}: ${String(error)}`);
            }
        }

        const metadata = this.readBuildMetadata(buildId);
        const fallbackWorkspaceDir = path.join(this.workspaceRootPath, buildId);
        const fallbackArtifactsDir = path.join(this.storageRootPath, buildId);

        const removedWorkspace = this.removeDirectoryIfExists(metadata?.workspaceDir ?? fallbackWorkspaceDir);
        const removedArtifacts = this.removeDirectoryIfExists(metadata?.artifactsDir ?? fallbackArtifactsDir);

        return {
            buildId,
            deleted: Boolean(containerInfo) || removedWorkspace || removedArtifacts,
            stoppedRunningContainer,
        };
    }

    async getBuild(buildId: string): Promise<ArmbianBuildDetails> {
        const containerInfo = await this.findBuildContainer(buildId);
        const artifacts = this.listArtifacts(buildId);

        if (!containerInfo) {
            return {
                buildId,
                status: artifacts.length > 0 ? "success" : "not_found",
                containerId: null,
                containerName: null,
                startedAt: null,
                finishedAt: null,
                exitCode: null,
                artifacts,
            };
        }

        const state = containerInfo.State;
        const status = this.mapContainerStateToStatus(state, artifacts.length > 0);
        return {
            buildId,
            status,
            containerId: containerInfo.Id,
            containerName: containerInfo.Name,
            startedAt: state.StartedAt ?? null,
            finishedAt: state.FinishedAt ?? null,
            exitCode: typeof state.ExitCode === "number" ? state.ExitCode : null,
            artifacts,
        };
    }

    async getBuildLogs(buildId: string, tail = 400): Promise<string> {
        const containerInfo = await this.findBuildContainer(buildId);
        if (!containerInfo) {
            return "Build container not found";
        }

        return this.dockerService.getContainerLogs(containerInfo.Id, {
            stdout: true,
            stderr: true,
            tail,
        });
    }

    listArtifacts(buildId: string): ArmbianArtifact[] {
        const artifactsDir = path.join(this.storageRootPath, buildId);
        if (!fs.existsSync(artifactsDir)) {
            return [];
        }

        return fs
            .readdirSync(artifactsDir)
            .map((fileName) => {
                const filePath = path.join(artifactsDir, fileName);
                const stats = fs.statSync(filePath);
                return {
                    fileName,
                    filePath,
                    sizeBytes: stats.size,
                    createdAt: stats.birthtime.toISOString(),
                } satisfies ArmbianArtifact;
            })
            .filter((artifact) => artifact.fileName.endsWith(".img") || artifact.fileName.endsWith(".img.xz"));
    }

    private async findBuildContainer(buildId: string): Promise<Docker.ContainerInspectInfo | null> {
        const docker = this.dockerService.getDockerClient();
        const containers = await docker.listContainers({
            all: true,
            filters: {
                label: [`armbian.build_id=${buildId}`],
            },
        });

        const first = containers[0];
        if (!first) {
            return null;
        }

        const container = docker.getContainer(first.Id);
        return container.inspect();
    }

    private mapContainerStateToStatus(
        state: Docker.ContainerInspectInfo["State"],
        hasArtifacts: boolean,
    ): ArmbianBuildStatus {
        if (state.Running) {
            return "running";
        }

        if (typeof state.ExitCode === "number") {
            if (state.ExitCode === 0) {
                return hasArtifacts ? "success" : "failed";
            }
            return "failed";
        }

        return "queued";
    }

    private assertRequest(request: ArmbianBuildRequest): void {
        if (!request.board || request.board.trim().length === 0) {
            throw new Error("board is required");
        }
        if (!request.release || request.release.trim().length === 0) {
            throw new Error("release is required");
        }

        // Validate plugin selections and dependency graph early.
        resolveArmbianPluginExecutionPlan(request.plugins);
    }

    private resolveBuildCommand(request: ArmbianBuildRequest, buildSourceDir: string): string[] {
        const branch = request.branch ?? "current";
        const board = request.board;
        const release = request.release;
        const buildMinimal = request.buildMinimal ? "yes" : "no";
        const buildDesktop = request.buildDesktop ? "yes" : "no";
        const kernelConfigure = request.kernelConfigure ? "yes" : "no";
        const kernelBtf = request.kernelBtf ? "yes" : "no";

        const executableCommand = this.resolveBuildEntrypointCommand(buildSourceDir);

        return [
            ...executableCommand,
            `BOARD=${board}`,
            `BRANCH=${branch}`,
            `RELEASE=${release}`,
            `BUILD_MINIMAL=${buildMinimal}`,
            `BUILD_DESKTOP=${buildDesktop}`,
            `KERNEL_CONFIGURE=${kernelConfigure}`,
            `KERNEL_BTF=${kernelBtf}`,
        ];
    }

    private resolveBuildEntrypointCommand(buildSourceDir: string): string[] {
        if (this.buildEntrypoint !== "auto") {
            const normalized = this.buildEntrypoint.trim();
            if (normalized.length === 0) {
                throw new Error("ARMBIAN_BUILD_ENTRYPOINT cannot be empty when not set to auto");
            }

            return normalized.split(/\s+/g).filter((token) => token.length > 0);
        }

        const compileScriptPath = path.join(buildSourceDir, "compile.sh");
        if (fs.existsSync(compileScriptPath)) {
            return ["bash", "./compile.sh"];
        }

        const topLevelEntries = fs.existsSync(buildSourceDir)
            ? fs.readdirSync(buildSourceDir).slice(0, 30).join(", ")
            : "<source dir missing>";

        throw new Error(
            `No Armbian build framework entrypoint found in source directory (expected ./compile.sh). Found: ${topLevelEntries}`,
        );
    }

    private writeCustomizeImageScript(buildSourceDir: string, request: ArmbianBuildRequest): void {
        const script = buildArmbianCustomizeImageScript(request.plugins);
        if (!script) {
            return;
        }

        const userPatchesDirectory = path.join(buildSourceDir, "userpatches");
        fs.mkdirSync(userPatchesDirectory, { recursive: true });

        const customizeImageScriptPath = path.join(userPatchesDirectory, "customize-image.sh");
        fs.writeFileSync(customizeImageScriptPath, script, { encoding: "utf8", mode: 0o755 });
        fs.chmodSync(customizeImageScriptPath, 0o755);
    }

    private async ensureBuildSources(buildSourceDir: string): Promise<void> {
        if (fs.existsSync(buildSourceDir)) {
            const hasEntrypoint = fs.existsSync(path.join(buildSourceDir, "compile.sh"));
            const hasFrameworkLib = fs.existsSync(path.join(buildSourceDir, "lib", "single.sh"));

            if (hasEntrypoint && hasFrameworkLib) {
                return;
            }

            this.logger.warn(
                `Armbian source directory exists but required framework files are missing (compile.sh/lib/single.sh): ${buildSourceDir}. Re-cloning sources.`,
            );
            fs.rmSync(buildSourceDir, { recursive: true, force: true });
        }

        fs.mkdirSync(path.dirname(buildSourceDir), { recursive: true });

        await this.runCommand(
            "git",
            [
                "clone",
                `--depth=${String(this.cloneDepth)}`,
                "https://github.com/armbian/build",
                buildSourceDir,
            ],
            this.workspaceRootPath,
        );
    }

    private removeDirectoryIfExists(directoryPath: string): boolean {
        if (!directoryPath || directoryPath === "/") {
            return false;
        }

        if (!fs.existsSync(directoryPath)) {
            return false;
        }

        try {
            fs.rmSync(directoryPath, { recursive: true, force: true });
            return true;
        } catch (error) {
            this.logger.warn(`Failed to remove directory ${directoryPath}: ${String(error)}`);
            return false;
        }
    }

    private async resolveDockerBindSource(containerPath: string): Promise<string> {
        const normalizedPath = path.resolve(containerPath);
        const selfContainerId = this.dockerService.getSelfContainerId();

        if (!selfContainerId) {
            return normalizedPath;
        }

        const mounts = await this.getSelfContainerMounts(selfContainerId);
        if (mounts.length === 0) {
            return normalizedPath;
        }

        const matchingMount = mounts.find(({ destination }) =>
            normalizedPath === destination || normalizedPath.startsWith(`${destination}${path.sep}`),
        );

        if (!matchingMount) {
            this.logger.warn(
                `Path ${normalizedPath} is not under a bind/volume mount visible to Docker daemon. ` +
                    `When using Docker socket from inside container, prefer ARMBIAN_* paths under mounted directories (e.g. /armbian-data).`,
            );
            return normalizedPath;
        }

        const relativeSuffix = path.relative(matchingMount.destination, normalizedPath);
        return relativeSuffix.length > 0
            ? path.resolve(matchingMount.source, relativeSuffix)
            : path.resolve(matchingMount.source);
    }

    private async getSelfContainerMounts(selfContainerId: string): Promise<Array<{ source: string; destination: string }>> {
        if (this.selfContainerMountsCache) {
            return this.selfContainerMountsCache;
        }

        try {
            const docker = this.dockerService.getDockerClient();
            const selfInfo = await docker.getContainer(selfContainerId).inspect();

            this.selfContainerMountsCache = (selfInfo.Mounts ?? [])
                .filter((mount) => Boolean(mount.Source) && Boolean(mount.Destination))
                .map((mount) => ({
                    source: path.resolve(mount.Source),
                    destination: path.resolve(mount.Destination),
                }))
                .sort((left, right) => right.destination.length - left.destination.length);
        } catch (error) {
            this.logger.warn(
                `Unable to inspect self container mounts for Docker bind path translation: ${String(error)}`,
            );
            this.selfContainerMountsCache = [];
        }

        return this.selfContainerMountsCache;
    }

    private async runCommand(command: string, args: string[], cwd: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const child = spawn(command, args, {
                cwd,
                stdio: ["ignore", "pipe", "pipe"],
            });

            let stderr = "";
            child.stderr.on("data", (chunk: Buffer) => {
                stderr += chunk.toString("utf8");
            });

            child.on("error", (error) => {
                reject(error);
            });

            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }

                reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}${stderr ? `: ${stderr}` : ""}`));
            });
        });
    }

    private writeBuildMetadata(buildId: string, metadata: ArmbianBuildMetadata): void {
        const buildStorageDir = path.join(this.storageRootPath, buildId);
        fs.mkdirSync(buildStorageDir, { recursive: true });
        const metadataPath = path.join(buildStorageDir, this.metadataFileName);
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    }

    private readBuildMetadata(buildId: string): ArmbianBuildMetadata | null {
        const metadataPath = path.join(this.storageRootPath, buildId, this.metadataFileName);
        if (!fs.existsSync(metadataPath)) {
            return null;
        }

        try {
            const raw = fs.readFileSync(metadataPath, "utf8");
            return JSON.parse(raw) as ArmbianBuildMetadata;
        } catch {
            return null;
        }
    }
}
