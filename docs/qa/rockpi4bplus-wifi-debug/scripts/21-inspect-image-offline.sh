#!/usr/bin/env bash
set -Eeuo pipefail

# Inspect an Armbian image offline from host to verify Wi-Fi-related files/config.

IMAGE_PATH="${1:-/home/sebille/armbian-build/output/images/Armbian-unofficial_26.05.0-trunk_Rockpi-4bplus_noble_current_6.18.20.img}"
MOUNT_DIR="${2:-/tmp/rockpi-image-mount}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="${3:-/tmp/rockpi-image-inspect-$TIMESTAMP}"

if [[ ! -f "$IMAGE_PATH" ]]; then
    echo "ERROR: Image not found: $IMAGE_PATH" >&2
    exit 1
fi

mkdir -p "$MOUNT_DIR" "$REPORT_DIR"

LOOP_DEV=""
ROOT_PART=""

cleanup() {
    set +e
    if mountpoint -q "$MOUNT_DIR"; then
        sudo umount "$MOUNT_DIR"
    fi
    if [[ -n "$LOOP_DEV" ]]; then
        sudo losetup -d "$LOOP_DEV"
    fi
}
trap cleanup EXIT

LOOP_DEV="$(sudo losetup --find --show --partscan "$IMAGE_PATH")"

# Find first ext4 partition in loop device mapping
ROOT_PART="$(lsblk -ln -o NAME,FSTYPE "$LOOP_DEV" | awk '$2 == "ext4" { print "/dev/" $1; exit }')"

if [[ -z "$ROOT_PART" ]]; then
    echo "ERROR: Could not find ext4 root partition on loop device: $LOOP_DEV" >&2
    lsblk "$LOOP_DEV" >&2
    exit 1
fi

sudo mount "$ROOT_PART" "$MOUNT_DIR"

{
    echo "# Image"
    echo "$IMAGE_PATH"
    echo
    echo "# Loop device"
    echo "$LOOP_DEV"
    echo
    echo "# Root partition"
    echo "$ROOT_PART"
    echo
    echo "# lsblk"
    lsblk "$LOOP_DEV"
} >"$REPORT_DIR/00-image-layout.txt" 2>&1

{
    echo "# /etc/os-release"
    cat "$MOUNT_DIR/etc/os-release" 2>/dev/null || true
    echo
    echo "# NetworkManager config"
    cat "$MOUNT_DIR/etc/NetworkManager/NetworkManager.conf" 2>/dev/null || true
} >"$REPORT_DIR/10-system-networkmanager.txt" 2>&1

{
    echo "# /etc/NetworkManager/system-connections"
    ls -la "$MOUNT_DIR/etc/NetworkManager/system-connections" 2>/dev/null || true
    echo
    echo "# /etc/netplan"
    ls -la "$MOUNT_DIR/etc/netplan" 2>/dev/null || true
    echo
    echo "# /etc/systemd/network"
    ls -la "$MOUNT_DIR/etc/systemd/network" 2>/dev/null || true
} >"$REPORT_DIR/11-network-files.txt" 2>&1

{
    echo "# Candidate Wi-Fi firmware files"
    find "$MOUNT_DIR/lib/firmware" -maxdepth 3 -type f \
        \( -iname '*brcm*' -o -iname '*4345*' -o -iname '*wifi*' -o -iname '*rtl*' \) \
        2>/dev/null | sort
} >"$REPORT_DIR/12-firmware-files.txt" 2>&1

{
    echo "# Modules and blacklist snippets"
    grep -RInE 'brcmfmac|brcmutil|cfg80211|rfkill|blacklist' "$MOUNT_DIR/etc/modprobe.d" 2>/dev/null || true
    echo
    grep -RInE 'brcmfmac|cfg80211|wifi|wlan|rfkill' "$MOUNT_DIR/etc/modules" "$MOUNT_DIR/etc/modules-load.d" 2>/dev/null || true
} >"$REPORT_DIR/13-modules-config.txt" 2>&1

echo "Offline inspection completed: $REPORT_DIR"
