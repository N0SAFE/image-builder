import { Module } from "@nestjs/common";
import { GitModule } from "@/core/modules/git";
import { GithubSourceProviderService } from "./github-source-provider.service";
import { SourceProviderRegistryService } from "./source-provider-registry.service";

@Module({
    imports: [GitModule],
    providers: [GithubSourceProviderService, SourceProviderRegistryService],
    exports: [SourceProviderRegistryService],
})
export class DeploymentProvidersModule {}
