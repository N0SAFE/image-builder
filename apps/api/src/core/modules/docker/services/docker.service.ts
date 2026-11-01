import { Injectable } from "@nestjs/common";
import {
    DockerService as SharedDockerService,
    type DockerServiceOptions,
} from "@repo/nest-modules/docker";
import { EnvService } from "@/config/env/env.service";

@Injectable()
export class DockerService extends SharedDockerService {
    constructor(envService: EnvService) {
        const options: DockerServiceOptions = {
            dockerHost: envService.get("DOCKER_HOST"),
            dockerPort: envService.get("DOCKER_PORT"),
            dockerSocketPath: "/var/run/docker.sock",
        };
        super(options);
    }
}

export type { CreateContainerOptions } from "@repo/nest-modules/docker";
