#!/usr/bin/env bun

// @ts-nocheck

import { execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import process from "process";

type CliOptions = {
    device: string;
    mountDir: string;
    reportDir: string;
    rootDir?: string;
    maxJournalLines: number;
};

const timestamp = (): string => new Date().toISOString().replaceAll(":", "-").replace(".", "_");

const usage = (): string => `
Collect logs from an already-used Linux rootfs (e.g. /dev/sda1 from Rock Pi SD card).

Usage:
  bun scripts/30-collect-used-rootfs-logs.ts [options]

Options:
  --device <path>            Block device/partition (default: /dev/sda1)
  --mount-dir <path>         Temporary mount point (default: /tmp/rockpi-used-rootfs)
  --report-dir <path>        Output report directory
  --root-dir <path>          Use an already-mounted rootfs path (skip mount/umount)
  --max-journal-lines <n>    Max lines per journal export (default: 30000)
  --help                     Show this help

Examples:
  sudo bun scripts/30-collect-used-rootfs-logs.ts --device /dev/sda1
  bun scripts/30-collect-used-rootfs-logs.ts --root-dir /mnt/rockpi
    bun scripts/30-collect-used-rootfs-logs.ts --root-dir=/
`.trim();

const parseArgs = (argv: string[]): CliOptions => {
    const options: CliOptions = {
        device: "/dev/sda1",
        mountDir: "/tmp/rockpi-used-rootfs",
        reportDir: `/tmp/rockpi-used-rootfs-logs-${timestamp()}`,
        maxJournalLines: 30000,
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
        if (flag === "--max-journal-lines") {
            options.maxJournalLines = Number.parseInt(readValue(), 10);
            continue;
        }

        throw new Error(`Unknown or incomplete argument: ${arg}`);
    }

    if (!Number.isFinite(options.maxJournalLines) || options.maxJournalLines <= 0) {
        throw new Error(`--max-journal-lines must be a positive integer. Received: ${options.maxJournalLines}`);
    }

    return options;
};

const safeExec = (command: string, args: string[]): { ok: boolean; output: string } => {
    try {
        const stdout = execFileSync(command, args, { encoding: "utf8" });
        return { ok: true, output: stdout };
    } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        return {
            ok: false,
            output: [err.stdout ?? "", err.stderr ?? "", err.message ?? ""].filter(Boolean).join("\n"),
        };
    }
};

const writeText = (filePath: string, content: string): void => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
};

const writeCommandCapture = (filePath: string, command: string, args: string[]): string => {
    const result = safeExec(command, args);
    const payload = [`# Command`, `${command} ${args.join(" ")}`, "", result.output].join("\n");
    writeText(filePath, payload);
    return result.output;
};

const hasAnyFile = (directoryPath: string): boolean => {
    try {
        return readdirSync(directoryPath).length > 0;
    } catch {
        return false;
    }
};

const copyLogIfExists = (rootPath: string, relativePath: string, destinationDir: string): void => {
    const source = join(rootPath, relativePath);
    const destination = join(destinationDir, relativePath.replaceAll("/", "__"));
    if (!existsSync(source)) {
        return;
    }
    mkdirSync(dirname(destination), { recursive: true });
    try {
        copyFileSync(source, destination);
    } catch {
        writeText(destination + ".read-error.txt", `Failed to copy ${source}`);
    }
};

const ensureRootWhenMounting = (usingExternalRoot: boolean): void => {
    if (usingExternalRoot) {
        return;
    }
    if (typeof process.getuid === "function" && process.getuid() !== 0) {
        throw new Error("This script mounts a block device. Re-run with sudo or provide --root-dir.");
    }
};

const collectWifiSignals = (text: string): Record<string, boolean> => {
    const lower = text.toLowerCase();
    return {
        hasFirmwareError: /firmware.+(fail|error|missing)|direct firmware load failed/.test(lower),
        hasAuthFailure: /(auth|authentication).+(fail|reject|timeout)|4-way handshake failed/.test(lower),
        hasRfkill: /rfkill|blocked: yes/.test(lower),
        hasNoWifiDevice: /no suitable device|device not managed|no wifi device|failed to initialize wlan/.test(lower),
        hasRegDomainIssue: /regulatory|country code|cfg80211/.test(lower),
    };
};

const main = (): void => {
    const options = parseArgs(process.argv.slice(2));
    ensureRootWhenMounting(Boolean(options.rootDir));

    const reportDir = resolve(options.reportDir);
    mkdirSync(reportDir, { recursive: true });

    let rootPath = options.rootDir ? resolve(options.rootDir) : resolve(options.mountDir);
    let mountedByScript = false;

    try {
        if (!options.rootDir) {
            mkdirSync(rootPath, { recursive: true });
            execFileSync("mount", ["-o", "ro", options.device, rootPath], { encoding: "utf8" });
            mountedByScript = true;
        }

        if (!existsSync(rootPath)) {
            throw new Error(`Root path does not exist: ${rootPath}`);
        }

        const meta = {
            createdAt: new Date().toISOString(),
            options,
            effectiveRootPath: rootPath,
        };
        writeText(join(reportDir, "00-meta.json"), JSON.stringify(meta, null, 2));

        writeCommandCapture(join(reportDir, "01-lsblk.txt"), "lsblk", ["-f", options.device]);
        writeCommandCapture(join(reportDir, "02-findmnt.txt"), "findmnt", ["-T", rootPath]);

        const osReleasePath = join(rootPath, "etc/os-release");
        if (existsSync(osReleasePath)) {
            writeText(join(reportDir, "03-os-release.txt"), readFileSync(osReleasePath, "utf8"));
        }

        const plainLogsDir = join(reportDir, "plain-logs");
        mkdirSync(plainLogsDir, { recursive: true });
        const plainLogCandidates = [
            "var/log/syslog",
            "var/log/kern.log",
            "var/log/daemon.log",
            "var/log/boot.log",
            "var/log/dmesg",
            "var/log/messages",
        ];
        for (const logPath of plainLogCandidates) {
            copyLogIfExists(rootPath, logPath, plainLogsDir);
        }

        const journalDir = join(rootPath, "var/log/journal");
        let allJournal = "";
        let nmJournal = "";
        let wpaJournal = "";
        let kernelJournal = "";

        if (existsSync(journalDir) && hasAnyFile(journalDir)) {
            writeCommandCapture(join(reportDir, "10-journal-list-boots.txt"), "journalctl", [
                "--directory",
                journalDir,
                "--list-boots",
                "--no-pager",
            ]);

            allJournal = writeCommandCapture(join(reportDir, "11-journal-all.txt"), "journalctl", [
                "--directory",
                journalDir,
                "--no-pager",
                "-o",
                "short-iso",
                "--lines",
                String(options.maxJournalLines),
            ]);

            nmJournal = writeCommandCapture(join(reportDir, "12-journal-networkmanager.txt"), "journalctl", [
                "--directory",
                journalDir,
                "--no-pager",
                "-o",
                "short-iso",
                "-u",
                "NetworkManager",
                "--lines",
                String(options.maxJournalLines),
            ]);

            wpaJournal = writeCommandCapture(join(reportDir, "13-journal-wpa-supplicant.txt"), "journalctl", [
                "--directory",
                journalDir,
                "--no-pager",
                "-o",
                "short-iso",
                "-u",
                "wpa_supplicant",
                "--lines",
                String(options.maxJournalLines),
            ]);

            kernelJournal = writeCommandCapture(join(reportDir, "14-journal-kernel.txt"), "journalctl", [
                "--directory",
                journalDir,
                "--no-pager",
                "-o",
                "short-iso",
                "-k",
                "--lines",
                String(options.maxJournalLines),
            ]);

            const wifiFiltered = allJournal
                .split("\n")
                .filter((line) => /wifi|wlan|wpa|brcm|cfg80211|firmware|rfkill|dhcp/i.test(line))
                .join("\n");
            writeText(join(reportDir, "15-journal-wifi-filtered.txt"), wifiFiltered || "No Wi-Fi related lines found.");
        } else {
            writeText(
                join(reportDir, "10-journal-status.txt"),
                `No persistent journal found under: ${journalDir}\nThis usually means journald persistent storage was not enabled.`,
            );
        }

        const wtmpPath = join(rootPath, "var/log/wtmp");
        if (existsSync(wtmpPath)) {
            writeCommandCapture(join(reportDir, "16-last-from-wtmp.txt"), "last", ["-f", wtmpPath]);
        }

        const summarySource = [allJournal, nmJournal, wpaJournal, kernelJournal].join("\n");
        const summary = {
            createdAt: new Date().toISOString(),
            rootPath,
            journalAvailable: existsSync(journalDir) && hasAnyFile(journalDir),
            wifiSignals: collectWifiSignals(summarySource),
            quickHints: [
                "If firmware errors are present, inspect /lib/firmware and board-specific brcm files.",
                "If auth failures are present, verify SSID/PSK in NetworkManager profile and router security mode.",
                "If rfkill appears, verify hard/soft block and board-level radio enable state.",
                "If no Wi-Fi device appears, check driver/module load (brcmfmac/cfg80211) and DT/board support.",
            ],
        };
        writeText(join(reportDir, "90-wifi-signals-summary.json"), JSON.stringify(summary, null, 2));

        console.log(`✅ Used-rootfs log collection completed.`);
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
