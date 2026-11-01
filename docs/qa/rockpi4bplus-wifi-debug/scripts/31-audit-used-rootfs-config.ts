#!/usr/bin/env bun

// @ts-nocheck

import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import process from "process";

type CliOptions = {
    device: string;
    mountDir: string;
    reportDir: string;
    rootDir?: string;
};

type AuditWarning = {
    code: string;
    message: string;
    path?: string;
};

const timestamp = (): string => new Date().toISOString().replaceAll(":", "-").replace(".", "_");

const usage = (): string => `
Audit network/Wi-Fi related configuration from an already-used Linux rootfs.

Usage:
  bun scripts/31-audit-used-rootfs-config.ts [options]

Options:
  --device <path>       Block device/partition (default: /dev/sda1)
  --mount-dir <path>    Temporary mount point (default: /tmp/rockpi-used-rootfs)
  --report-dir <path>   Output report directory
  --root-dir <path>     Use already-mounted rootfs path (skip mount/umount)
  --help                Show this help

Examples:
  sudo bun scripts/31-audit-used-rootfs-config.ts --device /dev/sda1
  bun scripts/31-audit-used-rootfs-config.ts --root-dir /mnt/rockpi
    bun scripts/31-audit-used-rootfs-config.ts --root-dir=/
`.trim();

const parseArgs = (argv: string[]): CliOptions => {
    const options: CliOptions = {
        device: "/dev/sda1",
        mountDir: "/tmp/rockpi-used-rootfs",
        reportDir: `/tmp/rockpi-used-rootfs-config-${timestamp()}`,
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

        if (flag === "--device") {
            options.device = readValue();
            continue;
        }
        if (flag === "--mount-dir") {
            options.mountDir = readValue();
            continue;
        }
        if (flag === "--report-dir") {
            options.reportDir = readValue();
            continue;
        }
        if (flag === "--root-dir") {
            options.rootDir = readValue();
            continue;
        }

        throw new Error(`Unknown or incomplete argument: ${arg}`);
    }

    return options;
};

const writeText = (filePath: string, content: string): void => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
};

const ensureRootWhenMounting = (usingExternalRoot: boolean): void => {
    if (usingExternalRoot) {
        return;
    }
    if (typeof process.getuid === "function" && process.getuid() !== 0) {
        throw new Error("This script mounts a block device. Re-run with sudo or provide --root-dir.");
    }
};

const redactSecrets = (content: string): string =>
    content
        .replace(/^(\s*(?:psk|password|passphrase|wep-key\d*|private-key-password)\s*=\s*).+$/gim, "$1<REDACTED>")
        .replace(/^(\s*(?:password|passphrase|psk|private_key_password)\s*:\s*).+$/gim, "$1<REDACTED>")
        .replace(/("?(?:password|passphrase|psk|token|secret)"?\s*:\s*")([^"]+)(")/gim, '$1<REDACTED>$3');

const listFilesRecursive = (rootPath: string): string[] => {
    const out: string[] = [];
    if (!existsSync(rootPath)) {
        return out;
    }

    const walk = (current: string): void => {
        const entries = readdirSync(current);
        for (const entry of entries) {
            const full = join(current, entry);
            const stats = statSync(full);
            if (stats.isDirectory()) {
                walk(full);
            } else if (stats.isFile()) {
                out.push(full);
            }
        }
    };

    walk(rootPath);
    return out;
};

const copyAsRawAndRedacted = (realPath: string, rootPath: string, rawRoot: string, redactedRoot: string): void => {
    const rel = realPath.replace(`${rootPath}/`, "");
    const rawDest = join(rawRoot, rel);
    const redactedDest = join(redactedRoot, rel);

    mkdirSync(dirname(rawDest), { recursive: true });
    mkdirSync(dirname(redactedDest), { recursive: true });

    try {
        copyFileSync(realPath, rawDest);
        const redacted = redactSecrets(readFileSync(realPath, "utf8"));
        writeFileSync(redactedDest, redacted, "utf8");
    } catch {
        writeText(rawDest + ".read-error.txt", `Failed to copy/read ${realPath}`);
    }
};

const readTextSafe = (filePath: string): string | null => {
    try {
        return readFileSync(filePath, "utf8");
    } catch {
        return null;
    }
};

const main = (): void => {
    const options = parseArgs(process.argv.slice(2));
    ensureRootWhenMounting(Boolean(options.rootDir));

    const reportDir = resolve(options.reportDir);
    mkdirSync(reportDir, { recursive: true });

    const rawDir = join(reportDir, "raw");
    const redactedDir = join(reportDir, "redacted");
    mkdirSync(rawDir, { recursive: true });
    mkdirSync(redactedDir, { recursive: true });

    let rootPath = options.rootDir ? resolve(options.rootDir) : resolve(options.mountDir);
    let mountedByScript = false;

    try {
        if (!options.rootDir) {
            mkdirSync(rootPath, { recursive: true });
            execFileSync("mount", ["-o", "ro", options.device, rootPath], { encoding: "utf8" });
            mountedByScript = true;
        }

        const metadata = {
            createdAt: new Date().toISOString(),
            options,
            effectiveRootPath: rootPath,
        };
        writeText(join(reportDir, "00-meta.json"), JSON.stringify(metadata, null, 2));

        const directFiles = [
            "etc/os-release",
            "etc/hostname",
            "etc/hosts",
            "etc/NetworkManager/NetworkManager.conf",
            "etc/modules",
            "etc/wpa_supplicant/wpa_supplicant.conf",
            "boot/armbianEnv.txt",
        ];

        for (const rel of directFiles) {
            const full = join(rootPath, rel);
            if (existsSync(full)) {
                copyAsRawAndRedacted(full, rootPath, rawDir, redactedDir);
            }
        }

        const recursiveDirs = [
            "etc/NetworkManager/system-connections",
            "etc/netplan",
            "etc/modprobe.d",
            "etc/modules-load.d",
            "etc/wpa_supplicant",
            "etc/systemd/network",
            "etc/systemd/system/NetworkManager.service.d",
        ];

        for (const relDir of recursiveDirs) {
            const fullDir = join(rootPath, relDir);
            const files = listFilesRecursive(fullDir);
            for (const filePath of files) {
                copyAsRawAndRedacted(filePath, rootPath, rawDir, redactedDir);
            }
        }

        const warnings: AuditWarning[] = [];

        const nmConnectionsDir = join(rootPath, "etc/NetworkManager/system-connections");
        if (!existsSync(nmConnectionsDir) || listFilesRecursive(nmConnectionsDir).length === 0) {
            warnings.push({
                code: "NO_NM_CONNECTIONS",
                message: "No NetworkManager connection profiles found.",
                path: "etc/NetworkManager/system-connections",
            });
        }

        const netplanDir = join(rootPath, "etc/netplan");
        if (existsSync(netplanDir)) {
            const netplanFiles = listFilesRecursive(netplanDir);
            for (const filePath of netplanFiles) {
                const content = readTextSafe(filePath);
                if (content === null) {
                    warnings.push({
                        code: "NETPLAN_READ_ERROR",
                        message: "Could not read netplan file (permissions or I/O issue).",
                        path: filePath.replace(`${rootPath}/`, ""),
                    });
                    continue;
                }
                if (/renderer:\s*networkd/i.test(content)) {
                    warnings.push({
                        code: "NETPLAN_NETWORKD",
                        message:
                            "Netplan file uses renderer: networkd. Ensure it does not conflict with NetworkManager for Wi-Fi.",
                        path: filePath.replace(`${rootPath}/`, ""),
                    });
                }
            }
        }

        const modulesLoadDir = join(rootPath, "etc/modules-load.d");
        if (existsSync(modulesLoadDir)) {
            const moduleFiles = listFilesRecursive(modulesLoadDir);
            const combined = moduleFiles
                .map((p) => readTextSafe(p))
                .filter((content): content is string => content !== null)
                .join("\n");
            if (!/brcmfmac|cfg80211|brcmutil/i.test(combined)) {
                warnings.push({
                    code: "NO_WIFI_MODULE_HINT",
                    message:
                        "No explicit Wi-Fi module hint found in modules-load.d (not always required, but worth checking if device is missing).",
                    path: "etc/modules-load.d",
                });
            }
        }

        const nmMainConf = join(rootPath, "etc/NetworkManager/NetworkManager.conf");
        if (!existsSync(nmMainConf)) {
            warnings.push({
                code: "NM_CONF_MISSING",
                message: "NetworkManager.conf not found.",
                path: "etc/NetworkManager/NetworkManager.conf",
            });
        }

        writeText(join(reportDir, "90-audit-warnings.json"), JSON.stringify(warnings, null, 2));

        const reportSummary = [
            `Audit completed at: ${new Date().toISOString()}`,
            `Root path: ${rootPath}`,
            `Raw config snapshot: ${rawDir}`,
            `Redacted config snapshot: ${redactedDir}`,
            `Warnings count: ${warnings.length}`,
        ].join("\n");
        writeText(join(reportDir, "91-summary.txt"), reportSummary);

        console.log("✅ Used-rootfs config audit completed.");
        console.log(`   Report directory: ${reportDir}`);
    } finally {
        if (mountedByScript) {
            try {
                execFileSync("umount", [rootPath], { encoding: "utf8" });
            } catch {
                // ignore cleanup errors, report is already generated
            }
        }
    }
};

main();
