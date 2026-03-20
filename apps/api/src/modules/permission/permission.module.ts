import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../core/modules/database/database.module";
import { PermissionRepository } from "./repositories/permission.repository";
import { PermissionService } from "./services/permission.service";

@Module({
  imports: [DatabaseModule],
  providers: [PermissionService, PermissionRepository],
  exports: [PermissionService, PermissionRepository],
})
export class PermissionModule {}
