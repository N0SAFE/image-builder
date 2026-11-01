import { Module } from "@nestjs/common";
import { ArmbianController } from "./controllers/armbian.controller";
import { ArmbianService } from "./services/armbian.service";

@Module({
    controllers: [ArmbianController],
    providers: [ArmbianService],
    exports: [ArmbianService],
})
export class ArmbianModule {}
