import { Module } from "@nestjs/common";
import { ServiceDagService } from "./services/service-dag.service";
import { FleetRolloutPlannerService } from "./services/fleet-rollout-planner.service";
import { FleetReadinessGateService } from "./services/fleet-readiness-gate.service";
import { FleetRollbackService } from "./services/fleet-rollback.service";
import { FleetFailureContainmentService } from "./services/fleet-failure-containment.service";
import { CrossProjectGateService } from "./services/cross-project-gate.service";
import { DriftReconciliationService } from "./services/drift-reconciliation.service";

const FLEET_SERVICES = [
    ServiceDagService,
    FleetRolloutPlannerService,
    FleetReadinessGateService,
    FleetRollbackService,
    FleetFailureContainmentService,
    CrossProjectGateService,
    DriftReconciliationService,
];

@Module({
    providers: FLEET_SERVICES,
    exports: FLEET_SERVICES,
})
export class FleetModule {}
