#!/bin/sh
# Bridge Sevalla/PaaS PORT env var to MILADY_PORT.
# Sevalla injects PORT at runtime; Milady reads MILADY_PORT.
export MILADY_PORT="${PORT:-2138}"
export MILADY_API_BIND="${MILADY_API_BIND:-0.0.0.0}"

echo "[docker-entrypoint] PORT=$PORT → MILADY_PORT=$MILADY_PORT, BIND=$MILADY_API_BIND"
exec node milady.mjs start
