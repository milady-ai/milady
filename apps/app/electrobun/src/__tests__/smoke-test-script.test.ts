import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SMOKE_TEST_PATH = path.resolve(
  import.meta.dirname,
  "../../scripts/smoke-test.sh",
);
const ROOT_PACKAGE_JSON_PATH = path.resolve(
  import.meta.dirname,
  "../../../../../package.json",
);

describe("smoke-test.sh", () => {
  it("waits for packaged app handoff after the launcher exits", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'PACKAGED_HANDOFF_GRACE_SECONDS="$' +
        '{PACKAGED_HANDOFF_GRACE_SECONDS:-90}"',
    );
    expect(script).toContain(
      "Launcher exited before the first health probe; continuing to wait for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher exited; waiting for packaged app handoff...",
    );
    expect(script).toContain(
      "Launcher handoff detected; following packaged app process",
    );
    expect(script).toContain('if [[ "$f" == *"/.dmg-staging/"* ]]; then');
  });

  it("accepts both wrapper bundles and direct app bundles", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'RUNTIME_ARCHIVE="$(find "$APP_BUNDLE/Contents/Resources"',
    );
    expect(script).toContain(
      'DIRECT_WGPU_DYLIB="$APP_BUNDLE/Contents/MacOS/libwebgpu_dawn.dylib"',
    );
    expect(script).toContain(
      'echo "WGPU : wrapper bundle -> $RUNTIME_ARCHIVE"',
    );
    expect(script).toContain(
      'echo "WGPU : direct app bundle -> $DIRECT_WGPU_DYLIB"',
    );
    expect(script).toContain("Contents/Resources/app/bun/index\\\\.js");
    expect(script).toContain("Contents/Resources/main\\\\.js");
    expect(
      script.match(/^\s*verify_packaged_renderer_assets\(\)/gm),
    ).toHaveLength(1);
    expect(script).toContain("assert_packaged_asset_variants()");
    expect(script).toContain("assert_packaged_archive_asset_variants()");
    expect(script).toContain('"$renderer_dir/vrms/milady-1.vrm.gz"');
    expect(script).toContain('"$renderer_dir/vrms/milady-1.vrm"');
    expect(script).toContain('"$archive_bundle_root/animations/idle.glb.gz"');
    expect(script).toContain('"$archive_bundle_root/animations/idle.glb"');
    expect(script).toContain(
      'echo "Packaged renderer asset check PASSED (wrapper archive)."',
    );
  });

  it("uses a minimal launcher environment on macOS smoke runs", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("build_launcher_command() {");
    expect(script).toContain('if [[ "$(uname)" == "Darwin" ]]; then');
    expect(script).toContain("/usr/bin/env");
    expect(script).toContain("-i");
    expect(script).toContain('HOME="$HOME"');
    expect(script).toContain('TERM="$' + "{TERM:-dumb}" + '"');
    expect(script).toContain('MILADY_STARTUP_SESSION_ID="$STARTUP_SESSION_ID"');
    expect(script).toContain('MILADY_STARTUP_STATE_FILE="$STARTUP_STATE_FILE"');
    expect(script).toContain(
      'MILADY_STARTUP_EVENTS_FILE="$STARTUP_EVENTS_FILE"',
    );
    expect(script).toContain(
      '"$' + "{LAUNCH_COMMAND[@]}" + '" >"$LAUNCHER_STDOUT"',
    );
  });

  it("records host-level macOS bundle-exec failures instead of masking them as missing ports", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      `MAC_LAUNCH_MODE="\${MILADY_SMOKE_MAC_LAUNCH_MODE:-auto}"`,
    );
    expect(script).toContain("probe_macos_bundle_exec_support() {");
    expect(script).toContain(
      'probe_exec="$probe_root/Probe.app/Contents/MacOS/hello"',
    );
    expect(script).toContain(
      'const { spawnSync } = require("node:child_process");',
    );
    expect(script).toContain("process.stdout.write(String(128 + signalCode));");
    expect(script).toContain("launch_packaged_app_with_open() {");
    expect(script).toContain('/usr/bin/open -n "$LAUNCH_APP_BUNDLE"');
    expect(script).toContain('OPEN_LAUNCH_ATTEMPTED="1"');
    expect(script).toContain('OPEN_LAUNCH_EXIT_CODE="$?"');
    expect(script).toContain(
      'dump_failure_diagnostics "open(1) failed to launch packaged app"',
    );
    expect(script).toContain(
      `echo "Mac launch mode: \${MAC_LAUNCH_MODE:-<unset>}"`,
    );
    expect(script).toContain(
      `echo "open(1) attempted: \${OPEN_LAUNCH_ATTEMPTED:-0}"`,
    );
    expect(script).toContain(
      `echo "open(1) exit code: \${OPEN_LAUNCH_EXIT_CODE:-<unset>}"`,
    );
    expect(script).toContain(
      `echo "Mac direct bundle exec probe rc: \${MAC_DIRECT_EXEC_PROBE_RC:-<unset>}"`,
    );
    expect(script).toContain(
      'FAILURE_REASON="macOS direct app-bundle exec probe returned SIGKILL (137) before startup trace began"',
    );
    expect(script).toContain(
      'FAILURE_REASON="open(1) launch produced no startup trace"',
    );
  });

  it("strips macOS provenance xattrs from the copied local smoke bundle", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain('ditto "$APP_BUNDLE" "$LAUNCH_APP_BUNDLE"');
    expect(script).toContain(
      'xattr -dr com.apple.provenance "$LAUNCH_APP_BUNDLE" 2>/dev/null || true',
    );
    expect(script).toContain(
      'xattr -dr com.apple.quarantine "$LAUNCH_APP_BUNDLE" 2>/dev/null || true',
    );
  });

  it("treats the startup state file as the packaged readiness source of truth", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("init_startup_session() {");
    expect(script).toContain(
      'STARTUP_STATE_FILE="$SMOKE_DIAGNOSTICS_DIR/startup-state.json"',
    );
    expect(script).toContain(
      'STARTUP_EVENTS_FILE="$SMOKE_DIAGNOSTICS_DIR/startup-events.jsonl"',
    );
    expect(script).toContain(
      'STARTUP_BOOTSTRAP_FILE="$LAUNCH_APP_BUNDLE/Contents/Resources/startup-session.json"',
    );
    expect(script).toContain('mv "$bootstrap_temp" "$STARTUP_BOOTSTRAP_FILE"');
    expect(script).toContain("load_startup_state() {");
    expect(script).toContain(
      "const [filePath, expectedSession] = process.argv.slice(1);",
    );
    expect(script).toContain(
      'if ((data.session_id ?? "") !== expectedSession) {',
    );
    expect(script).toContain('if [[ "$STATE_PHASE" == "fatal" ]]');
    expect(script).toContain(
      'if [[ "$STATE_PHASE" == "runtime_ready" || "$STATE_PHASE" == "metadata_ready" ]]',
    );
    expect(script).toContain(
      'FAILURE_REASON="startup trace never reached runtime_ready"',
    );
    expect(script).toContain('dump_failure_diagnostics "$FAILURE_REASON"');
    expect(script).toContain("Startup bootstrap snapshot:");
    expect(script).toContain("Startup state snapshot:");
    expect(script).toContain("Startup session events:");
    expect(script).not.toContain("Startup fallback state snapshot:");
    expect(script).not.toContain("Startup fallback events:");
  });

  it("treats auth-protected health probes as proof the packaged backend is alive", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain("backend_health_probe_satisfied() {");
    expect(script).toContain(
      "# A 401 still proves the packaged backend is running and enforcing auth.",
    );
    expect(script).toContain('[[ "$status" == "200" || "$status" == "401" ]]');
  });

  it("asserts the packaged bundle and executables keep the Milady identifier", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");

    expect(script).toContain(
      'EXPECTED_BUNDLE_IDENTIFIER="$' +
        '{EXPECTED_BUNDLE_IDENTIFIER:-com.miladyai.milady}"',
    );
    expect(script).toContain(
      'grep -q "Identifier=$EXPECTED_BUNDLE_IDENTIFIER"',
    );
    expect(script).toContain('"$APP_BUNDLE/Contents/MacOS/launcher"');
    expect(script).toContain('"$APP_BUNDLE/Contents/MacOS/bun"');
  });

  it("keeps strict packaged smoke separate from explicit unsigned local smoke", () => {
    const script = fs.readFileSync(SMOKE_TEST_PATH, "utf8");
    const pkg = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(script).toContain(
      "ERROR: No Developer ID Application identity found.",
    );
    expect(script).toContain(
      "WARNING: Running unsigned/ad-hoc packaged smoke. This is not a release-grade signing/notarization check.",
    );
    expect(script).not.toContain("falling back to unsigned local smoke build");
    expect(pkg.scripts?.["test:desktop:packaged"]).toBe(
      "bash apps/app/electrobun/scripts/smoke-test.sh",
    );
    expect(pkg.scripts?.["test:desktop:packaged:unsigned"]).toBe(
      "SKIP_SIGNATURE_CHECK=1 ELECTROBUN_SKIP_CODESIGN=1 bash apps/app/electrobun/scripts/smoke-test.sh",
    );
  });
});
