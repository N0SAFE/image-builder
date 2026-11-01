#!/usr/bin/env bash
set -Eeuo pipefail

# Local copy of flashing method B with a safer ext4 partition check.
# WARNING: This script erases the target block device.

DEVICE="${1:-/dev/sda}"
IMAGE_PATH="${2:-/home/sebille/armbian-build/output/images/Armbian-unofficial_26.05.0-trunk_Rockpi-4bplus_noble_current_6.18.20.img}"
MOUNTPOINT_TO_CLEAN="${MOUNTPOINT_TO_CLEAN:-/mnt/rockpi}"
LOOP_TO_CLEAN="${LOOP_TO_CLEAN:-/dev/loop31}"

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

# 1. Unmount/cleanup from previous experiments
sudo umount "$MOUNTPOINT_TO_CLEAN" 2>/dev/null || true
sudo losetup -d "$LOOP_TO_CLEAN" 2>/dev/null || true

# 2-3. Detect card
lsblk

# 4. Write image
sudo dd if="$IMAGE_PATH" of="$DEVICE" bs=4M status=progress conv=fsync

# 5. Ensure buffers are flushed
sudo sync
sync

# Re-read partition table
sudo partprobe "$DEVICE" || true
sleep 1

# 6. Check first ext4 partition instead of full disk node
EXT4_PARTITION="$(lsblk -ln -o NAME,FSTYPE "$DEVICE" | awk '$2 == "ext4" {print "/dev/" $1; exit}')"
if [[ -n "$EXT4_PARTITION" ]]; then
    echo "Running e2fsck on detected ext4 partition: $EXT4_PARTITION"
    sudo e2fsck -f "$EXT4_PARTITION"
else
    echo "WARNING: No ext4 partition detected on $DEVICE for e2fsck check." >&2
fi

# 7. Safely eject
sudo eject "$DEVICE"
