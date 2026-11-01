# Rock Pi 4B+ Armbian Wi-Fi Debug Folder

This folder centralizes everything needed to debug:

> Armbian-built Ubuntu (`noble`) image for `rockpi-4bplus` cannot authenticate/connect to Wi‑Fi.

## What is included

- `GPIO_SCHEMA_ROCKPI4BPLUS.md` — complete 40-pin, color-coded GPIO schema for wiring/troubleshooting.
- `ROOT_CAUSE_AND_AB_ISOLATION.md` — strict A/B protocol and decision matrix to isolate SD/reader/board root cause.
- `scripts/00-build-rockpi4bplus-noble.sh` — local copy of your build command.
- `scripts/10-flash-sd-method-a.sh` — local copy of flashing method A.
- `scripts/11-flash-sd-method-b.sh` — local copy of flashing method B (with safer partition check).
- `scripts/20-collect-wifi-debug.sh` — run on the board to collect Wi‑Fi diagnostics.
- `scripts/21-inspect-image-offline.sh` — inspect image contents from host before boot.
- `scripts/22-patch-mounted-rootfs.sh` — patch an already-flashed mounted SD rootfs with Wi‑Fi + QA debug hooks.
- `scripts/30-collect-used-rootfs-logs.ts` — extract logs from an already-used rootfs (ex: `/dev/sda1`).
- `scripts/31-audit-used-rootfs-config.ts` — snapshot and audit effective network/Wi‑Fi config from used rootfs.
- `scripts/32-generate-build-fix-recommendations.ts` — merges logs+config forensic outputs into actionable next-build changes.
- `userpatches/customize-image.sh` — Armbian `customize-image` hook to force persistent journald + first-boot Wi‑Fi diagnostics.
	- Also disables heartbeat LED trigger by default (to avoid continuous blue blink confusion during QA).

## Quick workflow

1. Build image.
2. Flash SD card with one method.
3. Boot Rock Pi 4B+.
4. Run on-device collector and save archive.
5. Inspect logs for root cause.
6. After a failed boot attempt, run TS forensic scripts on `sda1` to capture post-failure state.
7. Run recommendation generator to get prioritized changes for next image build.

### If an image is already flashed

You can patch the mounted SD rootfs directly (without rebuilding immediately):

- `sudo ./scripts/22-patch-mounted-rootfs.sh /media/sebille/armbi_root`

This injects persistent journald + first-boot Wi‑Fi diagnostics and refreshes NetworkManager ownership/profile defaults.

## Build script QA behavior (new)

`scripts/00-build-rockpi4bplus-noble.sh` now injects QA userpatches by default:

- sets `USERPATCHES_PATH` to this folder's `userpatches/` (unless already provided),
- runs `userpatches/customize-image.sh` during image build,
- ensures journald persistence and one-time first-boot Wi‑Fi debug dump in generated image.
- disables heartbeat LED trigger by default in generated images.

Disable this behavior when needed:

- set `ENABLE_QA_WIFI_PATCHES=no` before running the build script.

Keep heartbeat LED behavior instead of disabling it:

- set `ROCKPI_DISABLE_HEARTBEAT_LED=no` before running the build script.

## First things to verify

1. **Driver/firmware loaded** (`brcmfmac`, `cfg80211`, firmware files in `/lib/firmware`).
2. **RF not blocked** (`rfkill list`).
3. **Network stack healthy** (`NetworkManager`, `wpa_supplicant` status).
4. **Regulatory domain valid** (`iw reg get`) for your country/channel.
5. **Credentials/profile valid** in NetworkManager connection.
6. **SD write integrity** (partition table, readable filesystem, expected U-Boot marker).

## Important note about flashing method B

Your original sequence had:

- `sudo e2fsck -f /dev/sda`

For most SD layouts, `e2fsck` should target a **partition** (example: `/dev/sda1` or `/dev/sda2`), not the whole disk node. The script auto-detects the first ext4 partition and checks that instead.

## Outputs

- `20-collect-wifi-debug.sh` creates a timestamped folder and `.tar.gz` archive.
- Archive is safe to share after reviewing it for sensitive fields (SSID names may appear).
- `30-collect-used-rootfs-logs.ts` creates a report folder containing:
	- copied plain logs (`syslog`, `kern.log`, `boot.log`, `messages` when present),
	- parsed journal exports (`NetworkManager`, `wpa_supplicant`, kernel, Wi‑Fi filtered),
	- heuristic summary (`90-wifi-signals-summary.json`) with likely failure signals.
- `31-audit-used-rootfs-config.ts` creates:
	- `raw/` full config snapshot for local deep analysis,
	- `redacted/` shareable snapshot with passwords/secrets masked,
	- `90-audit-warnings.json` highlighting likely misconfiguration points.
- `32-generate-build-fix-recommendations.ts` creates:
	- `build-fix-recommendations.md` (human readable, prioritized),
	- `build-fix-recommendations.json` (machine-readable for automation/comparison).

## New recommendation workflow (post-failure on used SD)

1. Run logs forensic report (`30`).
2. Run config forensic report (`31`).
3. Run recommendation report (`32`).
4. Apply top recommendations in Armbian customization/build scripts.
5. Rebuild, flash, retest, and compare recommendation deltas.

## Why these TS scripts matter

They give you deterministic evidence from a **real failed boot state** (used image), so each rebuild can be adjusted from facts instead of guesses:

- logs tell *what happened* (driver/firmware/auth/rfkill/regdomain/service ordering),
- config audit tells *why it happened* (bad profile, netplan conflict, missing modules, wrong renderer),
- together they define what to change in the Armbian build customization for the next image.
