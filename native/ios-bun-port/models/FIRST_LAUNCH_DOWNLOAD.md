# App Store / TestFlight — Model Download on First Launch

This is the **design spec** for downloading the first-light GGUF model on
first launch in App Store and TestFlight builds. Implementation lives in
the React chat UI plus a thin Swift `URLSession`-backed downloader in the
iOS host; this document is what they have to satisfy.

## Why download-on-first-launch

- The cellular install cap for iOS App Store binaries is **200 MB**. Above
  that, Apple shows a "Wi-Fi required" gate on install. Our first-light
  GGUF is ~491 MB, so it cannot ship in the .ipa.
- Bundling a 491 MB model also bloats every TestFlight update with a full
  redownload of the model on every binary push, which is wasteful and slow.
- Decoupling model delivery from the binary lets us:
  - Ship binary fixes without re-pushing the model
  - Swap models (Qwen2.5 → newer Qwen or Eliza-1) without a binary release
  - Offer multiple model sizes from the same .ipa (small / large)

## Where the model lands

```
~/Library/Application Support/Milady/models/first-light.gguf
```

Resolved at runtime by the bridge as
`paths_app_support() + "/models/first-light.gguf"`. The directory must be
created with `fs_mkdir(path, recursive: true)` before the download
starts.

The Swift downloader **must** mark the final file with
`URLResourceKey.isExcludedFromBackupKey = true` after the download
succeeds and the SHA verifies. This keeps the 491 MB GGUF out of iCloud
backups (Apple counts model files toward the user's iCloud quota
otherwise, and they will reinstate the file on device restore — which is
both wasteful and broken since we will already re-download it on first
launch of a fresh install).

```swift
var resourceValues = URLResourceValues()
resourceValues.isExcludedFromBackup = true
try fileURL.setResourceValues(resourceValues)
```

## First-run flow

A three-screen first-run sequence runs the first time the app is
launched with no valid model on disk:

### Screen 1 — Welcome

> **Milady runs on your phone.**
>
> Milady talks to a small AI model that lives on your device — nothing
> you say leaves your phone unless you ask it to.
>
> [ Continue ]

### Screen 2 — Download consent

> **Download Milady's first model.**
>
> Milady needs to download a small AI model (~491 MB) to your phone.
> This is a one-time download. It will take 1–2 minutes on Wi-Fi.
>
> ⚠️ This is a large file. Connect to Wi-Fi to avoid using cellular data.
>
> [ ] Allow over cellular (uses ~491 MB of your data plan)
>
> [ Download on Wi-Fi ] [ Cancel ]

Default: **Wi-Fi only**. The cellular checkbox is opt-in; the button
label changes to "Download now" when ticked. If the user is currently on
cellular and the toggle is off, the button becomes "Waiting for Wi-Fi…"
and the app starts the download automatically when Wi-Fi is detected.

This is enforced via `URLSessionConfiguration.allowsCellularAccess`,
which we set to the checkbox value. Apple's `URLSession` then
transparently waits for Wi-Fi.

### Screen 3 — Progress

A single progress bar with:
- Percent complete (from `URLSessionDownloadTask.progress`)
- Bytes downloaded / total bytes
- Estimated time remaining (computed from the rolling 5-second
  throughput)
- A small line: "Downloading first-light.gguf from huggingface.co"
- [ Pause ] / [ Resume ] button
- [ Cancel ] link

On completion, the screen flips to a brief "Verifying…" state while the
SHA256 is recomputed, then transitions into the chat UI.

## Download mechanics

### URLSession configuration

```swift
let config = URLSessionConfiguration.background(withIdentifier:
    "ai.eliza.milady.model-download.first-light")
config.allowsCellularAccess = userOptedIntoCellular
config.isDiscretionary = false           // Don't let iOS defer indefinitely.
config.sessionSendsLaunchEvents = true   // Wake the app on completion.
config.timeoutIntervalForRequest = 60
config.timeoutIntervalForResource = 60 * 60 * 4  // 4h ceiling.
```

A **background** `URLSession` is used so the download survives the user
backgrounding the app — important for a 491 MB transfer on slow
networks. The app handles `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
and resumes wiring up the download delegates.

### Resume support

`URLSessionDownloadTask` natively supports resume:
- On pause, call `cancel(byProducingResumeData:)` and persist the
  returned `Data` blob to
  `paths_caches() + "/first-light-resume-data.bin"`.
- On resume, restore the blob and call
  `downloadTask(withResumeData:)`.
- On app cold-start with a pending resume blob, automatically continue
  the download once consent is re-confirmed.

If the server doesn't honor the resume request (no `ETag` /
`Last-Modified` match), `URLSession` reports an error and we fall back to
a fresh download. HuggingFace's CDN (`cas-bridge.xethub.hf.co` /
CloudFront) supports range requests and stable ETags, so resume should
work in practice.

### SHA256 verification

The expected SHA256 comes from `manifest.json` (this directory) and is
**embedded in the app binary at build time** — the app does not fetch it
at runtime. This prevents a CDN compromise from feeding us a different
file.

Verification is incremental:
- During download, the delegate streams bytes into both the file
  and a running `SHA256.init()` accumulator (CryptoKit).
- On completion, finalize the accumulator and compare to the expected
  hex.
- If it matches, move the file into place atomically:
  `~/Library/Application Support/Milady/models/first-light.gguf.partial`
  → `…/first-light.gguf`
- If it doesn't match, delete the partial file and retry **once** with a
  fresh download (no resume blob). If the second attempt also fails,
  surface the error to the user.

### Manifest write

After the file lands and is marked excluded-from-backup, write
`~/Library/Application Support/Milady/models/manifest.json`:

```json
{
  "version": 1,
  "models": [
    {
      "name": "first-light.gguf",
      "size_bytes": 491400032,
      "sha256": "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
      "source_url": "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
      "installed_at": "<ISO-8601 UTC>",
      "chat_template": "chatml"
    }
  ]
}
```

The chat UI reads this on every boot before calling `llama_load_model`.
If the file is missing, the size mismatches, or the SHA fails, the
first-run download runs again.

## Error states

Each row defines: the user-visible message, the recovery action, and
whether retry is automatic.

| State                              | Detection                                                       | Message to user                                                                                  | Recovery                                                                                          | Auto retry |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------- |
| Out of storage                     | `POSIXError.ENOSPC` from move, or pre-check via `FileManager.default.attributesOfFileSystem`. | "Your phone doesn't have enough free space (need ~500 MB). Free up some space and try again."  | Show the iOS storage settings deep-link (`App-Prefs:STORAGE`).                                    | No         |
| Network drop                       | `URLError.networkConnectionLost`, `.notConnectedToInternet`, `.timedOut`. | "Couldn't download the model — your connection dropped. Tap retry when you're online."           | Retry button; auto-resume via background session if Wi-Fi returns within 5 minutes.               | Yes (background) |
| Cellular blocked                   | `URLError.dataNotAllowed`.                                      | "You're on cellular and Wi-Fi-only is on. Connect to Wi-Fi, or allow cellular download below."   | Toggle to allow cellular; resume.                                                                 | No         |
| SHA mismatch                       | Final hash != expected hash.                                    | "The download didn't match the expected file. Retrying once…" (first time) / "Download failed — file didn't verify. Tap retry." (second time). | First failure: silent retry from scratch. Second failure: explicit retry button + a "report problem" link. | Once       |
| Server 4xx/5xx                     | `URLSessionDownloadTask` completes with `response.statusCode >= 400`. | "Couldn't reach the model server (error \<code\>). Try again in a few minutes."                  | Retry button.                                                                                     | No         |
| User cancelled                     | User tapped Cancel.                                             | Drop back to the Welcome screen with a "Resume later" CTA.                                       | Persist resume data; offer to continue on next launch.                                            | N/A        |
| Resume data corrupted              | `URLError.cannotResumeDownload` on resume.                      | Silent — discard resume blob, restart download.                                                  | Restart from byte 0.                                                                              | Yes        |
| App killed mid-download            | Resume data present on next launch.                             | "Resume your download?" with progress bar showing existing position.                             | Tap to resume; tap to cancel.                                                                     | N/A        |

## Observability

For TestFlight + early App Store rollout, the iOS host should log
(via the structured logger, never `print` / `console`):

- Start: URL, expected size, expected SHA prefix, cellular allowed (y/n)
- Progress: every 10% mark, with bytes/sec
- Pause / resume / cancel events
- Completion: actual bytes, actual SHA, elapsed seconds, throughput
- Errors: each with the `URLError.Code`, HTTP status if any, and
  whether a retry was attempted

No PII. Logs feed the same in-app diagnostics pane that Milady uses for
LLM-call traces.

## Permission to skip download

Power users (and CI smoke tests) can bypass the first-run download
by side-loading the file via Finder → iTunes File Sharing or by running
`download-first-light.sh` on a dev build. The app's boot sequence
checks for a valid `first-light.gguf` first (whether bundled or in
Application Support) and skips the download flow entirely when found.
