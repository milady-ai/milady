# LifeOps — Safari Web Extension wrapper

This directory holds the Xcode project that wraps the shared web-extension
source tree (`../dist/safari/`) into a Safari App Extension installable on
macOS and iOS.

## One-time setup (Mac with Xcode)

1. Build the shared bundle:
   ```sh
   cd .. && bun run build:safari
   ```
2. Open the wrapper in Xcode:
   ```sh
   open LifeOps.xcodeproj
   ```
   The Xcode project is scaffolded via Xcode's
   **File → New → Project → Safari Extension App** template, then point its
   extension target's **Resources** folder at `../dist/safari/`. Rebuild
   whenever the shared bundle changes.
3. Select the **LifeOps (iOS)** or **LifeOps (macOS)** scheme and run.
4. Enable the extension in **Safari → Settings → Extensions**.

## Why only a README here?

The Xcode project binary is generated from Xcode itself and must be opened
on a Mac with a signing identity; we commit the shared web-extension
source (which is the only thing that actually changes between releases)
and let Xcode own the native wrapper metadata.

Until the wrapper project is committed, use
`xcrun safari-web-extension-converter ../dist/safari` to bootstrap it.
