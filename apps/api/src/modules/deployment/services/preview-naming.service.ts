import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PreviewTemplateConfig } from "@repo/api-contracts/common/template";

export interface PreviewNamingInput {
    serviceId: string;
    branchName?: string | null;
    prNumber?: number | null;
    commitSha?: string | null;
    urlPattern: string;
    namingStrategy: PreviewTemplateConfig["namingStrategy"];
}

export interface PreviewNamingResult {
    previewName: string;
    resolvedUrl: string;
    strategy: PreviewTemplateConfig["namingStrategy"];
}

/**
 * T031 — Deterministic preview naming.
 *
 * Converts a (service + branch/PR + hash) context into a stable, URL-safe preview name
 * using the naming strategy configured in the PreviewTemplate.
 *
 * Strategies:
 * - `pr`           → "pr-<prNumber>"  (requires prNumber)
 * - `branch`       → slug of branchName
 * - `branch_hash`  → "<branch_slug>-<7-char sha256 fragment>"
 * - `custom`       → applies urlPattern token substitution directly
 */
@Injectable()
export class PreviewNamingService {
    /**
     * Build a deterministic preview name and resolve the final URL from a urlPattern.
     * The urlPattern may contain `{{preview_name}}`, `{{branch}}`, `{{pr_number}}`, `{{commit_sha}}` tokens.
     */
    buildPreviewName(input: PreviewNamingInput): PreviewNamingResult {
        const previewName = this.resolveName(input);
        const resolvedUrl = this.resolveUrlPattern(input.urlPattern, {
            preview_name: previewName,
            branch: input.branchName ? this.toSlug(input.branchName) : "",
            pr_number: input.prNumber != null ? String(input.prNumber) : "",
            commit_sha: input.commitSha ? input.commitSha.slice(0, 7) : "",
        });

        return { previewName, resolvedUrl, strategy: input.namingStrategy };
    }

    private resolveName(input: PreviewNamingInput): string {
        switch (input.namingStrategy) {
            case "pr": {
                if (input.prNumber == null) {
                    throw new Error("namingStrategy=pr requires prNumber");
                }
                return `pr-${input.prNumber}`;
            }
            case "branch": {
                if (!input.branchName) {
                    throw new Error("namingStrategy=branch requires branchName");
                }
                return this.toSlug(input.branchName);
            }
            case "branch_hash": {
                if (!input.branchName) {
                    throw new Error("namingStrategy=branch_hash requires branchName");
                }
                const slug = this.toSlug(input.branchName);
                const hashSeed = `${input.serviceId}:${input.branchName}:${input.commitSha ?? ""}`;
                const fragment = createHash("sha256").update(hashSeed).digest("hex").slice(0, 7);
                return `${slug}-${fragment}`;
            }
            case "custom": {
                // For "custom", the urlPattern itself is the source of truth.
                // Return a slug derived from the pattern after token substitution.
                return this.toSlug(
                    this.resolveUrlPattern(input.urlPattern, {
                        preview_name: "",
                        branch: input.branchName ? this.toSlug(input.branchName) : "",
                        pr_number: input.prNumber != null ? String(input.prNumber) : "",
                        commit_sha: input.commitSha ? input.commitSha.slice(0, 7) : "",
                    }),
                );
            }
        }
    }

    private resolveUrlPattern(pattern: string, tokens: Record<string, string>): string {
        return Object.entries(tokens).reduce((acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value), pattern);
    }

    /** Convert a string to a lowercase URL-safe slug (max 48 chars). */
    private toSlug(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48);
    }
}
