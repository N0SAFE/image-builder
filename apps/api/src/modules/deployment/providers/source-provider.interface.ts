import type { DeploymentTriggerInput } from "@repo/api-contracts/modules/deployment/crud";

export interface DeploymentSourceCheckoutContext {
    provider: "github";
    repositoryUrl: string;
    branch: string;
    commitSha?: string;
}

export interface DeploymentSourceProvider {
    readonly sourceType: string;
    resolveSourceCheckout(input: DeploymentTriggerInput): Promise<DeploymentSourceCheckoutContext | null>;
}
