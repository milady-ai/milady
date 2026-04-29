#!/system/bin/sh
# launch-on-device.sh — run on the Android device itself to daemonise bun so
# it survives the adb shell session that kicks it off. adb shell does not
# fully detach background processes, even with `setsid + nohup + < /dev/null`,
# because the device-side shell stays in adb's process group; killing adb's
# child reaps the lot. The classic double-fork through setsid handles it.

DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp}
LD_NAME=${LD_NAME:-ld-musl-x86_64.so.1}
PORT=${PORT:-31337}
LOG=${DEVICE_DIR}/server.log

cd "$DEVICE_DIR" || exit 1
pkill -f "${DEVICE_DIR}/bun" 2>/dev/null
sleep 1

# Double-fork: setsid creates a new session, then we exec bun in a sub-shell
# that itself has no controlling terminal and a closed stdin. The outer
# shell exits immediately so adb shell returns without lingering.
(
  setsid sh -c "exec </dev/null >\"$LOG\" 2>&1; LD_LIBRARY_PATH=\"$DEVICE_DIR\" PORT=\"$PORT\" exec \"$DEVICE_DIR/$LD_NAME\" \"$DEVICE_DIR/bun\" \"$DEVICE_DIR/server.js\"" &
) &
disown 2>/dev/null || true
exit 0
