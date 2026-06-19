#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const checkOnly = process.argv.includes("--check");

const agentPath =
  "eliza/packages/app-core/platforms/electrobun/src/native/agent.ts";
const startupTracePath =
  "eliza/packages/app-core/platforms/electrobun/src/startup-trace.ts";
const windowsSmokePath =
  "eliza/packages/app-core/platforms/electrobun/scripts/smoke-test-windows.ps1";
const postwrapDiagnosticsPath =
  "eliza/packages/app-core/platforms/electrobun/scripts/postwrap-diagnostics.ts";

const patches = [
  {
    relativePath: agentPath,
    description:
      "propagate the selected packaged API port to server-only child",
    transform(source) {
      if (
        source.includes("MILADY_API_PORT: String(apiPort)") &&
        source.includes("MILADY_PORT: String(apiPort)")
      ) {
        return source;
      }

      const match = source.match(
        /\n([ \t]*)const childEnv: Record<string, string> = \{[\s\S]*?\n\1\};/,
      );
      if (!match) {
        throw new Error("could not locate childEnv object");
      }

      let block = match[0];
      const apiPortLine = block.match(
        /\n([ \t]*)(ELIZA_PORT|ELIZA_API_PORT): String\(apiPort\),/,
      );
      const anchor = apiPortLine?.[0].slice(1);

      if (!anchor) {
        throw new Error("could not locate API port assignment in childEnv");
      }

      const additions = [];
      if (!block.includes("MILADY_API_PORT: String(apiPort)")) {
        additions.push(`${apiPortLine[1]}MILADY_API_PORT: String(apiPort),`);
      }
      if (!block.includes("MILADY_PORT: String(apiPort)")) {
        additions.push(`${apiPortLine[1]}MILADY_PORT: String(apiPort),`);
      }
      block = block.replace(anchor, [anchor, ...additions].join("\n"));
      return source.replace(match[0], block);
    },
  },
  {
    relativePath: agentPath,
    description: "keep ELIZA_PORT for eliza start server-only mode",
    transform(source) {
      return source.replace(/\n\s*delete childEnv\.ELIZA_PORT;/, "");
    },
  },
  {
    relativePath: startupTracePath,
    description: "read Milady startup trace env aliases",
    transform(source) {
      let next = source;
      for (const suffix of ["SESSION_ID", "STATE_FILE", "EVENTS_FILE"]) {
        if (next.includes(`trimEnv(env.MILADY_STARTUP_${suffix}) ??`)) {
          continue;
        }

        const duplicate = new RegExp(
          `\\n([ \\t]*)trimEnv\\(env\\.ELIZA_STARTUP_${suffix}\\) \\?\\?\\n\\1trimEnv\\(env\\.ELIZA_STARTUP_${suffix}\\) \\?\\?`,
        );
        if (duplicate.test(next)) {
          next = next.replace(
            duplicate,
            (_, indent) =>
              `\n${indent}trimEnv(env.MILADY_STARTUP_${suffix}) ??\n${indent}trimEnv(env.ELIZA_STARTUP_${suffix}) ??`,
          );
          continue;
        }

        const elizaLine = new RegExp(
          `\\n([ \\t]*)trimEnv\\(env\\.ELIZA_STARTUP_${suffix}\\) \\?\\?`,
        );
        const match = next.match(elizaLine);
        if (!match) {
          throw new Error(`could not locate startup trace ${suffix} anchor`);
        }
        next = next.replace(
          elizaLine,
          `\n${match[1]}trimEnv(env.MILADY_STARTUP_${suffix}) ??${match[0]}`,
        );
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "export legacy startup trace state paths",
    transform(source) {
      let next = source;
      if (!next.includes("$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile")) {
        const anchor = "$env:MILADY_STARTUP_STATE_FILE = $startupStateFile";
        if (!next.includes(anchor)) {
          throw new Error("could not locate Milady startup state assignment");
        }
        next = next.replace(
          anchor,
          `$env:ELIZA_STARTUP_STATE_FILE = $startupStateFile\n${anchor}`,
        );
      }
      if (
        !next.includes("$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile")
      ) {
        const anchor = "$env:MILADY_STARTUP_EVENTS_FILE = $startupEventsFile";
        if (!next.includes(anchor)) {
          throw new Error("could not locate Milady startup events assignment");
        }
        next = next.replace(
          anchor,
          `$env:ELIZA_STARTUP_EVENTS_FILE = $startupEventsFile\n${anchor}`,
        );
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "export branded and legacy packaged backend ports",
    transform(source) {
      let next = source;
      const miladyApiPort = '$env:MILADY_API_PORT = "$BackendPort"';
      const elizaApiPort = '$env:ELIZA_API_PORT = "$BackendPort"';
      if (!next.includes(miladyApiPort)) {
        if (!next.includes(elizaApiPort)) {
          throw new Error("could not locate API port assignment");
        }
        next = next.replace(elizaApiPort, `${miladyApiPort}\n${elizaApiPort}`);
      }

      const miladyPort = '$env:MILADY_PORT = "$BackendPort"';
      const elizaPort = '$env:ELIZA_PORT = "$BackendPort"';
      if (!next.includes(miladyPort)) {
        if (!next.includes(elizaPort)) {
          throw new Error("could not locate legacy port assignment");
        }
        next = next.replace(elizaPort, `${miladyPort}\n${elizaPort}`);
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "publish legacy AppData paths for downstream diagnostics",
    transform(source) {
      let next = source;
      const eol = next.includes("\r\n") ? "\r\n" : "\n";
      const block = (lines) => lines.join(eol);

      if (!next.includes("$env:MILADY_TEST_WINDOWS_APPDATA_PATH")) {
        const anchor =
          "$testAppDataRoot = if ($env:ELIZA_TEST_WINDOWS_APPDATA_PATH) {";
        if (!next.includes(anchor)) {
          throw new Error("could not locate Windows AppData path selection");
        }
        next = next.replace(
          anchor,
          block([
            "$testAppDataRoot = if ($env:MILADY_TEST_WINDOWS_APPDATA_PATH) {",
            "  $env:MILADY_TEST_WINDOWS_APPDATA_PATH",
            "} elseif ($env:ELIZA_TEST_WINDOWS_APPDATA_PATH) {",
          ]),
        );
      }

      if (!next.includes("elseif ($env:ELIZA_TEST_WINDOWS_APPDATA_PATH)")) {
        const anchor = block([
          "$testAppDataRoot = if ($env:MILADY_TEST_WINDOWS_APPDATA_PATH) {",
          "  $env:MILADY_TEST_WINDOWS_APPDATA_PATH",
          "} else {",
        ]);
        if (!next.includes(anchor)) {
          throw new Error("could not locate Windows AppData path selection");
        }
        next = next.replace(
          anchor,
          block([
            "$testAppDataRoot = if ($env:MILADY_TEST_WINDOWS_APPDATA_PATH) {",
            "  $env:MILADY_TEST_WINDOWS_APPDATA_PATH",
            "} elseif ($env:ELIZA_TEST_WINDOWS_APPDATA_PATH) {",
            "  $env:ELIZA_TEST_WINDOWS_APPDATA_PATH",
            "} else {",
          ]),
        );
      }

      if (!next.includes("$env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH")) {
        const anchor =
          "$testLocalAppDataRoot = if ($env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH) {";
        if (!next.includes(anchor)) {
          throw new Error(
            "could not locate Windows LocalAppData path selection",
          );
        }
        next = next.replace(
          anchor,
          block([
            "$testLocalAppDataRoot = if ($env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH) {",
            "  $env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH",
            "} elseif ($env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH) {",
          ]),
        );
      }

      if (
        !next.includes("elseif ($env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH)")
      ) {
        const anchor = block([
          "$testLocalAppDataRoot = if ($env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH) {",
          "  $env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH",
          "} else {",
        ]);
        if (!next.includes(anchor)) {
          throw new Error(
            "could not locate Windows LocalAppData path selection",
          );
        }
        next = next.replace(
          anchor,
          block([
            "$testLocalAppDataRoot = if ($env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH) {",
            "  $env:MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH",
            "} elseif ($env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH) {",
            "  $env:ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH",
            "} else {",
          ]),
        );
      }

      const miladyAppDataExport =
        '  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"';
      const elizaAppDataExport =
        '  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_APPDATA_PATH=$($env:APPDATA)"';
      if (!next.includes(miladyAppDataExport)) {
        if (!next.includes(elizaAppDataExport)) {
          throw new Error("could not locate AppData GITHUB_ENV export");
        }
        next = next.replace(
          elizaAppDataExport,
          `${miladyAppDataExport}\n${elizaAppDataExport}`,
        );
      }
      if (!next.includes(elizaAppDataExport)) {
        if (!next.includes(miladyAppDataExport)) {
          throw new Error("could not locate Milady AppData GITHUB_ENV export");
        }
        next = next.replace(
          miladyAppDataExport,
          `${miladyAppDataExport}\n${elizaAppDataExport}`,
        );
      }

      const miladyLocalAppDataExport =
        '  Add-Content -Path $env:GITHUB_ENV -Value "MILADY_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"';
      const elizaLocalAppDataExport =
        '  Add-Content -Path $env:GITHUB_ENV -Value "ELIZA_TEST_WINDOWS_LOCALAPPDATA_PATH=$($env:LOCALAPPDATA)"';
      if (!next.includes(miladyLocalAppDataExport)) {
        if (!next.includes(elizaLocalAppDataExport)) {
          throw new Error("could not locate LocalAppData GITHUB_ENV export");
        }
        next = next.replace(
          elizaLocalAppDataExport,
          `${miladyLocalAppDataExport}\n${elizaLocalAppDataExport}`,
        );
      }
      if (!next.includes(elizaLocalAppDataExport)) {
        if (!next.includes(miladyLocalAppDataExport)) {
          throw new Error(
            "could not locate Milady LocalAppData GITHUB_ENV export",
          );
        }
        next = next.replace(
          miladyLocalAppDataExport,
          `${miladyLocalAppDataExport}\n${elizaLocalAppDataExport}`,
        );
      }
      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "align Windows smoke installer and startup diagnostics",
    transform(source) {
      let next = source;
      const eol = next.includes("\r\n") ? "\r\n" : "\n";
      const block = (lines) => lines.join(eol);

      if (!next.includes("$defaultStartupLog =")) {
        const anchor =
          '$legacyStartupLog = Join-Path $env:APPDATA "Eliza\\\\eliza-startup.log"';
        if (!next.includes(anchor)) {
          throw new Error("could not locate legacy startup log anchor");
        }
        next = next.replace(
          anchor,
          block([
            anchor,
            '$defaultStartupLog = Join-Path $env:APPDATA "elizaOS\\\\eliza-startup.log"',
            '$miladyStartupLog = Join-Path $env:APPDATA "Milady\\\\eliza-startup.log"',
          ]),
        );
      }

      next = next.replace(
        /\$startupLogs = @\(\$startupLog, \$legacyStartupLog\) \| Select-Object -Unique/,
        "$startupLogs = @($startupLog, $miladyStartupLog, $defaultStartupLog, $legacyStartupLog) | Select-Object -Unique",
      );

      if (!next.includes("elseif ($env:ELIZA_TEST_WINDOWS_INSTALL_DIR)")) {
        const anchor = block([
          "$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {",
          "  $env:MILADY_TEST_WINDOWS_INSTALL_DIR",
          "} else {",
        ]);
        if (!next.includes(anchor)) {
          throw new Error("could not locate Windows installer root selection");
        }
        next = next.replace(
          anchor,
          block([
            "$installerRoot = if ($env:MILADY_TEST_WINDOWS_INSTALL_DIR) {",
            "  $env:MILADY_TEST_WINDOWS_INSTALL_DIR",
            "} elseif ($env:ELIZA_TEST_WINDOWS_INSTALL_DIR) {",
            "  $env:ELIZA_TEST_WINDOWS_INSTALL_DIR",
            "} else {",
          ]),
        );
      }

      next = next.replace(/\r?\n\s*"\/CLOSEAPPLICATIONS",/, "");
      next = next.replaceAll(
        "Get-Content $installerLogPath -Tail 100 | ForEach-Object { Write-Host $_ }",
        "Get-Content $installerLogPath | ForEach-Object { Write-Host $_ }",
      );

      const retryAnchor = block([
        '    Write-Host "Retrying installer via cmd /c (headless fallback)..."',
        "    Remove-Item $installerRoot -Recurse -Force -ErrorAction SilentlyContinue",
        "    New-Item -ItemType Directory -Force -Path $installerRoot | Out-Null",
        "    Remove-Item $installerLogPath -Force -ErrorAction SilentlyContinue",
      ]);
      if (
        next.includes(retryAnchor) &&
        !next.includes(
          'Copy-Item $installerLogPath ($installerLogPath + ".attempt1")',
        )
      ) {
        next = next.replace(
          retryAnchor,
          block([
            '    Write-Host "Retrying installer via cmd /c (headless fallback)..."',
            "    Remove-Item $installerRoot -Recurse -Force -ErrorAction SilentlyContinue",
            "    New-Item -ItemType Directory -Force -Path $installerRoot | Out-Null",
            "    if (Test-Path $installerLogPath) {",
            '      Copy-Item $installerLogPath ($installerLogPath + ".attempt1") -Force -ErrorAction SilentlyContinue',
            "    }",
            "    Remove-Item $installerLogPath -Force -ErrorAction SilentlyContinue",
          ]),
        );
      }

      if (!next.includes("[4c/6] Startup logs:")) {
        const eventsAnchor = block([
          "  if (Test-Path $startupEventsFile) {",
          "    Get-Content $startupEventsFile -Tail 200 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }",
          "  } else {",
          '    Write-Host "(startup events file not found)"',
          "  }",
        ]);
        if (!next.includes(eventsAnchor)) {
          throw new Error("could not locate startup events diagnostics block");
        }
        next = next.replace(
          eventsAnchor,
          block([
            eventsAnchor,
            "",
            '  Write-Host ""',
            '  Write-Host "[4c/6] Startup logs:"',
            "  foreach ($candidateLog in $startupLogs) {",
            '    Write-Host "--- $candidateLog ---"',
            "    if (Test-Path $candidateLog) {",
            "      Get-Content $candidateLog -Tail 400 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }",
            "    } else {",
            '      Write-Host "(startup log not found)"',
            "    }",
            '    Write-Host "--- end $candidateLog ---"',
            "  }",
          ]),
        );
      }

      if (!next.includes("--- Bun/launcher command lines ---")) {
        const processTableAnchor = block([
          "      Format-Table -Property Id, ProcessName, StartTime, Responding -AutoSize |",
          "      Out-String |",
          "      Write-Host",
        ]);
        if (!next.includes(processTableAnchor)) {
          throw new Error("could not locate process diagnostics table");
        }
        next = next.replace(
          processTableAnchor,
          block([
            processTableAnchor,
            '    Write-Host "--- Bun/launcher command lines ---"',
            "    Get-CimInstance Win32_Process |",
            "      Where-Object {",
            '        $_.Name -in @("launcher.exe", "bun.exe") -or',
            '        $_.Name -like "Milady*"',
            "      } |",
            "      Select-Object ProcessId, Name, CommandLine |",
            "      Format-List |",
            "      Out-String |",
            "      Write-Host",
          ]),
        );
      }

      return next;
    },
  },
  {
    relativePath: windowsSmokePath,
    description: "discover and relaunch actual Windows self-extracted bundle",
    transform(source) {
      if (
        source.includes("function Find-SelfExtractedLauncher") &&
        source.includes("$selfExtractedRelaunchDone = $false")
      ) {
        return source;
      }

      let next = source;
      const eol = next.includes("\r\n") ? "\r\n" : "\n";
      const block = (lines) => lines.join(eol);

      const rootMatch = next.match(
        /\$selfExtractionRoot = Join-Path \$env:LOCALAPPDATA "([^"]+)"/,
      );
      if (!rootMatch) {
        throw new Error("could not locate Windows self-extraction root anchor");
      }
      next = next.replace(
        rootMatch[0],
        `$selfExtractionRoots = @(
  (Join-Path $env:LOCALAPPDATA "ai.milady.app"),
  (Join-Path $env:LOCALAPPDATA "${rootMatch[1]}"),
  (Join-Path $env:LOCALAPPDATA "com.elizaai.eliza"),
  (Join-Path $env:LOCALAPPDATA "ai.elizaos.app"),
  (Join-Path $env:LOCALAPPDATA "ai.elizaos.Eliza")
) | Select-Object -Unique
$selfExtractionRoot = $selfExtractionRoots[0]`,
      );

      const findLauncherAnchor = `function Expand-PackagedTarball([string]$ArchivePath, [string]$DestinationPath) {`;
      if (!next.includes(findLauncherAnchor)) {
        throw new Error("could not locate Expand-PackagedTarball anchor");
      }
      next = next.replace(
        findLauncherAnchor,
        `function Find-SelfExtractedLauncher() {
  foreach ($candidateRoot in $selfExtractionRoots) {
    $candidate = Find-Launcher $candidateRoot
    if ($candidate) {
      return $candidate
    }
  }

  if (Test-Path $env:LOCALAPPDATA) {
    return Get-ChildItem -Path $env:LOCALAPPDATA -Recurse -File -Filter "launcher.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName |
      Select-Object -First 1
  }

  return $null
}

${findLauncherAnchor}`,
      );

      const startedAnchor = "$launcherStarted = $false";
      if (!next.includes(startedAnchor)) {
        throw new Error("could not locate launcherStarted anchor");
      }
      next = next.replace(
        startedAnchor,
        `${startedAnchor}
$selfExtractedRelaunchDone = $false`,
      );

      const cleanupAnchor = block([
        "if (Test-Path $selfExtractionRoot) {",
        "  Remove-Item $selfExtractionRoot -Recurse -Force -ErrorAction SilentlyContinue",
        "}",
      ]);
      if (!next.includes(cleanupAnchor)) {
        throw new Error("could not locate self-extraction cleanup anchor");
      }
      next = next.replace(
        cleanupAnchor,
        `foreach ($candidateRoot in $selfExtractionRoots) {
  if (Test-Path $candidateRoot) {
    Remove-Item $candidateRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}`,
      );

      const loopAnchor = block([
        "  while ((Get-Date) -lt $deadline) {",
        "    $startupState = Get-StartupState",
        "",
      ]);
      if (!next.includes(loopAnchor)) {
        throw new Error("could not locate Windows smoke loop anchor");
      }
      const stopProcesses = next.includes("function Stop-MiladyProcesses")
        ? "Stop-MiladyProcesses"
        : "Stop-ElizaProcesses";
      next = next.replace(
        loopAnchor,
        `  while ((Get-Date) -lt $deadline) {
    $startupState = Get-StartupState
    $elapsedSeconds = [int]((Get-Date) - $deadline.AddSeconds(-$TimeoutSeconds)).TotalSeconds

    if (
      -not $selfExtractedRelaunchDone -and
      $launcherSource -eq "installed Inno package" -and
      $elapsedSeconds -ge 20
    ) {
      $extractedLauncher = Find-SelfExtractedLauncher
      if ($extractedLauncher -and $extractedLauncher.FullName -ne $launcher.FullName) {
        Write-Host "Relaunching self-extracted launcher directly: $($extractedLauncher.FullName)"
        ${stopProcesses}
        $launcher = Write-ReusableLauncherPath -Launcher $extractedLauncher -TemporaryRoot $null
        $launcherDir = Split-Path -Parent $launcher.FullName
        $startupBundleRoot = Split-Path -Parent $launcherDir
        $startupBootstrapFile = Join-Path $startupBundleRoot "startup-session.json"
        Write-StartupBootstrap
        $launcherProcess = Start-Process -FilePath $launcher.FullName -WorkingDirectory $launcherDir -PassThru
        $launcherStarted = $true
        $selfExtractedRelaunchDone = $true
        Write-Host "Started self-extracted launcher: $($launcher.FullName)"
        Start-Sleep -Seconds 2
      }
    }
`,
      );

      const findInLoopAnchor = block([
        "    if (-not $launcher) {",
        "      $launcher = Find-Launcher $selfExtractionRoot",
        "      if ($launcher) {",
        "        $launcher = Write-ReusableLauncherPath -Launcher $launcher -TemporaryRoot $null",
        '        Write-Host "Found extracted launcher: $($launcher.FullName)"',
        "      }",
        "    }",
      ]);
      if (!next.includes(findInLoopAnchor)) {
        throw new Error("could not locate extracted launcher discovery anchor");
      }
      next = next.replace(
        findInLoopAnchor,
        `    if (-not $launcher) {
      $launcher = Find-SelfExtractedLauncher
      if ($launcher) {
        $launcher = Write-ReusableLauncherPath -Launcher $launcher -TemporaryRoot $null
        Write-Host "Found extracted launcher: $($launcher.FullName)"
      }
    }`,
      );

      const contentsAnchor = block([
        "    if (Test-Path $selfExtractionRoot) {",
        '      Write-Host "Self-extraction contents:"',
        "      Get-ChildItem -Path $selfExtractionRoot -Recurse -File -ErrorAction SilentlyContinue |",
        "        Select-Object -ExpandProperty FullName",
        "    }",
      ]);
      if (!next.includes(contentsAnchor)) {
        throw new Error("could not locate self-extraction diagnostics anchor");
      }
      next = next.replace(
        contentsAnchor,
        `    foreach ($candidateRoot in $selfExtractionRoots) {
      if (Test-Path $candidateRoot) {
        Write-Host "Self-extraction contents ($candidateRoot):"
        Get-ChildItem -Path $candidateRoot -Recurse -File -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty FullName
      }
    }`,
      );

      return next;
    },
  },
  {
    relativePath: postwrapDiagnosticsPath,
    description:
      "postwrap-diagnostics: drop wrapper-only checks for launcher.exe and libwebgpu_dawn.dll",
    transform(source) {
      // The wrapper bundle's bin/ holds the self-extracting toolchain
      // (extractor.exe, bun.exe, bspatch.exe, process_helper.exe,
      // libNativeWrapper.dll). The real launcher.exe and libwebgpu_dawn.dll
      // live inside the resource tarball, so the existing checks reported
      // them as "missing" on every Windows build. Drop them from the
      // wrapper-side lists; the tarball scan below still reports WGPU.
      const launcherRe =
        /\bosName === "win" \? "launcher\.exe" : "launcher",\s*/;
      let next = source.replace(launcherRe, "");
      const dllRe = /^(\s*)"libwebgpu_dawn\.dll",\n/m;
      next = next.replace(dllRe, "");
      if (next === source) {
        return source;
      }
      return next;
    },
  },
  {
    relativePath: postwrapDiagnosticsPath,
    description:
      "postwrap-diagnostics: match WGPU dll without lib prefix on Windows",
    transform(source) {
      // Electrobun's Windows packaging copies WGPU as `webgpu_dawn.dll`
      // (no lib prefix). The existing substring search for `libwebgpu_dawn`
      // never matched, so containsWgpuDawn always reported false even when
      // the tarball had the file. Match the no-prefix form too.
      const needle = 'listing.includes("libwebgpu_dawn")';
      if (!source.includes(needle)) {
        return source;
      }
      return source.replace(needle, 'listing.includes("webgpu_dawn")');
    },
  },
];

function patchFile({ relativePath, description, transform }) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing ${relativePath}`);
  }

  const current = fs.readFileSync(filePath, "utf8");
  const next = transform(current);
  if (next === current) {
    console.log(
      `[patch-electrobun-release-compat] already patched: ${description}`,
    );
    return false;
  }

  if (checkOnly) {
    console.log(
      `[patch-electrobun-release-compat] would patch: ${description}`,
    );
    return true;
  }

  fs.writeFileSync(filePath, next, "utf8");
  console.log(`[patch-electrobun-release-compat] patched: ${description}`);
  return true;
}

try {
  const changedCount = patches.filter((patch) => patchFile(patch)).length;
  console.log(
    `[patch-electrobun-release-compat] ${checkOnly ? "check complete" : "complete"} (${changedCount} change${changedCount === 1 ? "" : "s"})`,
  );
} catch (error) {
  console.error(
    `[patch-electrobun-release-compat] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
