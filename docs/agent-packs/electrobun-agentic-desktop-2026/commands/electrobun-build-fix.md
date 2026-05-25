# /electrobun-build-fix

Diagnose and fix Bun/Electrobun build failures.

Steps:

1. Capture exact command and error.
2. Classify: TypeScript, Bun runtime, dependency/lockfile, Electrobun config, view entrypoint/copy asset, CEF/native renderer, signing/notarization, updater/release, platform-specific native issue, test-only issue.
3. Make minimal fix.
4. Re-run focused build/test.
5. Summarize root cause and prevention hook/automation if applicable.
