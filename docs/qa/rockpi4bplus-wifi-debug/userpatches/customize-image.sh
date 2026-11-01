#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# QA customize-image hook for Rock Pi 4B+ Wi-Fi investigations.
# This runs inside the target rootfs during Armbian image build.

log() {
	echo "[qa-wifi-debug] $*"
}

WIFI_SSID="${WIFI_SSID:-Livebox-D5F8}"
WIFI_PSK="${WIFI_PSK:-ZxChXVG3Jt94J6z5n3}"
ROCKPI_HOSTNAME="${ROCKPI_HOSTNAME:-rockpi4bplus}"
ROCKPI_TIMEZONE="${ROCKPI_TIMEZONE:-Europe/Paris}"
ROCKPI_USER="${ROCKPI_USER:-sebille}"
ROCKPI_PASSWORD="${ROCKPI_PASSWORD:-SebilleMat3103*}"
ROCKPI_SUDO_NOPASSWD="${ROCKPI_SUDO_NOPASSWD:-yes}"
ROCKPI_DISABLE_HEARTBEAT_LED="${ROCKPI_DISABLE_HEARTBEAT_LED:-yes}"

log "customizing image with Wi-Fi provisioning + QA diagnostics"

# Ensure core networking tooling is present.
apt-get update
apt-get install -y -o Dpkg::Options::="--force-confold" \
	network-manager network-manager-openvpn wpasupplicant dbus sudo openssh-server rfkill iw

# Enable required services.
systemctl enable dbus.service || true
systemctl enable NetworkManager.service || true
systemctl enable ssh.service || true

# Configure hostname/timezone/user for first login.
echo "${ROCKPI_HOSTNAME}" >/etc/hostname
if [[ -f /etc/hosts ]]; then
	sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1\\t${ROCKPI_HOSTNAME}/" /etc/hosts || true
fi
ln -sf "/usr/share/zoneinfo/${ROCKPI_TIMEZONE}" /etc/localtime || true

useradd -m -s /bin/bash -G sudo "${ROCKPI_USER}" 2>/dev/null || true
echo "${ROCKPI_USER}:${ROCKPI_PASSWORD}" | chpasswd
if [[ "${ROCKPI_SUDO_NOPASSWD}" == "yes" ]]; then
	echo "${ROCKPI_USER} ALL=(ALL) NOPASSWD:ALL" >/etc/sudoers.d/"${ROCKPI_USER}"
	chmod 440 /etc/sudoers.d/"${ROCKPI_USER}"
fi

# Disable heartbeat LED trigger by default to avoid confusing continuous blink state.
if [[ "${ROCKPI_DISABLE_HEARTBEAT_LED}" == "yes" ]]; then
	log "installing default LED policy (heartbeat disabled)"

	cat >/usr/local/sbin/rockpi-led-trigger-default.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

set_none_trigger() {
	local led_path="$1"
	[[ -d "$led_path" && -w "$led_path/trigger" ]] || return 1
	echo none >"$led_path/trigger" 2>/dev/null || true
	return 0
}

matched=0
for led in /sys/class/leds/*blue* /sys/class/leds/*red* /sys/class/leds/user*; do
	if set_none_trigger "$led"; then
		matched=1
	fi
done

# Fallback for boards using non-color LED naming.
if [[ "$matched" -eq 0 ]]; then
	for led in /sys/class/leds/*; do
		set_none_trigger "$led" || true
	done
fi
EOF
	chmod 0755 /usr/local/sbin/rockpi-led-trigger-default.sh

	cat >/etc/systemd/system/rockpi-led-trigger-default.service <<'EOF'
[Unit]
Description=Disable default heartbeat LED trigger
After=systemd-udev-settle.service
Wants=systemd-udev-settle.service
ConditionPathExists=/sys/class/leds

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/rockpi-led-trigger-default.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

	mkdir -p /etc/systemd/system/multi-user.target.wants
	ln -sf /etc/systemd/system/rockpi-led-trigger-default.service \
		/etc/systemd/system/multi-user.target.wants/rockpi-led-trigger-default.service

	# Armbian firstrun can force heartbeat as visual feedback on some families.
	if [[ -f /usr/lib/armbian/armbian-firstrun ]]; then
		sed -i \
			's#echo heartbeat >/sys/class/leds/\*red\*/trigger 2>/dev/null || echo heartbeat >/sys/class/leds/\*blue\*/trigger 2>/dev/null#echo none >/sys/class/leds/*red*/trigger 2>/dev/null || echo none >/sys/class/leds/*blue*/trigger 2>/dev/null#g' \
			/usr/lib/armbian/armbian-firstrun || true
	fi
fi

# Force NetworkManager renderer path and a deterministic Wi-Fi profile.
mkdir -p /etc/netplan
cat >/etc/netplan/00-default-use-network-manager.yaml <<'EOF'
# Added by Armbian
# Let NetworkManager manage all devices.
network:
  version: 2
  renderer: NetworkManager
EOF
chmod 600 /etc/netplan/00-default-use-network-manager.yaml

mkdir -p /etc/NetworkManager
cat >/etc/NetworkManager/NetworkManager.conf <<'EOF'
[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
EOF

mkdir -p /etc/NetworkManager/system-connections
cat >/etc/NetworkManager/system-connections/wifi.nmconnection <<EOF
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
chmod 600 /etc/NetworkManager/system-connections/wifi.nmconnection

# --- 1) Ensure persistent journald data survives reboots ---
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/10-qa-persistent-journal.conf <<'EOF'
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=200M
RuntimeMaxUse=100M
EOF

mkdir -p /var/log/journal
if getent group systemd-journal >/dev/null 2>&1; then
	chown root:systemd-journal /var/log/journal
else
	chown root:root /var/log/journal
fi
chmod 2755 /var/log/journal

# --- 2) Install first-boot Wi-Fi debug collector ---
mkdir -p /usr/local/sbin
cat >/usr/local/sbin/firstboot-wifi-debug.sh <<'EOF'
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

echo
echo "## uname"
uname -a || true

echo
echo "## /etc/os-release"
cat /etc/os-release || true

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
chmod 0755 /usr/local/sbin/firstboot-wifi-debug.sh

mkdir -p /etc/systemd/system
cat >/etc/systemd/system/firstboot-wifi-debug.service <<'EOF'
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

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sf /etc/systemd/system/firstboot-wifi-debug.service \
	/etc/systemd/system/multi-user.target.wants/firstboot-wifi-debug.service

rm -f /var/lib/rockpi-wifi-debug.firstboot.done

apt-get clean
rm -rf /var/lib/apt/lists/*

log "customize-image patch applied"
