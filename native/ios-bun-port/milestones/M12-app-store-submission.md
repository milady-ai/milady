# M12 — App Store submission

**Owner:** TBD
**Status:** Not started
**Predecessors:** M11
**Successors:** None (this is the final milestone)

## Goal

App Store accepts a binary built with the Bun-on-iOS port. The Milady app is live in the store with on-device agent + on-device local inference.

## Acceptance Criteria

- [ ] `fastlane release` succeeds end-to-end:
  - Code-signs with Distribution cert
  - Uploads to App Store Connect
  - Submits for review with metadata + screenshots
- [ ] App Review approves the binary.
- [ ] `PrivacyInfo.xcprivacy` is complete:
  - All `NSPrivacyAccessedAPIType*` reasons documented
  - All third-party SDKs listed with their privacy manifests embedded
- [ ] `verify-no-jit.sh` passes on the shipped binary:
  - No `_jit*` symbols
  - No `mmap` with `PROT_EXEC` patterns
  - No `dlopen` of arbitrary paths in disassembly
  - No `posix_spawn` reachable
  - No `fork` reachable
- [ ] Export compliance: encryption-exempt declaration (we use only system crypto + BoringSSL, no novel crypto algorithms).
- [ ] IDFA: not used.
- [ ] App Tracking Transparency: not used (no cross-app tracking).
- [ ] Data collection types declared in App Store Connect match `PrivacyInfo.xcprivacy`.

## Review preparation

Expect 1–2 rejection cycles. Prepare:

### Cover letter (submitted with review)

> Milady is a local-first AI assistant. The app embeds a JavaScript runtime
> (Bun, statically linked) that hosts a bundled JavaScript application
> shipping inside the IPA. The runtime executes only code present in the
> app bundle — no JavaScript is downloaded after install.
>
> The embedded JS interpreter runs in interpreter-only mode (LLInt) with
> JIT compilation disabled at build time. No `mmap` with `PROT_EXEC` is
> ever performed. We have verified the absence of executable-page
> allocation in the shipped binary via static analysis (see attached
> `verify-no-jit-report.txt`).
>
> Local LLM inference uses statically-linked `libllama.a`. The runtime's
> FFI surface (`bun:ffi`) is restricted at build time to symbols
> statically linked into the binary; dynamic loading of arbitrary
> libraries from disk is disabled.
>
> This follows the pattern of other accepted apps that embed JS
> interpreters (React Native, Cordova, Realm, Hyperview, etc.).

### Anticipated review questions

- **Q: Is the embedded interpreter downloading and executing code?**
  A: No. All JS code ships in the IPA as bundled resources. The runtime does not load JS from the network or from user-supplied disk paths.

- **Q: Why does the app need network access?**
  A: Optional cloud LLM fallback for heavy queries; user-configurable. Default-off in App Store builds.

- **Q: What does `bun:ffi` do?**
  A: Calls into specific statically-linked C functions (llama.cpp inference functions) from JavaScript. The function names are compile-time-fixed allow-list; no arbitrary symbol resolution.

- **Q: Why is there a JavaScript runtime in the binary?**
  A: The app's core orchestration logic is written in JavaScript for cross-platform consistency (desktop, Android, iOS). It runs in an interpreter; it is not a JIT.

## Effort estimate

- Nominal: 2 weeks (one submission, one approval)
- With 1 rejection cycle: 3 weeks
- With 2 rejection cycles: 4–5 weeks

## Post-launch

After approval:

- [ ] TestFlight beta with internal testers.
- [ ] Phased rollout (1% → 10% → 100%).
- [ ] Crash dashboard monitoring (Crashlytics or App Store Connect Analytics).
- [ ] Battery drain telemetry (opt-in, aggregated).
- [ ] First-month KPIs: crash-free rate >99.5%, p50 first-token latency <2s, p95 <5s.

## Notes

The Bun port lands here. From this point forward, maintenance is the rebase tax against upstream `oven-sh/bun` + the iOS-specific patches we carry.
