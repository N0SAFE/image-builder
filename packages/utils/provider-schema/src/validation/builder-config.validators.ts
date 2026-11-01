import z from "zod/v4";

export const builderConfigValidators: Record<string, z.ZodType<Record<string, unknown>>> = {
    dockerfile: z.object({
        dockerfilePath: z.string().optional(),
        buildArgs: z.record(z.string(), z.unknown()).optional(),
    }),
    nixpacks: z.object({
        installCommand: z.string().optional(),
        buildCommand: z.string().optional(),
    }),
    static: z.object({
        outputDir: z.string().min(1),
        fallbackFile: z.string().optional(),
    }),
    armbian: z.object({
        board: z.string().min(1),
        release: z.enum(["bookworm", "bullseye", "jammy", "noble"]),
        branch: z.string().optional(),
        hostname: z.string().optional(),
        timezone: z.string().optional(),
        username: z.string().optional(),
        userPassword: z.string().optional(),
        wifiSsid: z.string().optional(),
        wifiPassword: z.string().optional(),
    }),
};