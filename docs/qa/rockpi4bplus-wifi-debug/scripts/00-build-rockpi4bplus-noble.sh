#!/usr/bin/env bash
#
# SPDX-License-Identifier: GPL-2.0
#
# Copyright (c) 2013-2023 Igor Pecovnik, igor@armbian.com
#
# This file is a part of the Armbian Build Framework
# https://github.com/armbian/build/

# Local QA wrapper around Armbian compile.sh behavior.
# Defaults can be overridden via environment variables and/or CLI args.

#set -o pipefail  # trace ERR through pipes - will be enabled "soon"
#set -o nounset   ## set -u : exit the script if you try to use an uninitialised variable - one day will be enabled
set -e
set -o errtrace # trace ERR through - enabled
set -o errexit  ## set -e : exit the script if any statement returns a non-true return value - enabled
# Important, go read http://mywiki.wooledge.org/BashFAQ/105 NOW!

ARMBIAN_BUILD_DIR="${ARMBIAN_BUILD_DIR:-$HOME/armbian-build}"
BOARD="${BOARD:-rockpi-4bplus}"
BRANCH="${BRANCH:-current}"
RELEASE="${RELEASE:-noble}"
BUILD_MINIMAL="${BUILD_MINIMAL:-no}"
BUILD_DESKTOP="${BUILD_DESKTOP:-no}"
KERNEL_CONFIGURE="${KERNEL_CONFIGURE:-no}"
KERNEL_BTF="${KERNEL_BTF:-no}"
ENABLE_QA_WIFI_PATCHES="${ENABLE_QA_WIFI_PATCHES:-yes}"
SYNC_QA_CUSTOMIZE_TO_BUILD_TREE="${SYNC_QA_CUSTOMIZE_TO_BUILD_TREE:-yes}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
QA_USERPATCHES_PATH_DEFAULT="$(cd -- "${SCRIPT_DIR}/.." && pwd)/userpatches"

if [[ "${ENABLE_QA_WIFI_PATCHES}" == "yes" ]]; then
	USERPATCHES_PATH="${USERPATCHES_PATH:-${QA_USERPATCHES_PATH_DEFAULT}}"
	if [[ ! -f "${USERPATCHES_PATH}/customize-image.sh" ]]; then
		echo "Error: QA userpatches enabled but customize-image.sh was not found." >&2
		echo "Expected: ${USERPATCHES_PATH}/customize-image.sh" >&2
		exit 2
	fi
fi

if [[ ! -d "${ARMBIAN_BUILD_DIR}" ]]; then
	echo "Error: Armbian build directory not found: ${ARMBIAN_BUILD_DIR}" >&2
	exit 255
fi

if [[ "${ENABLE_QA_WIFI_PATCHES}" == "yes" && "${SYNC_QA_CUSTOMIZE_TO_BUILD_TREE}" == "yes" ]]; then
	QA_CUSTOMIZE_SOURCE="${USERPATCHES_PATH}/customize-image.sh"
	BUILD_USERPATCHES_DIR="${ARMBIAN_BUILD_DIR}/userpatches"
	BUILD_CUSTOMIZE_TARGET="${BUILD_USERPATCHES_DIR}/customize-image.sh"

	mkdir -p "${BUILD_USERPATCHES_DIR}"
	if [[ -f "${BUILD_CUSTOMIZE_TARGET}" ]] && ! cmp -s "${QA_CUSTOMIZE_SOURCE}" "${BUILD_CUSTOMIZE_TARGET}"; then
		cp -a "${BUILD_CUSTOMIZE_TARGET}" "${BUILD_CUSTOMIZE_TARGET}.bak.$(date +%Y%m%d-%H%M%S)"
	fi
	cp -f "${QA_CUSTOMIZE_SOURCE}" "${BUILD_CUSTOMIZE_TARGET}"
	chmod 0755 "${BUILD_CUSTOMIZE_TARGET}"
	echo "[rockpi4bplus-build] synced customize-image.sh to ${BUILD_CUSTOMIZE_TARGET}"
fi

SRC="${ARMBIAN_BUILD_DIR}"
cd "${SRC}" || exit

# check for whitespace in ${SRC} and exit for safety reasons
grep -q "[[:space:]]" <<< "${SRC}" && {
	echo "\"${SRC}\" contains whitespace. Not supported. Aborting." >&2
	exit 1
}

# Sanity check.
if [[ ! -f "${SRC}"/lib/single.sh ]]; then
	echo "Error: missing build directory structure"
	echo "Please clone the full repository https://github.com/armbian/build/"
	exit 255
fi

# shellcheck source=lib/single.sh
source "${SRC}"/lib/single.sh

# initialize logging variables. (this does not consider parameters at this point, only environment variables)
logging_init

# initialize the traps
traps_init

# make sure git considers our build system dir as a safe dir (only if actually building)
[[ "${CONFIG_DEFS_ONLY}" != "yes" && "${PRE_PREPARED_HOST}" != "yes" ]] && git_ensure_safe_directory "${SRC}"

# Execute the main CLI entrypoint.
if [[ "${ENABLE_QA_WIFI_PATCHES}" == "yes" ]]; then
	echo "[rockpi4bplus-build] QA userpatches enabled via USERPATCHES_PATH=${USERPATCHES_PATH}"
fi

echo "[rockpi4bplus-build] dir=${ARMBIAN_BUILD_DIR} board=${BOARD} branch=${BRANCH} release=${RELEASE}"

args=(
	"BOARD=${BOARD}"
	"BRANCH=${BRANCH}"
	"RELEASE=${RELEASE}"
	"BUILD_MINIMAL=${BUILD_MINIMAL}"
	"BUILD_DESKTOP=${BUILD_DESKTOP}"
	"KERNEL_CONFIGURE=${KERNEL_CONFIGURE}"
	"KERNEL_BTF=${KERNEL_BTF}"
)

if [[ "${ENABLE_QA_WIFI_PATCHES}" == "yes" ]]; then
	args+=("USERPATCHES_PATH=${USERPATCHES_PATH}")
fi

args+=("$@")

cli_entrypoint "${args[@]}"

# Log the last statement of this script for debugging purposes.
display_alert "Armbian build script exiting" "very last thing" "cleanup"
