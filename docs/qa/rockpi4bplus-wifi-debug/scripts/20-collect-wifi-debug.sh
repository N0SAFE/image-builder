#!/usr/bin/env bash
set -Eeuo pipefail

# Run this on the Rock Pi after boot (preferably with sudo)
# to collect all useful Wi-Fi diagnostics in one bundle.

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${1:-/tmp/rockpi4bplus-wifi-debug-$TIMESTAMP}"
ARCHIVE_PATH="${OUT_DIR}.tar.gz"

mkdir -p "$OUT_DIR"

run_capture() {
    local name="$1"
    shift
    {
        echo "# Command"
        printf '%q ' "$@"
        echo
        echo
        "$@"
    } >"$OUT_DIR/${name}.txt" 2>&1 || true
}

run_capture os-release cat /etc/os-release
run_capture uname uname -a
run_capture hostnamectl hostnamectl
run_capture ip-address ip a
run_capture ip-route ip r

if command -v rfkill >/dev/null 2>&1; then
    run_capture rfkill rfkill list all
fi

if command -v iw >/dev/null 2>&1; then
    run_capture iw-dev iw dev
    run_capture iw-reg iw reg get
fi

if command -v nmcli >/dev/null 2>&1; then
    run_capture nmcli-general nmcli general status
    run_capture nmcli-device nmcli device status
    run_capture nmcli-connection nmcli connection show
fi

run_capture lsmod lsmod
run_capture dmesg-wifi sh -c "dmesg -T | grep -Ei 'wlan|wifi|brcm|firmware|cfg80211|rfkill|wpa|80211'"

run_capture systemctl-networkmanager systemctl status NetworkManager --no-pager
run_capture systemctl-wpasupplicant systemctl status wpa_supplicant --no-pager

run_capture journal-networkmanager journalctl -b -u NetworkManager --no-pager
run_capture journal-wpasupplicant journalctl -b -u wpa_supplicant --no-pager

run_capture firmware-list sh -c "ls -la /lib/firmware/brcm /lib/firmware/rtl* 2>/dev/null"

if [[ -f /etc/NetworkManager/NetworkManager.conf ]]; then
    run_capture networkmanager-conf cat /etc/NetworkManager/NetworkManager.conf
fi

if [[ -d /etc/NetworkManager/system-connections ]]; then
    run_capture nm-system-connections-list ls -la /etc/NetworkManager/system-connections
fi

if [[ -d /etc/netplan ]]; then
    run_capture netplan-list ls -la /etc/netplan
fi

tar -czf "$ARCHIVE_PATH" -C "$(dirname "$OUT_DIR")" "$(basename "$OUT_DIR")"

echo "Wi-Fi debug collection complete:"
echo "  directory: $OUT_DIR"
echo "  archive:   $ARCHIVE_PATH"
