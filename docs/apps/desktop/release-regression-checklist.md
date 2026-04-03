# Electrobun Release Regression Checklist

Use this checklist for the manual desktop behaviors that still require human judgment before an Electrobun release is published. The canonical inventory lives in `test/regression-matrix.json`; this document is the human signoff companion for those manual-only items.

Automated packaged UI validation remains a Windows CI gate via `bun run test:desktop:playwright`. Local macOS validation should use the strict signed smoke gate `bun run test:desktop:packaged` when a Developer ID identity is available, and reserve `bun run test:desktop:packaged:unsigned` for ad-hoc local debugging only; neither path provides Playwright parity.

## Tray Icon And Menu

- Tray icon appears in the macOS menu bar after app launch (visual)
- Left-clicking the tray icon opens the companion window (visual)
- Right-clicking the tray icon shows the tray context menu (visual)
- Tray icon persists after main window is closed (visual)
- Tray icon is removed when the app quits (visual)

## Window Effects

- Main window has native vibrancy effect (frosted glass) on macOS (visual)
- Window can be dragged by clicking the header region (visual)
- Window retains vibrancy when resized (visual)

## Context Menu

- Context menu appears at cursor position (visual)
- Context menu closes when clicking elsewhere (visual)

## Permissions And Hardware

- Photo quality is acceptable at default settings (hardware)
- Requesting accessibility opens System Preferences (OS interaction)
- Permission status reflects actual system state (OS interaction)
- Power state reflects actual battery status (hardware)
