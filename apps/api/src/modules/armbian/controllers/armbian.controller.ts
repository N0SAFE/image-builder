import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { appContract } from "@repo/api-contracts";
import { ArmbianService } from "../services/armbian.service";

@Controller()
export class ArmbianController {
    constructor(private readonly armbianService: ArmbianService) {}

    @Implement(appContract.armbian.getBuildFormConfig)
    getBuildFormConfig() {
        return implement(appContract.armbian.getBuildFormConfig).handler(() => {
            return this.armbianService.getBuildFormConfig();
        });
    }

    @Implement(appContract.armbian.createBuild)
    createBuild() {
        return implement(appContract.armbian.createBuild).handler(async ({ input }) => {
            return this.armbianService.startBuild(input);
        });
    }

    @Implement(appContract.armbian.listBuilds)
    listBuilds() {
        return implement(appContract.armbian.listBuilds).handler(async ({ input }) => {
            return this.armbianService.listBuilds(input.query?.limit);
        });
    }

    @Implement(appContract.armbian.getBuild)
    getBuild() {
        return implement(appContract.armbian.getBuild).handler(async ({ input }) => {
            return this.armbianService.getBuild(input.params.buildId);
        });
    }

    @Implement(appContract.armbian.deleteBuild)
    deleteBuild() {
        return implement(appContract.armbian.deleteBuild).handler(async ({ input }) => {
            return this.armbianService.deleteBuild(input.params.buildId);
        });
    }

    @Implement(appContract.armbian.getBuildLogs)
    getBuildLogs() {
        return implement(appContract.armbian.getBuildLogs).handler(async ({ input }) => {
            const buildId = input.params.buildId;
            const tail = input.query?.tail;
            const logs = await this.armbianService.getBuildLogs(buildId, tail);

            return {
                buildId,
                tail: tail ?? 400,
                logs,
            };
        });
    }

    @Implement(appContract.armbian.listArtifacts)
    listArtifacts() {
        return implement(appContract.armbian.listArtifacts).handler(({ input }) => {
            const buildId = input.params.buildId;
            return {
                buildId,
                artifacts: this.armbianService.listArtifacts(buildId),
            };
        });
    }

    @Implement(appContract.armbian.streamBuild)
    streamBuild() {
        return implement(appContract.armbian.streamBuild).handler(({ input }) => {
            return this.armbianService.streamBuildEvents(input.params.buildId, {
                intervalMs: input.query?.intervalMs,
                tail: input.query?.tail,
            });
        });
    }
}
