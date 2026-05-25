# Security smoke test — manual install-then-update verification

Used to validate the L-1 signed-update path end-to-end after the first
production key ceremony. Signing requires a hardware token in the offline
ceremony machine, so this flow cannot be fully automated in CI.

## Prerequisites

- Production binary built with the real
  `RELEASE_SIGNING_PUBLIC_KEY_BASE64` (no placeholder).
- A signed artifact `milady-<platform>-<version>.zip` accompanied by
  `milady-<platform>-<version>.zip.sig` (raw Ed25519, 64 bytes).
- A second artifact intentionally signed with the wrong key for the
  rejection test.

## Happy path

1. Install the prior released version of Milady from the public release
   channel.
2. Confirm `~/Library/Application Support/Milady/update.log` is empty.
3. Trigger the in-app "check for updates" action.
4. Expect: the updater downloads both the artifact and `.sig`, calls
   `verifyUpdateArtifact`, sees `ok: true`, applies the update, and
   restarts.
5. After restart, confirm:
   - `update.log` contains a `kms.key.access` success event.
   - The previous binary is retained under `~/Library/Application Support/Milady/previous/`
     with mtime set; it will be reaped after
     `ROLLBACK_RETENTION_DAYS` (7).

## Bad-signature rejection

1. Repeat steps 1–3 above but point the updater to the
   wrong-key-signed artifact.
2. Expect: `VerifyOutcome.ok === false`, `reason === "signature_mismatch"`.
3. UI surfaces an error toast: "Update verification failed."
4. `update.log` records a `plugin.denied` event with
   `metadata.reason = "signature_mismatch"`.
5. Counter increments; on the third consecutive failure the updater
   refuses further attempts and shows the "manual update required"
   dialog.

## Placeholder-key safety

Run the same flow against a build that still has the placeholder
embedded key. Expect every attempt to short-circuit with
`reason === "placeholder_key_in_use"` BEFORE any network call.

## Browser extension permission flow

1. Install the extension into Chrome.
2. Open `chrome://extensions/`, expand "Details" — host permissions
   should list ONLY `eliza.how` and `eliza.dev` (and subdomains).
3. Visit `https://example.com`. The content script must NOT inject.
4. From the extension popup, request access to `example.com`. Chrome
   prompts the user; on accept the optional host permission is granted
   for that origin only.
