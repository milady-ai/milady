# M07 — Real device hello-world

**Owner:** TBD
**Status:** Not started
**Predecessors:** M06
**Successors:** M08

## Goal

Same as M06 but on a physical iOS device. Code-signed, sandboxed, real.

## Acceptance Criteria

- [ ] Same hello.js output as M06, on iPhone 15 Pro or later.
- [ ] Code-signed with a Developer certificate (fastlane match-managed).
- [ ] `os.homedir()` returns `~/Library/Application Support/Milady/` (inside the app's container).
- [ ] `os.tmpdir()` returns `NSTemporaryDirectory()` (`Library/Caches/`).
- [ ] `fs.readFile(<bundled-resource>)` works.
- [ ] `fs.writeFile(documents/foo.txt, "test")` works.
- [ ] `fs.writeFile("/etc/foo", ...)` throws `EACCES` (sandbox enforcement).
- [ ] No crashes from missing entropy sources, missing system frameworks, or signal-handler mismatches.
- [ ] Console output viewable via `Console.app` filtered by app bundle ID.
- [ ] App suspended-then-resumed cleanly (no crash on `applicationWillResignActive` / `applicationDidBecomeActive`).

## Diagnostic checklist

1. **Code signing.** If the build crashes immediately, check provisioning profile. Use `codesign -dv --verbose=4 HelloApp.app` to verify.
2. **Sandbox path.** `os.homedir()` on iOS returns `/var/mobile/Containers/Data/Application/<UUID>/`. The app's "home" is that container, not `/var/mobile/`.
3. **Entropy.** `crypto.randomBytes(16)` should work via `SecRandomCopyBytes`. If it hangs, BoringSSL's entropy init may be looking for `/dev/random` — patch to use `arc4random_buf` or `SecRandomCopyBytes`.
4. **Suspend/resume.** iOS suspends the app process ~5s after backgrounding. Bun's event loop should pause cleanly. If it doesn't (e.g., a timer fires during suspend), kqueue may be paused. Test by backgrounding for 30s, foregrounding, verify no crash.
5. **Bitcode.** Apple removed Bitcode requirement in iOS 14+, but if the Xcode project still has `ENABLE_BITCODE=YES` and `libbun.a` was built without bitcode, link fails. Disable bitcode.

## Effort estimate

- Nominal: 1 week
- With sandbox debugging: 2 weeks
