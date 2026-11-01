#!/usr/bin/env bun

// @ts-nocheck

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import process from "process";

type CliOptions = {
    logsReportDir?: string;
    configReportDir?: string;
    outputDir: string;
};

type Recommendation = {
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    rationale: string;
    evidence: string[];
    buildChanges: string[];
};

type AuditWarning = {
    code: string;
    message: string;
    path?: string;
};

const timestamp = (): string => new Date().toISOString().replaceAll(":", "-").replace(".", "_");

const usage = (): string => `
Generate actionable build recommendations from used-rootfs forensic reports.

Usage:
  bun scripts/32-generate-build-fix-recommendations.ts [options]

Options:
  --logs-report-dir <path>     Path to output folder from 30-collect-used-rootfs-logs.ts
  --config-report-dir <path>   Path to output folder from 31-audit-used-rootfs-config.ts
  --output-dir <path>          Output folder for recommendations (default: /tmp/rockpi-build-fix-<timestamp>)
  --help                       Show this help

If report paths are omitted, the script auto-detects latest reports in /tmp.

Examples:
  bun scripts/32-generate-build-fix-recommendations.ts
  bun scripts/32-generate-build-fix-recommendations.ts \
    --logs-report-dir /tmp/rockpi-used-rootfs-logs-2026-04-03T10-21-00_123Z \
    --config-report-dir /tmp/rockpi-used-rootfs-config-2026-04-03T10-25-00_321Z
    bun scripts/32-generate-build-fix-recommendations.ts --output-dir=/tmp/rockpi-build-fix-report
`.trim();

const parseArgs = (argv: string[]): CliOptions => {
    const options: CliOptions = {
        outputDir: `/tmp/rockpi-build-fix-${timestamp()}`,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--help" || arg === "-h") {
            console.log(usage());
            process.exit(0);
        }

        const eqIndex = arg.startsWith("--") ? arg.indexOf("=") : -1;
        const flag = eqIndex === -1 ? arg : arg.slice(0, eqIndex);
        const inlineValue = eqIndex === -1 ? undefined : arg.slice(eqIndex + 1);
        const next = argv[i + 1];
        const readValue = (): string => {
            if (inlineValue !== undefined) {
                return inlineValue;
            }
            if (next !== undefined) {
                i += 1;
                return next;
            }
            throw new Error(`Missing value for option: ${flag}`);
        };

        if (flag === "--logs-report-dir") {
            options.logsReportDir = readValue();
            continue;
        }
        if (flag === "--config-report-dir") {
            options.configReportDir = readValue();
            continue;
        }
        if (flag === "--output-dir") {
            options.outputDir = readValue();
            continue;
        }

        throw new Error(`Unknown or incomplete argument: ${arg}`);
    }

    return options;
};

const readJsonIfExists = <T>(filePath: string): T | null => {
    if (!existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(readFileSync(filePath, "utf8")) as T;
    } catch {
        return null;
    }
};

const findLatestDir = (prefix: string): string | undefined => {
    const base = "/tmp";
    if (!existsSync(base)) {
        return undefined;
    }

    const candidates = readdirSync(base)
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => join(base, entry))
        .filter((full) => {
            try {
                return statSync(full).isDirectory();
            } catch {
                return false;
            }
        })
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    return candidates[0];
};

const pushRecommendation = (
    list: Recommendation[],
    recommendation: Recommendation,
    seen: Set<string>,
): void => {
    if (seen.has(recommendation.id)) {
        return;
    }
    seen.add(recommendation.id);
    list.push(recommendation);
};

const buildMarkdown = (items: Recommendation[], context: Record<string, unknown>): string => {
    const lines: string[] = [];
    lines.push("# Rock Pi 4B+ Wi-Fi Build Fix Recommendations");
    lines.push("");
    lines.push(`Generated at: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Input Context");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(context, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("## Recommendations");
    lines.push("");

    if (items.length === 0) {
        lines.push("No strong issues detected from available reports.");
        lines.push("Run scripts 30 and 31 after a failed boot with richer logs for better recommendations.");
        return lines.join("\n");
    }

    for (const item of items) {
        lines.push(`### [${item.severity.toUpperCase()}] ${item.title}`);
        lines.push("");
        lines.push(`- **Why:** ${item.rationale}`);
        if (item.evidence.length > 0) {
            lines.push("- **Evidence:**");
            for (const ev of item.evidence) {
                lines.push(`  - ${ev}`);
            }
        }
        lines.push("- **What to change in next build:**");
        for (const change of item.buildChanges) {
            lines.push(`  - ${change}`);
        }
        lines.push("");
    }

    lines.push("## Suggested Validation Loop");
    lines.push("");
    lines.push("1. Apply top recommendations in Armbian customization/build workflow.");
    lines.push("2. Rebuild image and flash SD.");
    lines.push("3. Boot and attempt Wi-Fi connection.");
    lines.push("4. Re-run scripts 30 + 31 + 32 and compare deltas.");

    return lines.join("\n");
};

const main = (): void => {
    const options = parseArgs(process.argv.slice(2));

    const logsReportDir = resolve(options.logsReportDir ?? findLatestDir("rockpi-used-rootfs-logs-") ?? "");
    const configReportDir = resolve(options.configReportDir ?? findLatestDir("rockpi-used-rootfs-config-") ?? "");
    const outputDir = resolve(options.outputDir);
    mkdirSync(outputDir, { recursive: true });

    const inputContext = {
        logsReportDir,
        configReportDir,
        logsReportExists: Boolean(logsReportDir && existsSync(logsReportDir)),
        configReportExists: Boolean(configReportDir && existsSync(configReportDir)),
    };

    const logSummary = readJsonIfExists<{
        wifiSignals?: Record<string, boolean>;
        journalAvailable?: boolean;
    }>(join(logsReportDir, "90-wifi-signals-summary.json"));

    const auditWarnings = readJsonIfExists<AuditWarning[]>(join(configReportDir, "90-audit-warnings.json")) ?? [];

    const recs: Recommendation[] = [];
    const seen = new Set<string>();

    if (logSummary?.journalAvailable === false) {
        pushRecommendation(
            recs,
            {
                id: "enable-persistent-journal",
                severity: "high",
                title: "Enable persistent journald logs",
                rationale:
                    "Post-boot logs are incomplete, which blocks root-cause analysis after failed Wi-Fi attempts.",
                evidence: ["log summary: journalAvailable=false"],
                buildChanges: [
                    "Ensure /var/log/journal exists in image and has correct permissions during build customization.",
                    "Set Storage=persistent in /etc/systemd/journald.conf (or drop-in), then restart journald on boot.",
                ],
            },
            seen,
        );
    }

    const signals = logSummary?.wifiSignals ?? {};

    if (signals.hasFirmwareError) {
        pushRecommendation(
            recs,
            {
                id: "firmware-package-and-files",
                severity: "critical",
                title: "Fix Wi-Fi firmware packaging/files",
                rationale: "Firmware load failures usually prevent interface init regardless of correct credentials.",
                evidence: ["log summary: hasFirmwareError=true"],
                buildChanges: [
                    "Verify board-relevant firmware files are present under /lib/firmware (brcm family for Rock Pi variant).",
                    "Ensure linux-firmware (or equivalent Armbian package set) is installed during image customization.",
                    "Add a post-build check in customization to fail fast if required firmware file patterns are missing.",
                ],
            },
            seen,
        );
    }

    if (signals.hasNoWifiDevice) {
        pushRecommendation(
            recs,
            {
                id: "wifi-device-not-detected",
                severity: "critical",
                title: "Ensure Wi-Fi device initialization path is valid",
                rationale: "No Wi-Fi device detected means driver/module/DT path likely fails before auth stage.",
                evidence: ["log summary: hasNoWifiDevice=true"],
                buildChanges: [
                    "Validate kernel flavor and modules include cfg80211/brcmfmac for the target board.",
                    "Check board/device-tree overlays and ensure nothing disables onboard Wi-Fi in armbianEnv/custom overlays.",
                    "Add boot-time diagnostics service to dump rfkill/iw/nmcli at first boot for quicker triage.",
                ],
            },
            seen,
        );
    }

    if (signals.hasAuthFailure) {
        pushRecommendation(
            recs,
            {
                id: "wifi-auth-profile",
                severity: "high",
                title: "Harden Wi-Fi profile generation/auth settings",
                rationale: "Authentication failures indicate profile/PSK/security mismatch with AP.",
                evidence: ["log summary: hasAuthFailure=true"],
                buildChanges: [
                    "Generate NetworkManager connection profile with explicit WPA-PSK settings compatible with target AP.",
                    "Avoid hidden assumptions (WPA3-only, enterprise auth fields) unless required by deployment AP.",
                    "Add first-boot validation script to confirm SSID profile is loaded and managed by NetworkManager.",
                ],
            },
            seen,
        );
    }

    if (signals.hasRfkill) {
        pushRecommendation(
            recs,
            {
                id: "rfkill-unblock",
                severity: "medium",
                title: "Handle rfkill state on first boot",
                rationale: "RF-kill blocks can make Wi-Fi appear broken even when drivers and config are correct.",
                evidence: ["log summary: hasRfkill=true"],
                buildChanges: [
                    "Add first-boot unit that checks rfkill and unblocks wlan if policy allows.",
                    "Collect rfkill state in persistent log for each boot to detect intermittent hardware blocks.",
                ],
            },
            seen,
        );
    }

    if (signals.hasRegDomainIssue) {
        pushRecommendation(
            recs,
            {
                id: "regdomain",
                severity: "medium",
                title: "Set explicit regulatory domain",
                rationale: "Wrong/unset regulatory domain can block channels used by local APs.",
                evidence: ["log summary: hasRegDomainIssue=true"],
                buildChanges: [
                    "Set WLAN regulatory domain explicitly (country code) via image customization and verify with iw reg get.",
                    "Align AP channel selection with allowed channels for the configured region.",
                ],
            },
            seen,
        );
    }

    for (const warning of auditWarnings) {
        if (warning.code === "NO_NM_CONNECTIONS") {
            pushRecommendation(
                recs,
                {
                    id: "nm-profiles-missing",
                    severity: "high",
                    title: "Create/persist NetworkManager connection profiles in image",
                    rationale: "No NM profiles found; auto-connect cannot succeed without a valid connection definition.",
                    evidence: [warning.message, warning.path ? `path: ${warning.path}` : ""].filter(Boolean),
                    buildChanges: [
                        "Inject a valid .nmconnection file during build customization or first-boot provisioning.",
                        "Set restrictive permissions required by NetworkManager (typically 600, root-owned).",
                    ],
                },
                seen,
            );
        }

        if (warning.code === "NETPLAN_NETWORKD") {
            pushRecommendation(
                recs,
                {
                    id: "netplan-renderer-conflict",
                    severity: "high",
                    title: "Prevent netplan renderer conflict with NetworkManager",
                    rationale: "NetworkManager-managed Wi-Fi can break if renderer/network ownership conflicts.",
                    evidence: [warning.message, warning.path ? `path: ${warning.path}` : ""].filter(Boolean),
                    buildChanges: [
                        "Set netplan renderer to NetworkManager for Wi-Fi-managed interfaces.",
                        "Remove or narrow conflicting networkd definitions for wlan interfaces.",
                    ],
                },
                seen,
            );
        }

        if (warning.code === "NM_CONF_MISSING") {
            pushRecommendation(
                recs,
                {
                    id: "networkmanager-conf-missing",
                    severity: "medium",
                    title: "Ensure NetworkManager base configuration exists",
                    rationale: "Missing main NM config increases risk of unmanaged or mismanaged interfaces.",
                    evidence: [warning.message, warning.path ? `path: ${warning.path}` : ""].filter(Boolean),
                    buildChanges: [
                        "Install/provision /etc/NetworkManager/NetworkManager.conf in image customization.",
                        "Confirm managed=true behavior for target interfaces and plugins setup.",
                    ],
                },
                seen,
            );
        }
    }

    recs.sort((a, b) => {
        const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return rank[a.severity] - rank[b.severity];
    });

    const markdown = buildMarkdown(recs, inputContext);
    writeFileSync(join(outputDir, "build-fix-recommendations.md"), markdown, "utf8");
    writeFileSync(
        join(outputDir, "build-fix-recommendations.json"),
        JSON.stringify(
            {
                createdAt: new Date().toISOString(),
                inputContext,
                recommendations: recs,
            },
            null,
            2,
        ),
        "utf8",
    );

    console.log("✅ Build-fix recommendation report generated.");
    console.log(`   Output directory: ${outputDir}`);
    console.log(`   Recommendations: ${recs.length}`);
};

main();
