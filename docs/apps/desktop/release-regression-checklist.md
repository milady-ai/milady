---
title: "Desktop Release Regression Checklist"
sidebarTitle: "Desktop Regression Checklist"
description: "Manual desktop release checklist kept in sync with the regression matrix contract."
---

Use this checklist for the manual desktop behaviors that still require human verification before release. The source-of-truth inventory lives in `test/regression-matrix.json`; this page mirrors the manual-only descriptions that the repo still expects to track explicitly.

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

## Permissions And Hardware

- Photo quality is acceptable at default settings (hardware)
- Requesting accessibility opens System Preferences (OS interaction)
- Permission status reflects actual system state (OS interaction)
- Power state reflects actual battery status (hardware)

## Context Menu

- Context menu appears at cursor position (visual)
- Context menu closes when clicking elsewhere (visual)

When automated coverage lands for any item above, update both this checklist and `test/regression-matrix.json` in the same change.
