#!/usr/bin/env bash
set -euo pipefail

packages=(
  react
  react-dom
  vite
  @types/react
  @types/react-dom
  @types/three
  tailwindcss
  three
  clsx
  class-variance-authority
  tailwind-merge
  sonner
  @radix-ui/react-checkbox
  @radix-ui/react-dialog
  @radix-ui/react-dropdown-menu
  @radix-ui/react-label
  @radix-ui/react-popover
  @radix-ui/react-select
  @radix-ui/react-separator
  @radix-ui/react-slider
  @radix-ui/react-slot
  @radix-ui/react-switch
  @radix-ui/react-tabs
  @radix-ui/react-tooltip
  @capacitor/core
  @capacitor/haptics
  @capacitor/keyboard
  @capacitor/preferences
  @xterm/xterm
  @xterm/addon-fit
)

for attempt in 1 2 3; do
  if bun add --no-save --dev --ignore-scripts "${packages[@]}"; then
    exit 0
  fi

  if [[ "$attempt" -eq 3 ]]; then
    echo "Published-workspace fallback dependency install failed after ${attempt} attempts" >&2
    exit 1
  fi

  echo "Published-workspace fallback dependency install failed on attempt ${attempt}; retrying in 15 seconds"
  sleep 15
done
