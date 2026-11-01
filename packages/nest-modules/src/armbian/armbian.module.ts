import { Module } from "@nestjs/common";
import { ArmbianBuilderService } from "./armbian-builder.service";
import { DockerService } from "../docker/docker.service";

@Module({
    providers: [DockerService, ArmbianBuilderService],
    exports: [DockerService, ArmbianBuilderService],
})
export class ArmbianModule {}
