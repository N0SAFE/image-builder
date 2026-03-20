import { BadRequestException, Injectable } from "@nestjs/common";
import { DockerRuntimeRunnerService } from "./docker-runtime-runner.service";
import type { RuntimeExecutionInput, RuntimeExecutionResult } from "./runtime-runner.interface";

@Injectable()
export class RuntimeRunnerRegistryService {
    constructor(private readonly dockerRuntimeRunnerService: DockerRuntimeRunnerService) {}

    async execute(
        runnerKind: string | null | undefined,
        input: RuntimeExecutionInput,
    ): Promise<RuntimeExecutionResult> {
        const normalizedRunner = (runnerKind ?? "docker").toLowerCase();

        if (this.dockerRuntimeRunnerService.runnerKinds.some((runnerKind) => runnerKind === normalizedRunner)) {
            return this.dockerRuntimeRunnerService.executeRuntime(input);
        }

        throw new BadRequestException(`Unsupported runtime runner '${normalizedRunner}'`);
    }
}
