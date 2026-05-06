#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");

function replaceRequiredBlock(text, pattern, replacement) {
  if (text.includes(replacement)) {
    return { matched: true, text };
  }
  if (!pattern.test(text)) {
    return { matched: false, text };
  }
  return { matched: true, text: text.replace(pattern, replacement) };
}

function patchWindowsSmokeScript(text) {
  let nextText = text;

  for (const patch of [
    {
      pattern:
        /if \(\$env:GITHUB_ENV\) \{[\s\S]*? {2}Add-Content -Path \$env:GITHUB_ENV -Value "PGLITE_DATA_DIR=\$pgliteDataDir"\r?\n\}/,
      replacement: `if ($env:GITHUB_ENV) {
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"
  Add-Content -Path $env:GITHUB_ENV -Value "PGLITE_DATA_DIR=$pgliteDataDir"
}`,
    },
    {
      pattern:
        /(?:# .*\r?\n)*\$legacyStartupLog = Join-Path \$env:APPDATA "Eliza\\\\eliza-startup\.log"[\s\S]*?\$startupLogs = @\([^\r\n]+\) \| Select-Object -Unique/,
      replacement: `# Packaged builds can still use the default elizaOS brand config before Milady
# overrides are loaded, so include all known startup log locations.
$legacyStartupLog = Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"
$defaultStartupLog = Join-Path $env:APPDATA "elizaOS\\\\eliza-startup.log"
$miladyStartupLog = Join-Path $env:APPDATA "Milady\\\\eliza-startup.log"
$startupLog = Join-Path $env:APPDATA "Milady\\\\milady-startup.log"
$startupLogs = @($startupLog, $miladyStartupLog, $defaultStartupLog, $legacyStartupLog) | Select-Object -Unique`,
    },
    {
      pattern:
        /\$env:ELIZA_STARTUP_SESSION_ID = \$startupSessionId\r?\n(?:\$env:(?:ELIZA|MILADY)_STARTUP_SESSION_ID = \$startupSessionId\r?\n)*\$env:ELIZA_STARTUP_STATE_FILE = \$startupStateFile\r?\n(?:\$env:MILADY_STARTUP_STATE_FILE = \$startupStateFile\r?\n)?\$env:ELIZA_STARTUP_EVENTS_FILE = \$startupEventsFile\r?\n(?:\$env:MILADY_STARTUP_EVENTS_FILE = \$startupEventsFile\r?\n)?/,
      replacement: `$env:ELIZA_STARTUP_SESSION_ID = $startupSessionId
$env:MILADY_STARTUP_SESSION_ID = $startupSessionId
$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile
$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile
$env:MILADY_STARTUP_STATE_FILE = $startupStateFile
$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile
`,
    },
    {
      pattern:
        /\$installerRoot = if \(\$env:(?:MILADY|ELIZA)_TEST_WINDOWS_INSTALL_DIR\) \{\r?\n {2}\$env:(?:MILADY|ELIZA)_TEST_WINDOWS_INSTALL_DIR\r?\n\}(?: elseif \(\$env:ELIZA_TEST_WINDOWS_INSTALL_DIR\) \{\r?\n(?: {2}# .*\r?\n)* {2}\$env:ELIZA_TEST_WINDOWS_INSTALL_DIR\r?\n\})? else \{\r?\n {2}Join-Path \$tempRoot \("(?:milady(?:-windows)?|eliza-windows)-installed-" \+ \[Guid\]::NewGuid\(\)\.ToString\("N"\)(?:\.Substring\(0, 8\))?\)\r?\n\}/,
      replacement: `$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {
  $env:MILADY_TEST_WINDOWS_INSTALL_DIR
} elseif ($env:ELIZA_TEST_WINDOWS_INSTALL_DIR) {
  # The release workflow exports ELIZA_TEST_WINDOWS_INSTALL_DIR for legacy
  # contract compatibility; accept either prefix so a short, MAX_PATH-safe
  # install dir actually flows through to the Inno /DIR override on CI.
  $env:ELIZA_TEST_WINDOWS_INSTALL_DIR
} else {
  Join-Path $tempRoot ("milady-installed-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
}`,
    },
    {
      pattern:
        /\$curlResult = & "\$env:SystemRoot\\System32\\curl\.exe" -s -o NUL -w "%\{http_code\}" \$uri --connect-timeout 3 --noproxy "127\.0\.0\.1" 2>\$null/,
      replacement: `$curlResult = & "$env:SystemRoot\\System32\\curl.exe" -s -o NUL -w "%{http_code}" $uri --connect-timeout 3 --max-time 5 --noproxy "127.0.0.1" 2>$null`,
    },
  ]) {
    const result = replaceRequiredBlock(
      nextText,
      patch.pattern,
      patch.replacement,
    );
    if (!result.matched) {
      return { matched: false, text };
    }
    nextText = result.text;
  }

  const startupLogsDiagnostics = `  Write-Host ""
  Write-Host "[4c/6] Startup logs:"
  foreach ($candidateLog in $startupLogs) {
    Write-Host "--- $candidateLog ---"
    if (Test-Path $candidateLog) {
      Get-Content $candidateLog -Tail 400 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    } else {
      Write-Host "(startup log not found)"
    }
    Write-Host "--- end $candidateLog ---"
  }

`;
  if (!nextText.includes('  Write-Host "[4c/6] Startup logs:"')) {
    const firewallMarker = "  # 5. Firewall state for port";
    if (!nextText.includes(firewallMarker)) {
      return { matched: false, text };
    }
    nextText = nextText.replace(
      firewallMarker,
      `${startupLogsDiagnostics}${firewallMarker}`,
    );
  }

  const fatalThrow =
    '      throw "Windows packaged app reported a fatal startup phase."';
  const fatalWithDiagnostics = `      Dump-FailureDiagnostics $BackendPort
${fatalThrow}`;
  if (!nextText.includes(fatalWithDiagnostics)) {
    if (!nextText.includes(fatalThrow)) {
      return { matched: false, text };
    }
    nextText = nextText.replace(fatalThrow, fatalWithDiagnostics);
  }

  return { matched: true, text: nextText };
}

function patchLazyStewardRuntimeImports(text) {
  const usesCrLf = text.includes("\r\n");
  const originalText = text;
  let nextText = text.replace(/\r\n/g, "\n");

  const eagerImports = `import { saveStewardCredentials } from "@elizaos/app-core/services/steward-credentials";
import {
\tcreateDesktopStewardSidecar,
\ttype StewardSidecar,
\ttype StewardSidecarStatus,
} from "@elizaos/app-core/services/steward-sidecar";`;
  const lazyImports = `import type {
\tStewardSidecar,
\tStewardSidecarStatus,
} from "@elizaos/app-core/services/steward-sidecar";`;

  if (!nextText.includes(lazyImports)) {
    if (!nextText.includes(eagerImports)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(eagerImports, lazyImports);
  }

  const moduleLoaderBlock = `// Lazy runtime imports
// ---------------------------------------------------------------------------

type StewardSidecarModule = typeof import(
\t"@elizaos/app-core/services/steward-sidecar"
);
type StewardCredentialsModule = typeof import(
\t"@elizaos/app-core/services/steward-credentials"
);

let stewardSidecarModulePromise: Promise<StewardSidecarModule> | null = null;
let stewardCredentialsModulePromise: Promise<StewardCredentialsModule> | null =
\tnull;

function loadStewardSidecarModule(): Promise<StewardSidecarModule> {
\tstewardSidecarModulePromise ??= import(
\t\t"@elizaos/app-core/services/steward-sidecar"
\t);
\treturn stewardSidecarModulePromise;
}

function loadStewardCredentialsModule(): Promise<StewardCredentialsModule> {
\tstewardCredentialsModulePromise ??= import(
\t\t"@elizaos/app-core/services/steward-credentials"
\t);
\treturn stewardCredentialsModulePromise;
}

`;
  if (!nextText.includes("function loadStewardSidecarModule()")) {
    const singletonMarker =
      "// Singleton\n// ---------------------------------------------------------------------------\n\n";
    if (!nextText.includes(singletonMarker)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(
      singletonMarker,
      moduleLoaderBlock + singletonMarker,
    );
  }

  const getSidecarBefore = `export function getStewardSidecar(): StewardSidecar {
\tif (!sidecar) {
\t\tsidecar = createDesktopStewardSidecar({`;
  const getSidecarAfter = `export async function getStewardSidecar(): Promise<StewardSidecar> {
\tif (!sidecar) {
\t\tconst { createDesktopStewardSidecar } = await loadStewardSidecarModule();
\t\tsidecar = createDesktopStewardSidecar({`;
  if (!nextText.includes(getSidecarAfter)) {
    if (!nextText.includes(getSidecarBefore)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(getSidecarBefore, getSidecarAfter);
  }

  nextText = nextText.replace(
    "function configureStewardEnvFromCredentials(): void {",
    "async function configureStewardEnvFromCredentials(): Promise<void> {",
  );

  const saveCredentialsBefore = `\t\ttry {
\t\t\tsaveStewardCredentials({`;
  const saveCredentialsAfter = `\t\ttry {
\t\t\tconst { saveStewardCredentials } = await loadStewardCredentialsModule();
\t\t\tsaveStewardCredentials({`;
  if (!nextText.includes(saveCredentialsAfter)) {
    if (!nextText.includes(saveCredentialsBefore)) {
      return { matched: false, text: originalText };
    }
    nextText = nextText.replace(saveCredentialsBefore, saveCredentialsAfter);
  }

  nextText = nextText.replace(
    "\tconst steward = getStewardSidecar();",
    "\tconst steward = await getStewardSidecar();",
  );
  nextText = nextText.replace(
    "\t\tconfigureStewardEnvFromCredentials();",
    "\t\tawait configureStewardEnvFromCredentials();",
  );
  nextText = nextText.replace(
    "\tconfigureStewardEnvFromCredentials();",
    "\tawait configureStewardEnvFromCredentials();",
  );

  if (
    nextText.includes(
      'import { saveStewardCredentials } from "@elizaos/app-core/services/steward-credentials";',
    ) ||
    nextText.includes("\tcreateDesktopStewardSidecar,\n\ttype StewardSidecar")
  ) {
    return { matched: false, text: originalText };
  }

  return {
    matched: true,
    text: usesCrLf ? nextText.replace(/\n/g, "\r\n") : nextText,
  };
}

function patchTelegramSessionEsmImport(text) {
  let result = replaceRequiredBlock(
    text,
    /import \{ StringSession \} from "telegram\/sessions";/,
    'import { StringSession } from "telegram/sessions/index.js";',
  );
  if (!result.matched) {
    return result;
  }

  result = replaceRequiredBlock(
    result.text,
    /return (?:(?:\(client\.session as StringSession\))|(?:client\.session))\.save\(\);/,
    "return (client.session as unknown as StringSession).save();",
  );
  return result;
}

function patchRealRuntimeLiveProviderImport(text) {
  // elizaOS main already lazy-loads `./live-provider`; treat as satisfied.
  if (
    /const \{ selectLiveProvider \} = await import\("\.\/live-provider"\)/.test(
      text,
    )
  ) {
    return { matched: true, text };
  }

  let result = replaceRequiredBlock(
    text,
    /import \{\r?\n {2}type LiveProviderConfig,\r?\n {2}type LiveProviderName,\r?\n {2}selectLiveProvider,\r?\n\} from "\.\/live-provider";/,
    `import type {
  LiveProviderConfig,
  LiveProviderName,
} from "./live-provider";`,
  );
  if (!result.matched) {
    return result;
  }

  result = replaceRequiredBlock(
    result.text,
    / {6}providerConfig = selectLiveProvider\(options\.preferredProvider\);/,
    `      const { selectLiveProvider } = await import("./live-provider");
      providerConfig = selectLiveProvider(options.preferredProvider);`,
  );
  return result;
}

function runTextPatchSteps(text, steps) {
  let result = { matched: true, text };
  for (const step of steps) {
    result = step(result.text);
    if (!result.matched) {
      return result;
    }
  }
  return result;
}

function patchMacosNotaryTimeout(text) {
  const notaryTimeout60 =
    'NOTARY_WAIT_TIMEOUT="$' + '{ELECTROBUN_NOTARY_WAIT_TIMEOUT:-60m}"';
  if (text.includes(notaryTimeout60)) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    /NOTARY_WAIT_TIMEOUT="\$\{ELECTROBUN_NOTARY_WAIT_TIMEOUT:-30m\}"/,
    notaryTimeout60,
  );
}

function patchMacosCodesignRetryHelper(text) {
  if (text.includes("retry_codesign() {")) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}return "\$command_status"\r?\n}\r?\n\r?\nparse_notary_submission_id\(\) \{/,
    `  return "$command_status"
}

retry_codesign() {
  retry_command "\${ELECTROBUN_CODESIGN_ATTEMPTS:-3}" "\${ELECTROBUN_CODESIGN_RETRY_DELAY_SECONDS:-20}" codesign "$@"
}

parse_notary_submission_id() {`,
  );
}

function patchMacosNotaryRetryHelpers(text) {
  if (text.includes("retry_notarytool_submit() {")) {
    return { matched: true, text };
  }

  const notaryRetryAnchor = `TARBALL_PATH=`;
  if (!text.includes(notaryRetryAnchor)) {
    return { matched: false, text };
  }

  return {
    matched: true,
    text: text.replace(
      notaryRetryAnchor,
      `parse_notary_status() {
  local output_path="$1"
  /usr/bin/python3 - "$output_path" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    sys.exit(1)

raw = path.read_text(encoding="utf-8", errors="replace")

try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(1)

status = payload.get("status") or ""
if status:
    print(status)
PY
}

retry_notarytool_submit() {
  local output_path="$1"
  local attempts="$2"
  local delay_seconds="$3"

  local attempt command_status=0
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    rm -f "$output_path"
    if "$REAL_XCRUN" notarytool submit \\
      --apple-id "$ELECTROBUN_APPLEID" \\
      --password "$ELECTROBUN_APPLEIDPASS" \\
      --team-id "$ELECTROBUN_TEAMID" \\
      --output-format json \\
      "$TEMP_DMG_PATH" >"$output_path"; then
      return 0
    else
      command_status=$?
    fi

    echo "stage-macos-release-artifacts: notarization submit failed for $TEMP_DMG_PATH (attempt $attempt/$attempts, exit=$command_status)" >&2
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$((delay_seconds * attempt))"
    fi
  done

  return "$command_status"
}

retry_notarytool_wait() {
  local output_path="$1"
  local attempts="$2"
  local delay_seconds="$3"

  local attempt command_status=0 notary_status=""
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    rm -f "$output_path"
    if "$REAL_XCRUN" notarytool wait \\
      --apple-id "$ELECTROBUN_APPLEID" \\
      --password "$ELECTROBUN_APPLEIDPASS" \\
      --team-id "$ELECTROBUN_TEAMID" \\
      --timeout "$NOTARY_WAIT_TIMEOUT" \\
      --output-format json \\
      "$NOTARY_SUBMISSION_ID" >"$output_path"; then
      NOTARY_STATUS="$(parse_notary_status "$output_path" || true)"
      if [[ "$NOTARY_STATUS" == "Accepted" ]]; then
        return 0
      fi
      echo "stage-macos-release-artifacts: notarization ended with status \${NOTARY_STATUS:-unknown} for submission $NOTARY_SUBMISSION_ID" >&2
      return 1
    else
      command_status=$?
    fi

    notary_status="$(parse_notary_status "$output_path" || true)"
    if [[ "$notary_status" == "Invalid" || "$notary_status" == "Rejected" ]]; then
      echo "stage-macos-release-artifacts: notarization ended with status $notary_status for submission $NOTARY_SUBMISSION_ID" >&2
      return "$command_status"
    fi

    echo "stage-macos-release-artifacts: notarization wait failed for submission $NOTARY_SUBMISSION_ID (attempt $attempt/$attempts, exit=$command_status)" >&2
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$((delay_seconds * attempt))"
    fi
  done

  return "$command_status"
}

retry_notarytool_log() {
  local attempts="\${ELECTROBUN_NOTARY_LOG_ATTEMPTS:-3}"
  local delay_seconds="\${ELECTROBUN_NOTARY_LOG_RETRY_DELAY_SECONDS:-20}"

  local attempt command_status=0
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "$REAL_XCRUN" notarytool log \\
      --apple-id "$ELECTROBUN_APPLEID" \\
      --password "$ELECTROBUN_APPLEIDPASS" \\
      --team-id "$ELECTROBUN_TEAMID" \\
      "$NOTARY_SUBMISSION_ID"; then
      return 0
    else
      command_status=$?
    fi

    echo "stage-macos-release-artifacts: notarization log fetch failed for submission $NOTARY_SUBMISSION_ID (attempt $attempt/$attempts, exit=$command_status)" >&2
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$((delay_seconds * attempt))"
    fi
  done

  return "$command_status"
}

TARBALL_PATH=`,
    ),
  };
}

function patchMacosTarballDiscovery(text) {
  if (text.includes('for tarball_pattern in "*-macos-*.app.tar.zst"')) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    /TARBALL_PATH="\$\(find -L "\$ARTIFACTS_DIR" -maxdepth 1 -type f -name "\*-macos-\*\.app\.tar\.zst" \| sort \| head -1\)"/,
    `TARBALL_PATH=""
for tarball_pattern in "*-macos-*.app.tar.zst" "*-macos-*.app.tar.gz" "*-macos-*.tar.gz"; do
  TARBALL_PATH="$(find -L "$ARTIFACTS_DIR" -maxdepth 1 -type f -name "$tarball_pattern" | sort | head -1)"
  if [[ -n "$TARBALL_PATH" ]]; then
    break
  fi
done`,
  );
}

function patchMacosTarballExtraction(text) {
  if (text.includes('tar -xzf "$TARBALL_PATH" -C "$EXTRACT_DIR"')) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    /echo "Using updater tarball: \$TARBALL_PATH"\r?\ntar --zstd -xf "\$TARBALL_PATH" -C "\$EXTRACT_DIR"/,
    `echo "Using updater tarball: $TARBALL_PATH"
TARBALL_BASENAME="$(basename "$TARBALL_PATH")"
case "$TARBALL_BASENAME" in
  *.tar.zst)
    tar --zstd -xf "$TARBALL_PATH" -C "$EXTRACT_DIR"
    ;;
  *.tar.gz)
    tar -xzf "$TARBALL_PATH" -C "$EXTRACT_DIR"
    ;;
  *)
    echo "stage-macos-release-artifacts: unsupported macOS updater tarball: $TARBALL_BASENAME"
    exit 1
    ;;
esac`,
  );
}

function patchMacosFinalDmgName(text) {
  const finalDmgAppTarZst =
    'FINAL_DMG_NAME="$' + '{TARBALL_BASENAME%.app.tar.zst}.dmg"';
  if (text.includes(finalDmgAppTarZst)) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    /FINAL_DMG_NAME="\$\(basename "\$\{TARBALL_PATH%\.app\.tar\.zst\}\.dmg"\)"/,
    `case "$TARBALL_BASENAME" in
  *.app.tar.zst)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.app.tar.zst}.dmg"
    ;;
  *.app.tar.gz)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.app.tar.gz}.dmg"
    ;;
  *.tar.gz)
    FINAL_DMG_NAME="\${TARBALL_BASENAME%.tar.gz}.dmg"
    ;;
  *)
    echo "stage-macos-release-artifacts: unsupported macOS updater tarball: $TARBALL_BASENAME"
    exit 1
    ;;
esac`,
  );
}

function patchMacosEmptyEntitlements(text) {
  if (text.includes("write_config_entitlements_plist")) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}if \[\[ ! -s "\$TMP_ENTITLEMENTS_PATH" \]\]; then\r?\n {4}echo "stage-macos-release-artifacts: extracted entitlements were empty"\r?\n {4}exit 1\r?\n {2}fi\r?\n {2}entitlement_args=\(--entitlements "\$TMP_ENTITLEMENTS_PATH"\)/,
    `  if [[ -s "$TMP_ENTITLEMENTS_PATH" ]]; then
    entitlement_args=(--entitlements "$TMP_ENTITLEMENTS_PATH")
  else
    echo "stage-macos-release-artifacts: extracted entitlements were empty; signing without entitlement plist"
  fi`,
  );
}

const nestedMacosSigningFunction = `  sign_nested_macos_runtime_targets() {
    local runtime_resources_dir="$STAGED_APP_PATH/Contents/Resources/app/eliza-dist"
    local candidate_path file_type
    if [[ ! -d "$runtime_resources_dir" ]]; then
      return 0
    fi
    while IFS= read -r -d '' candidate_path; do
      file_type="$(file "$candidate_path" 2>/dev/null || true)"
      case "$file_type" in
        *Mach-O*)
          sign_macos_runtime_target "$candidate_path"
          ;;
      esac
    done < <(find "$runtime_resources_dir" -type f -print0)
  }
`;

function patchMacosNestedRuntimeSigning(text) {
  if (text.includes("sign_nested_macos_runtime_targets()")) {
    return { matched: true, text };
  }

  let result = replaceRequiredBlock(
    text,
    / {2}if ! codesign --force --timestamp --sign "\$ELECTROBUN_DEVELOPER_ID" --options runtime "\$\{entitlement_args\[@\]\}" "\$LAUNCHER_PATH"; then\r?\n {4}echo "stage-macos-release-artifacts: launcher runtime signing failed, retrying without hardened runtime" >&2\r?\n {4}codesign --force --timestamp --sign "\$ELECTROBUN_DEVELOPER_ID" "\$\{entitlement_args\[@\]\}" "\$LAUNCHER_PATH"\r?\n {2}fi\r?\n {2}codesign --force --timestamp --sign "\$ELECTROBUN_DEVELOPER_ID" --options runtime "\$\{entitlement_args\[@\]\}" "\$STAGED_APP_PATH"/,
    `  runtime_sign_args=(--force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" --options runtime)
  fallback_runtime_sign_args=(--force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID")
  app_sign_args=(--force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" --options runtime)
  if [[ -s "\${TMP_ENTITLEMENTS_PATH:-}" ]]; then
    runtime_sign_args+=(--entitlements "$TMP_ENTITLEMENTS_PATH")
    fallback_runtime_sign_args+=(--entitlements "$TMP_ENTITLEMENTS_PATH")
    app_sign_args+=(--entitlements "$TMP_ENTITLEMENTS_PATH")
  fi
  sign_macos_runtime_target() {
    local target_path="$1"
    if ! retry_codesign "\${runtime_sign_args[@]}" "$target_path"; then
      echo "stage-macos-release-artifacts: runtime signing failed for $target_path, retrying without hardened runtime" >&2
      retry_codesign "\${fallback_runtime_sign_args[@]}" "$target_path"
    fi
  }
${nestedMacosSigningFunction}  macos_code_dir="$STAGED_APP_PATH/Contents/MacOS"
  for runtime_target in \\
    "$macos_code_dir/libNativeWrapper.dylib" \\
    "$macos_code_dir/libwebgpu_dawn.dylib" \\
    "$macos_code_dir/libasar.dylib" \\
    "$macos_code_dir/bun" \\
    "$macos_code_dir/extractor" \\
    "$macos_code_dir/process_helper" \\
    "$macos_code_dir/zig-zstd" \\
    "$macos_code_dir/zig-asar" \\
    "$macos_code_dir/bspatch" \\
    "$macos_code_dir/bsdiff"; do
    if [[ -e "$runtime_target" ]]; then
      sign_macos_runtime_target "$runtime_target"
    fi
  done
  sign_nested_macos_runtime_targets
  sign_macos_runtime_target "$LAUNCHER_PATH"
  retry_codesign "\${app_sign_args[@]}" "$STAGED_APP_PATH"`,
  );

  if (!result.matched) {
    result = replaceRequiredBlock(
      result.text,
      / {2}macos_code_dir="\$STAGED_APP_PATH\/Contents\/MacOS"/,
      `${nestedMacosSigningFunction}  macos_code_dir="$STAGED_APP_PATH/Contents/MacOS"`,
    );
    if (result.matched) {
      result = replaceRequiredBlock(
        result.text,
        / {2}sign_macos_runtime_target "\$LAUNCHER_PATH"/,
        `  sign_nested_macos_runtime_targets
  sign_macos_runtime_target "$LAUNCHER_PATH"`,
      );
    }
  }

  return result;
}

function patchMacosDmgCodesignRetry(text) {
  if (
    text.includes(
      'retry_codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$TEMP_DMG_PATH"',
    )
  ) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}codesign --force --timestamp --sign "\$ELECTROBUN_DEVELOPER_ID" "\$TEMP_DMG_PATH"/,
    '  retry_codesign --force --timestamp --sign "$ELECTROBUN_DEVELOPER_ID" "$TEMP_DMG_PATH"',
  );
}

function patchMacosNotarySubmitCall(text) {
  const notarySubmitAttempts =
    'NOTARY_SUBMIT_ATTEMPTS="$' + '{ELECTROBUN_NOTARY_SUBMIT_ATTEMPTS:-3}"';
  if (text.includes(notarySubmitAttempts)) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}NOTARY_SUBMIT_OUTPUT_PATH="\$TMP_ROOT\/notary-submit\.json"\r?\n {2}"\$REAL_XCRUN" notarytool submit \\\r?\n {4}--apple-id "\$ELECTROBUN_APPLEID" \\\r?\n {4}--password "\$ELECTROBUN_APPLEIDPASS" \\\r?\n {4}--team-id "\$ELECTROBUN_TEAMID" \\\r?\n {4}--output-format json \\\r?\n {4}"\$TEMP_DMG_PATH" >"\$NOTARY_SUBMIT_OUTPUT_PATH"/,
    `  NOTARY_SUBMIT_ATTEMPTS="\${ELECTROBUN_NOTARY_SUBMIT_ATTEMPTS:-3}"
  NOTARY_SUBMIT_RETRY_DELAY_SECONDS="\${ELECTROBUN_NOTARY_SUBMIT_RETRY_DELAY_SECONDS:-30}"
  NOTARY_SUBMIT_OUTPUT_PATH="$TMP_ROOT/notary-submit.json"
  if ! retry_notarytool_submit "$NOTARY_SUBMIT_OUTPUT_PATH" "$NOTARY_SUBMIT_ATTEMPTS" "$NOTARY_SUBMIT_RETRY_DELAY_SECONDS"; then
    echo "stage-macos-release-artifacts: notarization submit failed for $TEMP_DMG_PATH" >&2
    sed -n '1,80p' "$NOTARY_SUBMIT_OUTPUT_PATH" >&2 || true
    exit 1
  fi`,
  );
}

function patchMacosNotaryWaitCall(text) {
  const notaryWaitAttempts =
    'NOTARY_WAIT_ATTEMPTS="$' + '{ELECTROBUN_NOTARY_WAIT_ATTEMPTS:-3}"';
  if (text.includes(notaryWaitAttempts)) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}NOTARY_WAIT_OUTPUT_PATH="\$TMP_ROOT\/notary-wait\.json"\r?\n {2}if ! "\$REAL_XCRUN" notarytool wait \\\r?\n {4}--apple-id "\$ELECTROBUN_APPLEID" \\\r?\n {4}--password "\$ELECTROBUN_APPLEIDPASS" \\\r?\n {4}--team-id "\$ELECTROBUN_TEAMID" \\\r?\n {4}--timeout "\$NOTARY_WAIT_TIMEOUT" \\\r?\n {4}--output-format json \\\r?\n {4}"\$NOTARY_SUBMISSION_ID" >"\$NOTARY_WAIT_OUTPUT_PATH"; then\r?\n {4}echo "stage-macos-release-artifacts: notarization wait failed for submission \$NOTARY_SUBMISSION_ID" >&2\r?\n {4}sed -n '1,80p' "\$NOTARY_WAIT_OUTPUT_PATH" >&2 \|\| true\r?\n {4}"\$REAL_XCRUN" notarytool log \\\r?\n {6}--apple-id "\$ELECTROBUN_APPLEID" \\\r?\n {6}--password "\$ELECTROBUN_APPLEIDPASS" \\\r?\n {6}--team-id "\$ELECTROBUN_TEAMID" \\\r?\n {6}"\$NOTARY_SUBMISSION_ID" >&2 \|\| true\r?\n {4}exit 1\r?\n {2}fi/,
    `  NOTARY_WAIT_ATTEMPTS="\${ELECTROBUN_NOTARY_WAIT_ATTEMPTS:-3}"
  NOTARY_WAIT_RETRY_DELAY_SECONDS="\${ELECTROBUN_NOTARY_WAIT_RETRY_DELAY_SECONDS:-60}"
  NOTARY_WAIT_OUTPUT_PATH="$TMP_ROOT/notary-wait.json"
  if ! retry_notarytool_wait "$NOTARY_WAIT_OUTPUT_PATH" "$NOTARY_WAIT_ATTEMPTS" "$NOTARY_WAIT_RETRY_DELAY_SECONDS"; then
    echo "stage-macos-release-artifacts: notarization wait failed for submission $NOTARY_SUBMISSION_ID" >&2
    sed -n '1,80p' "$NOTARY_WAIT_OUTPUT_PATH" >&2 || true
    retry_notarytool_log >&2 || true
    exit 1
  fi`,
  );
}

function patchMacosStaplerFallback(text) {
  if (
    text.includes(
      "notarization accepted but stapler ticket was not available; continuing without stapled DMG",
    )
  ) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    / {2}(?:retry_command 8 20 xcrun stapler staple "\$TEMP_DMG_PATH"|STAPLER_ATTEMPTS="\$\{ELECTROBUN_STAPLER_ATTEMPTS:-12\}"\r?\n {2}STAPLER_DELAY_SECONDS="\$\{ELECTROBUN_STAPLER_DELAY_SECONDS:-30\}"\r?\n {2}retry_command "\$STAPLER_ATTEMPTS" "\$STAPLER_DELAY_SECONDS" xcrun stapler staple "\$TEMP_DMG_PATH")/,
    `  STAPLER_ATTEMPTS="\${ELECTROBUN_STAPLER_ATTEMPTS:-12}"
  STAPLER_DELAY_SECONDS="\${ELECTROBUN_STAPLER_DELAY_SECONDS:-30}"
  if ! retry_command "$STAPLER_ATTEMPTS" "$STAPLER_DELAY_SECONDS" xcrun stapler staple "$TEMP_DMG_PATH"; then
    if [[ "\${ELECTROBUN_REQUIRE_STAPLED_DMG:-0}" == "1" ]]; then
      exit 1
    fi
    echo "stage-macos-release-artifacts: notarization accepted but stapler ticket was not available; continuing without stapled DMG" >&2
  fi`,
  );
}

function patchMacosArtifactStager(text) {
  return runTextPatchSteps(text, [
    patchMacosNotaryTimeout,
    patchMacosCodesignRetryHelper,
    patchMacosNotaryRetryHelpers,
    patchMacosTarballDiscovery,
    patchMacosTarballExtraction,
    patchMacosFinalDmgName,
    patchMacosEmptyEntitlements,
    patchMacosNestedRuntimeSigning,
    patchMacosDmgCodesignRetry,
    patchMacosNotarySubmitCall,
    patchMacosNotaryWaitCall,
    patchMacosStaplerFallback,
  ]);
}

function patchLocalAdhocMacosSigningOrder(text) {
  if (
    text.includes('path.join(binaryDir, "libNativeWrapper.dylib")') &&
    text.includes('path.join(binaryDir, "launcher")') &&
    text.indexOf('path.join(binaryDir, "libNativeWrapper.dylib")') <
      text.indexOf('path.join(binaryDir, "launcher")')
  ) {
    return { matched: true, text };
  }

  return replaceRequiredBlock(
    text,
    /\treturn \[\r?\n\t\tpath\.join\(binaryDir, "launcher"\),\r?\n\t\tpath\.join\(binaryDir, "bun"\),\r?\n\t\tpath\.join\(binaryDir, "libNativeWrapper\.dylib"\),\r?\n\t\tpath\.join\(binaryDir, "libwebgpu_dawn\.dylib"\),\r?\n\t\tpath\.join\(binaryDir, "libasar\.dylib"\),\r?\n\t\tpath\.join\(binaryDir, "extractor"\),\r?\n\t\tpath\.join\(binaryDir, "process_helper"\),\r?\n\t\tpath\.join\(binaryDir, "zig-zstd"\),\r?\n\t\tpath\.join\(binaryDir, "zig-asar"\),\r?\n\t\tpath\.join\(binaryDir, "bspatch"\),\r?\n\t\tpath\.join\(binaryDir, "bsdiff"\),\r?\n\t\tappBundlePath,\r?\n\t\]/,
    `\treturn [
\t\tpath.join(binaryDir, "libNativeWrapper.dylib"),
\t\tpath.join(binaryDir, "libwebgpu_dawn.dylib"),
\t\tpath.join(binaryDir, "libasar.dylib"),
\t\tpath.join(binaryDir, "bun"),
\t\tpath.join(binaryDir, "extractor"),
\t\tpath.join(binaryDir, "process_helper"),
\t\tpath.join(binaryDir, "zig-zstd"),
\t\tpath.join(binaryDir, "zig-asar"),
\t\tpath.join(binaryDir, "bspatch"),
\t\tpath.join(binaryDir, "bsdiff"),
\t\tpath.join(binaryDir, "launcher"),
\t\tappBundlePath,
\t]`,
  );
}

const replacements = [
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1",
    description: "restore Windows smoke release contract",
    transform: patchWindowsSmokeScript,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/src/native/steward.ts",
    description: "lazy-load Steward sidecar runtime imports",
    transform: patchLazyStewardRuntimeImports,
  },
  {
    file: "eliza/packages/agent/src/services/telegram-account-auth.ts",
    description: "use explicit Telegram sessions ESM import",
    transform: patchTelegramSessionEsmImport,
  },
  {
    file: "eliza/packages/app-core/test/helpers/real-runtime.ts",
    description: "lazy-load live provider helper in real runtime tests",
    transform: patchRealRuntimeLiveProviderImport,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/stage-macos-release-artifacts.sh",
    description: "support gzip macOS release tarball staging",
    transform: patchMacosArtifactStager,
  },
  {
    file: "eliza/packages/app-core/platforms/electrobun/scripts/local-adhoc-sign-macos.ts",
    description: "sign nested macOS runtime files before launcher",
    transform: patchLocalAdhocMacosSigningOrder,
  },
];

let changed = 0;
let verified = 0;

for (const replacement of replacements) {
  const absolutePath = path.join(repoRoot, replacement.file);
  let text = fs.readFileSync(absolutePath, "utf8");

  if (typeof replacement.transform === "function") {
    const result = replacement.transform(text);
    if (!result.matched) {
      throw new Error(
        `${replacement.description}: patch anchor not found in ${replacement.file}`,
      );
    }

    if (result.text === text || checkOnly) {
      verified += 1;
      continue;
    }

    fs.writeFileSync(absolutePath, result.text);
    changed += 1;
    continue;
  }

  if (text.includes(replacement.after)) {
    verified += 1;
    continue;
  }

  if (!text.includes(replacement.before)) {
    throw new Error(
      `${replacement.description}: patch anchor not found in ${replacement.file}`,
    );
  }

  if (checkOnly) {
    verified += 1;
    continue;
  }

  text = text.replace(replacement.before, replacement.after);
  fs.writeFileSync(absolutePath, text);
  changed += 1;
}

const mode = checkOnly ? "check" : "patch";
console.log(
  `[patch-eliza-electrobun-windows-smoke-startup] ${mode} ok; ${changed} changed, ${verified} verified`,
);
