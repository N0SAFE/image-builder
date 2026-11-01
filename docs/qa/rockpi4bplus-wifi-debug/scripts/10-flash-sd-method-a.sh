#!/usr/bin/env bash
set -Eeuo pipefail

# Local copy of flashing method A with parameterized device/image.
# WARNING: This script erases the target block device.

DEVICE="${1:-/dev/sda}"
IMAGE_PATH="${2:-/home/sebille/armbian-build/output/images/Armbian-unofficial_26.05.0-trunk_Rockpi-4bplus_noble_current_6.18.20.img}"

if [[ ! -b "$DEVICE" ]]; then
    echo "ERROR: Device not found: $DEVICE" >&2
    exit 1
fi

if [[ ! -f "$IMAGE_PATH" ]]; then
    echo "ERROR: Image not found: $IMAGE_PATH" >&2
    exit 1
fi

if [[ "${FORCE:-0}" != "1" ]]; then
    echo "About to erase and write $DEVICE using image:"
    echo "  $IMAGE_PATH"
    read -r -p "Continue? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

sudo umount "${DEVICE}"* 2>/dev/null || true
sudo dd if=/dev/zero of="$DEVICE" bs=1M count=100 conv=fsync
sudo sync

sleep 2

sudo dd if="$IMAGE_PATH" of="$DEVICE" bs=1M conv=fsync status=progress
sudo sync

sleep 2

echo "== U-Boot marker check (sector 64) =="
sudo dd if="$DEVICE" bs=512 skip=64 count=1 2>/dev/null | strings | grep "U-Boot" || true

echo "== MBR/GPT header preview (sector 0) =="
sudo dd if="$DEVICE" bs=512 skip=0 count=1 2>/dev/null | hexdump -C | head -10

echo "== Block device view =="
lsblk "$DEVICE"
