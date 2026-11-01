#!/usr/bin/env bash
set -euo pipefail

ROOTFS_PATH="${1:-/media/sebille/armbi_root}"
WIFI_SSID="${WIFI_SSID:-Livebox-D5F8}"
WIFI_PSK="${WIFI_PSK:-ZxChXVG3Jt94J6z5n3}"
FORCE_REWRITE_WIFI_PROFILE="${FORCE_REWRITE_WIFI_PROFILE:-no}"

if [[ "${EUID}" -ne 0 ]]; then
	echo "Run as root: sudo $0 [rootfs_path]" >&2
	exit 1
fi

if [[ ! -d "${ROOTFS_PATH}" ]]; then
	echo "Rootfs path not found: ${ROOTFS_PATH}" >&2
	exit 2
fi

if [[ ! -d "${ROOTFS_PATH}/etc" ]]; then
	echo "Invalid rootfs (missing /etc): ${ROOTFS_PATH}" >&2
	exit 3
fi

echo "[qa-wifi-debug] Patching mounted rootfs at ${ROOTFS_PATH}"

# 1) Persistent journald.
mkdir -p "${ROOTFS_PATH}/etc/systemd/journald.conf.d"
cat >"${ROOTFS_PATH}/etc/systemd/journald.conf.d/10-qa-persistent-journal.conf" <<'EOF'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=200M
RuntimeMaxUse=100M
EOF

mkdir -p "${ROOTFS_PATH}/var/log/journal"
if chroot "${ROOTFS_PATH}" getent group systemd-journal >/dev/null 2>&1; then
	chown root:systemd-journal "${ROOTFS_PATH}/var/log/journal"
else
	chown root:root "${ROOTFS_PATH}/var/log/journal"
fi
chmod 2755 "${ROOTFS_PATH}/var/log/journal"

# 2) Ensure NetworkManager actually manages interfaces.
mkdir -p "${ROOTFS_PATH}/etc/NetworkManager"
cat >"${ROOTFS_PATH}/etc/NetworkManager/NetworkManager.conf" <<'EOF'
[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
EOF

mkdir -p "${ROOTFS_PATH}/etc/netplan"
cat >"${ROOTFS_PATH}/etc/netplan/00-default-use-network-manager.yaml" <<'EOF'
# Added by Armbian
network:
  version: 2
  renderer: NetworkManager
EOF
chmod 600 "${ROOTFS_PATH}/etc/netplan/00-default-use-network-manager.yaml"

mkdir -p "${ROOTFS_PATH}/etc/NetworkManager/system-connections"
WIFI_PROFILE_PATH="${ROOTFS_PATH}/etc/NetworkManager/system-connections/wifi.nmconnection"
if [[ ! -f "${WIFI_PROFILE_PATH}" || "${FORCE_REWRITE_WIFI_PROFILE}" == "yes" ]]; then
	cat >"${WIFI_PROFILE_PATH}" <<EOF
[connection]
id=wifi
type=wifi
autoconnect=true
autoconnect-priority=10

[wifi]
mode=infrastructure
ssid=${WIFI_SSID}

[wifi-security]
auth-alg=open
key-mgmt=wpa-psk
psk=${WIFI_PSK}

[ipv4]
method=auto

[ipv6]
method=auto
EOF
	chmod 600 "${WIFI_PROFILE_PATH}"
fi

# 3) First-boot diagnostics service and script.
mkdir -p "${ROOTFS_PATH}/usr/local/sbin"
cat >"${ROOTFS_PATH}/usr/local/sbin/firstboot-wifi-debug.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

STAMP_FILE="/var/lib/rockpi-wifi-debug.firstboot.done"
OUT_DIR="/var/log/rockpi-wifi-debug"
mkdir -p /var/lib "$OUT_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/firstboot-${TS}.log"

exec >"$OUT_FILE" 2>&1

echo "# Rock Pi first-boot Wi-Fi diagnostics"
echo "# generated at: $(date -u --iso-8601=seconds 2>/dev/null || date -u)"

run_if_exists() {
	local cmd="$1"
	shift || true
	if command -v "$cmd" >/dev/null 2>&1; then
		echo
		echo "## $cmd $*"
		"$cmd" "$@" || true
	fi
}

run_if_exists uname -a
run_if_exists ip a
run_if_exists ip r
run_if_exists rfkill list all
run_if_exists iw dev
run_if_exists iw reg get
run_if_exists nmcli general status
run_if_exists nmcli device status
run_if_exists nmcli connection show
run_if_exists systemctl status NetworkManager --no-pager
run_if_exists systemctl status wpa_supplicant --no-pager

echo
echo "## dmesg wifi-related"
dmesg -T 2>/dev/null | grep -Ei 'wlan|wifi|wpa|brcm|cfg80211|firmware|rfkill|dhcp' || true

touch "$STAMP_FILE"
echo
echo "# done"
EOF
chmod 0755 "${ROOTFS_PATH}/usr/local/sbin/firstboot-wifi-debug.sh"

mkdir -p "${ROOTFS_PATH}/etc/systemd/system"
cat >"${ROOTFS_PATH}/etc/systemd/system/firstboot-wifi-debug.service" <<'EOF'
[Unit]
Description=Collect first-boot Wi-Fi diagnostics for QA
After=network-pre.target NetworkManager.service wpa_supplicant.service
Wants=NetworkManager.service wpa_supplicant.service
ConditionPathExists=!/var/lib/rockpi-wifi-debug.firstboot.done

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/firstboot-wifi-debug.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "${ROOTFS_PATH}/etc/systemd/system/multi-user.target.wants"
ln -sf /etc/systemd/system/firstboot-wifi-debug.service \
	"${ROOTFS_PATH}/etc/systemd/system/multi-user.target.wants/firstboot-wifi-debug.service"

rm -f "${ROOTFS_PATH}/var/lib/rockpi-wifi-debug.firstboot.done"

echo "[qa-wifi-debug] Rootfs patch complete. Reboot Rock Pi with this card."
