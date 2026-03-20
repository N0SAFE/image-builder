import { Injectable } from "@nestjs/common";
import type { DeploymentTriggerInput } from "@repo/api-contracts/modules/deployment/crud";
import { GithubSourceProviderService } from "./github-source-provider.service";
import type { DeploymentSourceCheckoutContext } from "./source-provider.interface";

@Injectable()
export class SourceProviderRegistryService {
    constructor(private readonly githubSourceProviderService: GithubSourceProviderService) {}

    async resolveSourceCheckout(
        input: DeploymentTriggerInput,
    ): Promise<DeploymentSourceCheckoutContext | null> {
        if (input.sourceType === "github") {
            return this.githubSourceProviderService.resolveSourceCheckout(input);
        }

        return null;
    }
}
