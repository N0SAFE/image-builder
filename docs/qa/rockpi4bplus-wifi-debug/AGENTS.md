# AGENTS.md — Rock Pi 4B+ Armbian Wi-Fi Debug Kit

## Purpose

This folder is a **focused debugging workspace** for one specific problem:

> An Armbian-built Ubuntu (`noble`) image for **Rock Pi 4B+** boots, but cannot connect/log in to Wi-Fi.

It contains:

- A local copy of the known image build command.
- Two SD flashing methods used during troubleshooting.
- Scripts to collect evidence from a running board.
- Scripts to inspect the image offline before first boot.

## Scope and Boundaries

- Keep all Rock Pi Wi-Fi troubleshooting artifacts in this folder.
- Prefer adding scripts and notes here instead of scattering one-off commands.
- Do not store Wi-Fi passwords or secrets in committed files.
- Flashing scripts are destructive by design; always verify the target block device.

## Expected Workflow

1. Build image with `scripts/00-build-rockpi4bplus-noble.sh`.
2. Flash SD with one method (`10` or `11`).
3. Boot board and run `scripts/20-collect-wifi-debug.sh` on-device.
4. If boot/connectivity still fails, inspect image offline with `scripts/21-inspect-image-offline.sh`.
5. Compare logs and isolate root cause (firmware, driver, service, credentials, RF/regdomain, or bad flash).

## Maintenance Rules

- Keep destructive operations (build/flash) as Bash scripts for transparency.
- Use TypeScript scripts for forensic extraction/audits when structured output is needed.
- Keep outputs deterministic and timestamped.
- When adding a new diagnostic, document it in `README.md`.
