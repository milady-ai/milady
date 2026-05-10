#!/usr/bin/env bash
# miladyos-dev.sh — single entry-point for MiladyOS / Cuttlefish dev.
#
# Usage:
#   ./scripts/miladyos-dev.sh <command>
#
# Commands:
#   status            Show what's running (cvd, adb device, agent, web UI port)
#   web               Print the WebRTC URL(s) for browser + LAN access
#   logs              Tail logcat for ai.milady.milady (Ctrl-C to stop)
#   agent-logs        Tail just the ElizaAgent JS logs
#   shell             Open an adb shell on the cuttlefish device
#   restart-app       Force-stop ai.milady.milady and re-launch the activity
#   push-agent        Rebuild only the on-device agent bundle and push it (no APK rebuild)
#   rebuild-apk       Rebuild the privileged APK from source
#   reflash           Re-stage APK in vendor/, run AOSP m -j6, restart cvd
#   stop              Stop all cvd instances + cuttlefish-host-resources
#   start             Start cuttlefish-host-resources and launch a fresh cvd
#   reset             Stop, reset, then start (clean slate)
#   open              Open the WebRTC UI in your default browser
#
# Requires: adb, cvd (cuttlefish-base+user installed), bun, AOSP at ~/aosp.

set -euo pipefail

readonly MILADY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly AOSP_ROOT="${AOSP_ROOT:-$HOME/aosp}"
readonly CVD_DEVICE="0.0.0.0:6520"
readonly LUNCH_TARGET="milady_cf_x86_64_phone-trunk_staging-userdebug"
readonly OPERATOR_PORT=1443
readonly LAN_IP="$(ip -4 -o addr show 2>/dev/null | awk '$2 !~ /^(lo|cvd|docker|br|tailscale|virbr)/ && $4 ~ /^192\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./ { sub("/.*","",$4); print $4; exit }')"

fail() { printf "\033[31merror:\033[0m %s\n" "$*" >&2; exit 1; }
say()  { printf "\033[36m▸\033[0m %s\n" "$*"; }

require() { command -v "$1" >/dev/null || fail "missing command: $1"; }

ensure_host_resources() {
  if [[ ! -L /sys/class/net/cvd-ebr ]] && ! ip link show cvd-ebr >/dev/null 2>&1; then
    say "starting cuttlefish-host-resources (tap interfaces)…"
    sudo SYSTEMCTL_SKIP_REDIRECT=1 /etc/init.d/cuttlefish-host-resources start || true
  fi
  if ! pgrep -f "/usr/lib/cuttlefish-common/bin/operator" >/dev/null; then
    say "starting cuttlefish-operator (web UI on :${OPERATOR_PORT})…"
    sudo SYSTEMCTL_SKIP_REDIRECT=1 /etc/init.d/cuttlefish-operator start || true
  fi
}

cmd_status() {
  printf "\033[1mMiladyOS dev status\033[0m\n"
  printf "  AOSP root:    %s\n" "$AOSP_ROOT"
  printf "  Lunch target: %s\n" "$LUNCH_TARGET"
  printf "  Web UI:       https://localhost:%s  (LAN: https://%s:%s)\n" \
    "$OPERATOR_PORT" "${LAN_IP:-?.?.?.?}" "$OPERATOR_PORT"
  printf "  Operator running:    %s\n" \
    "$(pgrep -f /usr/lib/cuttlefish-common/bin/operator >/dev/null && echo yes || echo no)"
  printf "  cvd instances:       "
  sg cvdnetwork -c 'cvd status 2>&1' 2>/dev/null | grep -oE "cvd-[0-9]+ is active" || echo "(none)"
  if adb -s "$CVD_DEVICE" get-state >/dev/null 2>&1; then
    local boot
    boot=$(adb -s "$CVD_DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    printf "  Cuttlefish adb:      reachable (boot_completed=%s)\n" "${boot:-?}"
    printf "  Top activity:        "
    adb -s "$CVD_DEVICE" shell dumpsys window 2>/dev/null | grep -oE 'mFocusedApp=ActivityRecord{[^}]+}' | head -1 | tr -d '\r'
    printf "  Role holders:\n"
    for r in HOME DIALER SMS ASSISTANT BROWSER; do
      printf "    %-9s  %s\n" "$r" \
        "$(adb -s "$CVD_DEVICE" shell cmd role get-role-holders "android.app.role.$r" 2>/dev/null | tr -d '\r')"
    done
  else
    printf "  Cuttlefish adb:      \033[33mnot reachable\033[0m (run 'start')\n"
  fi
}

cmd_web() {
  printf "Browser:        https://localhost:%s\n" "$OPERATOR_PORT"
  if [[ -n "${LAN_IP:-}" ]]; then
    printf "LAN (friend):   https://%s:%s\n" "$LAN_IP" "$OPERATOR_PORT"
    printf "    (requires ufw allow from <subnet> to any port %s proto tcp)\n" "$OPERATOR_PORT"
  fi
  printf "Click 'Show All' or the device toggle to open the phone stream.\n"
}

cmd_open() {
  cmd_web
  xdg-open "https://localhost:${OPERATOR_PORT}" >/dev/null 2>&1 || true
}

cmd_logs()       { adb -s "$CVD_DEVICE" logcat -v time | grep --line-buffered -E "ai\.milady\.milady|ElizaAgent|Capacitor|Chromium|FATAL"; }
cmd_agent_logs() { adb -s "$CVD_DEVICE" logcat -v time ElizaAgent:V '*:S'; }
cmd_shell()      { adb -s "$CVD_DEVICE" shell; }

cmd_restart_app() {
  say "force-stopping + re-launching ai.milady.milady"
  adb -s "$CVD_DEVICE" shell am force-stop ai.milady.milady
  adb -s "$CVD_DEVICE" shell am start -W -n ai.milady.milady/.MainActivity
}

cmd_push_agent() {
  say "rebuilding eliza/packages/agent mobile bundle…"
  ( cd "$MILADY_ROOT" && bun run --cwd eliza/packages/agent build:mobile )
  local bundle="$MILADY_ROOT/eliza/packages/agent/dist-mobile/agent-bundle.js"
  [[ -f "$bundle" ]] || fail "agent bundle not produced at $bundle"

  say "pushing agent bundle to /data/local/tmp (then mv with run-as if needed)"
  adb -s "$CVD_DEVICE" push "$bundle" /data/local/tmp/agent-bundle.js
  # Privileged platform-cert release builds aren't `run-as`-able. Use 'su 0' since
  # cuttlefish userdebug has root-via-adb available.
  adb -s "$CVD_DEVICE" root >/dev/null 2>&1 || true
  adb -s "$CVD_DEVICE" wait-for-device
  adb -s "$CVD_DEVICE" shell "cp /data/local/tmp/agent-bundle.js /data/data/ai.milady.milady/files/agent/agent-bundle.js && chown u0_a36:u0_a36 /data/data/ai.milady.milady/files/agent/agent-bundle.js"
  cmd_restart_app
}

cmd_rebuild_apk() {
  say "rebuilding privileged Milady APK (vite + capacitor + gradle, ~3-10 min)…"
  cd "$MILADY_ROOT"
  MILADY_AOSP_BUILD=1 MILADY_GRADLE_AOSP_BUILD=true bun run build:android:system
  ls -la "$MILADY_ROOT/os/android/vendor/milady/apps/Milady/Milady.apk"
}

cmd_reflash() {
  cmd_rebuild_apk
  say "validating staged vendor tree…"
  ( cd "$MILADY_ROOT" && bun run miladyos:validate -- --aosp-root "$AOSP_ROOT" )
  say "syncing vendor/milady → $AOSP_ROOT/vendor/milady"
  node "$MILADY_ROOT/eliza/scripts/distro-android/sync-to-aosp.mjs" \
    --brand-config "$MILADY_ROOT/os/android/brand.milady.json" \
    --source-vendor "$MILADY_ROOT/os/android/vendor/milady" \
    "$AOSP_ROOT"
  # Default parallelism is light (-j3) so the host stays usable for other
  # work; override with `MILADYOS_AOSP_J=6` if you have spare CPU.
  local j_flag="${MILADYOS_AOSP_J:-3}"
  say "running incremental m -j${j_flag} (~5-15 min)…"
  ( cd "$AOSP_ROOT" && nice -n 19 ionice -c 3 bash -lc "source build/envsetup.sh && lunch $LUNCH_TARGET && m -j${j_flag}" )
  cmd_reset
}

cmd_stop() {
  say "stopping cvd instances…"
  sg cvdnetwork -c 'cvd reset -y' || true
}

cmd_start() {
  ensure_host_resources
  # Default to half the host's cores and ~40% of RAM so the VM can run
  # llama at workable speeds without locking up the laptop. Override via
  # MILADYOS_CVD_CPUS / MILADYOS_CVD_MEM_MB. nproc fallback to 4, RAM
  # fallback to 4 GB if /proc/meminfo isn't readable.
  local host_cores host_mem_mb cvd_cpus cvd_mem_mb
  host_cores=$(nproc 2>/dev/null || echo 4)
  host_mem_mb=$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo 2>/dev/null)
  : "${host_mem_mb:=4096}"
  cvd_cpus="${MILADYOS_CVD_CPUS:-$(( host_cores > 2 ? host_cores - 2 : host_cores ))}"
  cvd_mem_mb="${MILADYOS_CVD_MEM_MB:-$(( host_mem_mb * 4 / 10 ))}"
  say "launching MiladyOS in cuttlefish (cvd create --daemon, cpus=${cvd_cpus} mem=${cvd_mem_mb}MB)…"
  sg cvdnetwork -c "cd $AOSP_ROOT && source build/envsetup.sh >/dev/null 2>&1 && lunch $LUNCH_TARGET >/dev/null 2>&1 && cvd create --host_path=\$ANDROID_HOST_OUT --product_path=\$ANDROID_PRODUCT_OUT --daemon --report_anonymous_usage_stats=n --gpu_mode=gfxstream_guest_angle_host_swiftshader --cpus=${cvd_cpus} --memory_mb=${cvd_mem_mb}"
  say "waiting for sys.boot_completed…"
  for _ in $(seq 1 90); do
    [[ "$(adb -s "$CVD_DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]] && break
    sleep 5
  done
  cmd_status
  cmd_web
}

cmd_reset() { cmd_stop; cmd_start; }

main() {
  require adb
  require sg
  require bun
  case "${1:-status}" in
    status)         cmd_status ;;
    web)            cmd_web ;;
    open)           cmd_open ;;
    logs)           cmd_logs ;;
    agent-logs)     cmd_agent_logs ;;
    shell)          cmd_shell ;;
    restart-app)    cmd_restart_app ;;
    push-agent)     cmd_push_agent ;;
    rebuild-apk)    cmd_rebuild_apk ;;
    reflash)        cmd_reflash ;;
    stop)           cmd_stop ;;
    start)          cmd_start ;;
    reset)          cmd_reset ;;
    -h|--help|help) sed -n '2,/^set -/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; /^set -/d' ;;
    *) fail "unknown command: ${1:-}. run 'miladyos-dev.sh help' for list." ;;
  esac
}

main "$@"
