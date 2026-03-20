import { Module } from "@nestjs/common";
import { DockerModule } from "@/core/modules/docker/docker.module";
import { TraefikCoreModule } from "@/core/modules/traefik/traefik.module";
import { DockerRuntimeRunnerService } from "./docker-runtime-runner.service";
import { RuntimeRunnerRegistryService } from "./runtime-runner-registry.service";

@Module({
    imports: [DockerModule, TraefikCoreModule],
    providers: [DockerRuntimeRunnerService, RuntimeRunnerRegistryService],
    exports: [RuntimeRunnerRegistryService],
})
export class DeploymentRunnersModule {}
