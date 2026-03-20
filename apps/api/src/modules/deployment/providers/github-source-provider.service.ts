import { BadRequestException, Injectable } from "@nestjs/common";
import { GitService } from "@/core/modules/git";
import type { DeploymentTriggerInput } from "@repo/api-contracts/modules/deployment/crud";
import type {
    DeploymentSourceCheckoutContext,
    DeploymentSourceProvider,
} from "./source-provider.interface";

@Injectable()
export class GithubSourceProviderService implements DeploymentSourceProvider {
    readonly sourceType = "github";

    constructor(private readonly gitService: GitService) {}

    async resolveSourceCheckout(
        input: DeploymentTriggerInput,
    ): Promise<DeploymentSourceCheckoutContext | null> {
        if (input.sourceType !== "github") {
            return null;
        }

        const repositoryUrl = input.sourceConfig?.repositoryUrl?.trim();
        if (!repositoryUrl) {
            throw new BadRequestException("GitHub source requires sourceConfig.repositoryUrl");
        }

        const isValidRepository = await this.gitService.validateRepository(repositoryUrl);
        if (!isValidRepository) {
            throw new BadRequestException(
                `GitHub repository '${repositoryUrl}' is not accessible`,
            );
        }

        return {
            provider: "github",
            repositoryUrl,
            branch: input.sourceConfig?.branch ?? "main",
            ...(input.sourceConfig?.commitSha ? { commitSha: input.sourceConfig.commitSha } : {}),
        };
    }
}
