import { Injectable } from "@nestjs/common";
import type { PreviewTemplateConfig } from "@repo/api-contracts/common/template";

/**
 * T033 — Preview environment overlays and secret scoping.
 *
 * Merges a base set of environment variables with a preview-specific overlay
 * according to the strategy defined in the PreviewTemplate config.
 *
 * Strategies:
 * - `inherit`  → base vars are used as-is; overlay is ignored
 * - `merge`    → overlay entries are merged on top of base (overlay wins on conflict)
 * - `replace`  → only overlay entries are used; base is discarded
 */
@Injectable()
export class PreviewEnvOverlayService {
    applyOverlay(
        baseEnv: Record<string, string>,
        overlayEnv: Record<string, string>,
        strategy: PreviewTemplateConfig["envOverlayStrategy"],
    ): Record<string, string> {
        switch (strategy) {
            case "inherit":
                return { ...baseEnv };
            case "merge":
                return { ...baseEnv, ...overlayEnv };
            case "replace":
                return { ...overlayEnv };
        }
    }
}
