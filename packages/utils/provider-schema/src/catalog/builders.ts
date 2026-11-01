import type { BuilderMetadata } from "../domain";

export const buildersCatalog: BuilderMetadata[] = [
    {
        id: "dockerfile",
        name: "Dockerfile",
        description: "Build and run from Dockerfile",
        icon: "container",
        category: "container",
        compatibleProviders: ["github"],
        tags: ["docker", "container"],
    },
    {
        id: "nixpacks",
        name: "Nixpacks",
        description: "Auto-detect and build app runtime",
        icon: "package",
        category: "container",
        compatibleProviders: ["github"],
        tags: ["buildpack", "autodetect"],
    },
    {
        id: "static",
        name: "Static Builder",
        description: "Serve static files with optimized routing",
        icon: "globe",
        category: "static",
        compatibleProviders: ["github", "static"],
        tags: ["static", "frontend"],
    },
    {
        id: "armbian",
        name: "Armbian Builder",
        description: "Build bootable Armbian images for ARM boards in isolated Docker workers",
        icon: "cpu",
        category: "container",
        compatibleProviders: ["github", "static"],
        tags: ["armbian", "embedded", "image", "iot"],
    },
];