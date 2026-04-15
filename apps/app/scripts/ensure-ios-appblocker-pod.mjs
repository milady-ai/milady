#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const iosDir = path.resolve(here, "../ios/App");
const podfilePath = path.join(iosDir, "Podfile");
const entitlementsPath = path.join(iosDir, "App", "App.entitlements");
const capAppSpmPackagePath = path.join(iosDir, "CapApp-SPM", "Package.swift");
const xcodeProjectPath = path.join(iosDir, "App.xcodeproj", "project.pbxproj");
const capacitorIosPackagePath = fs.realpathSync(
  path.resolve(here, "../node_modules/@capacitor/ios"),
);
const capacitorAppPackagePath = fs.realpathSync(
  path.resolve(here, "../node_modules/@capacitor/app"),
);
const capacitorKeyboardPackagePath = fs.realpathSync(
  path.resolve(here, "../node_modules/@capacitor/keyboard"),
);
const capacitorPreferencesPackagePath = fs.realpathSync(
  path.resolve(here, "../node_modules/@capacitor/preferences"),
);
const capacitorIosRelativePath = path.relative(iosDir, capacitorIosPackagePath);
const capacitorAppRelativePath = path.relative(iosDir, capacitorAppPackagePath);
const capacitorKeyboardRelativePath = path.relative(
  iosDir,
  capacitorKeyboardPackagePath,
);
const capacitorPreferencesRelativePath = path.relative(
  iosDir,
  capacitorPreferencesPackagePath,
);
const capacitorIosRequirePath = path.join(
  capacitorIosRelativePath,
  "scripts/pods_helpers",
);
const capacitorRequireLine = `require_relative '${capacitorIosRequirePath}'`;
const capacitorPodLine = `  pod 'Capacitor', :path => '${capacitorIosRelativePath}'`;
const capacitorCordovaPodLine = `  pod 'CapacitorCordova', :path => '${capacitorIosRelativePath}'`;
const capacitorAppPodLine = `  pod 'CapacitorApp', :path => '${capacitorAppRelativePath}'`;
const capacitorKeyboardPodLine = `  pod 'CapacitorKeyboard', :path => '${capacitorKeyboardRelativePath}'`;
const capacitorPreferencesPodLine = `  pod 'CapacitorPreferences', :path => '${capacitorPreferencesRelativePath}'`;
const anchorLine =
  "  pod 'ElizaosCapacitorAgent', :path => '../../../../eliza/packages/native-plugins/agent'";
const appBlockerLine =
  "  pod 'ElizaosCapacitorAppblocker', :path => '../../../../eliza/packages/native-plugins/appblocker'";
const familyControlsKey = "\t<key>com.apple.developer.family-controls</key>";
const familyControlsValue = "\t<true/>";
const compileAssetCatalogPhaseId = "ELIZA0001COMPILEASSETS001";
const compileAssetCatalogPhaseLabel = `${compileAssetCatalogPhaseId} /* Compile Asset Catalog */`;
const shellVar = (name) => `\${${name}}`;
const compileAssetCatalogScript = [
  "# Compile asset catalog directly with actool, bypassing xcodebuild's",
  "# built-in asset catalog compilation which fails on Xcode 16.1 with",
  "# 'Failed to launch AssetCatalogSimulatorAgent via CoreSimulator spawn'.",
  "# actool produces correct output files even when the thinning agent",
  "# fails, so we ignore the exit code (|| true).",
  `ACTOOL=\\"${shellVar("DEVELOPER_DIR")}/usr/bin/actool\\"`,
  `\\"${shellVar("ACTOOL")}\\" \\\\\\n  --output-format human-readable-text \\\\\\n  --notices --warnings \\\\\\n  --app-icon AppIcon \\\\\\n  --compress-pngs \\\\\\n  --enable-on-demand-resources YES \\\\\\n  --development-region en \\\\\\n  --target-device iphone \\\\\\n  --target-device ipad \\\\\\n  --minimum-deployment-target \\"${shellVar("IPHONEOS_DEPLOYMENT_TARGET")}\\" \\\\\\n  --platform \\"${shellVar("PLATFORM_NAME")}\\" \\\\\\n  --output-partial-info-plist \\"${shellVar("TARGET_TEMP_DIR")}/assetcatalog_generated_info.plist\\" \\\\\\n  --compile \\"${shellVar("TARGET_BUILD_DIR")}/${shellVar("UNLOCALIZED_RESOURCES_FOLDER_PATH")}\\" \\\\\\n  \\"${shellVar("SRCROOT")}/App/Assets.xcassets\\" || true`,
  "",
].join("\\n");
const compileAssetCatalogPhase = [
  `\t\t${compileAssetCatalogPhaseLabel} = {`,
  "\t\t\tisa = PBXShellScriptBuildPhase;",
  "\t\t\tbuildActionMask = 2147483647;",
  "\t\t\tfiles = (",
  "\t\t\t);",
  "\t\t\tinputPaths = (",
  '\t\t\t\t"$(SRCROOT)/App/Assets.xcassets",',
  "\t\t\t);",
  '\t\t\tname = "Compile Asset Catalog";',
  "\t\t\toutputPaths = (",
  '\t\t\t\t"$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/Assets.car",',
  "\t\t\t);",
  "\t\t\trunOnlyForDeploymentPostprocessing = 0;",
  "\t\t\tshellPath = /bin/sh;",
  `\t\t\tshellScript = "${compileAssetCatalogScript}";`,
  "\t\t\tshowEnvVarsInLog = 0;",
  "\t\t};",
  "",
].join("\n");
const minimalCapAppSpmPackage = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    targets: [
        .target(
            name: "CapApp-SPM")
    ]
)
`;

function replacePodLine(contents, podName, expectedLine) {
  const pattern = new RegExp(`^  pod '${podName}', :path => '.*'$`, "m");
  return contents.replace(pattern, expectedLine);
}

function ensurePodLine(contents, podName, expectedLine, insertAfterLine) {
  const withReplaced = replacePodLine(contents, podName, expectedLine);
  if (withReplaced !== contents) {
    return withReplaced;
  }
  if (withReplaced.includes(expectedLine)) {
    return withReplaced;
  }
  if (!withReplaced.includes(insertAfterLine)) {
    throw new Error(
      `Could not patch ${podfilePath}: missing insertion anchor for ${podName}.`,
    );
  }
  return withReplaced.replace(
    insertAfterLine,
    `${insertAfterLine}\n${expectedLine}`,
  );
}

function ensureIosProjectAssetCatalogWorkaround() {
  if (!fs.existsSync(xcodeProjectPath)) {
    return;
  }

  let pbxproj = fs.readFileSync(xcodeProjectPath, "utf8");
  let dirty = false;

  if (!pbxproj.includes(compileAssetCatalogPhaseLabel)) {
    pbxproj = pbxproj.replace(
      "/* Begin PBXShellScriptBuildPhase section */\n",
      `/* Begin PBXShellScriptBuildPhase section */\n${compileAssetCatalogPhase}`,
    );
    dirty = true;
  }

  if (!pbxproj.includes(`\t\t\t\t${compileAssetCatalogPhaseLabel},`)) {
    pbxproj = pbxproj.replace(
      /\t\t\t\t504EC3021FED79650016851F \/\* Resources \*\/,\n/,
      `\t\t\t\t504EC3021FED79650016851F /* Resources */,\n\t\t\t\t${compileAssetCatalogPhaseLabel},\n`,
    );
    dirty = true;
  }

  if (
    pbxproj.includes(
      "\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n",
    )
  ) {
    pbxproj = pbxproj.replace(
      "\t\t\t\t504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n",
      "",
    );
    dirty = true;
  }

  if (dirty) {
    fs.writeFileSync(xcodeProjectPath, pbxproj, "utf8");
  }
}

if (!fs.existsSync(podfilePath)) {
  process.exit(0);
}

let needsPodInstall = false;
let podfile = fs.readFileSync(podfilePath, "utf8");

const nextPodfile = podfile
  .replace(/^require_relative\s+['"].*pods_helpers['"]$/m, capacitorRequireLine)
  .replace(/^ {2}pod 'Capacitor', :path => '.*'$/m, capacitorPodLine)
  .replace(
    /^ {2}pod 'CapacitorCordova', :path => '.*'$/m,
    capacitorCordovaPodLine,
  );

if (nextPodfile !== podfile) {
  podfile = nextPodfile;
  needsPodInstall = true;
}

const nextPodfileWithOfficialPlugins = [
  ["CapacitorApp", capacitorAppPodLine, capacitorCordovaPodLine],
  ["CapacitorKeyboard", capacitorKeyboardPodLine, capacitorAppPodLine],
  [
    "CapacitorPreferences",
    capacitorPreferencesPodLine,
    capacitorKeyboardPodLine,
  ],
].reduce(
  (contents, [podName, expectedLine, insertAfterLine]) =>
    ensurePodLine(contents, podName, expectedLine, insertAfterLine),
  podfile,
);

if (nextPodfileWithOfficialPlugins !== podfile) {
  podfile = nextPodfileWithOfficialPlugins;
  needsPodInstall = true;
}

if (!podfile.includes(appBlockerLine)) {
  if (!podfile.includes(anchorLine)) {
    throw new Error(
      `Could not patch ${podfilePath}: missing anchor line for local plugin pods.`,
    );
  }

  podfile = podfile.replace(anchorLine, `${anchorLine}\n${appBlockerLine}`);
  needsPodInstall = true;
}

fs.writeFileSync(podfilePath, podfile, "utf8");

if (fs.existsSync(capAppSpmPackagePath)) {
  const capAppSpmPackage = fs.readFileSync(capAppSpmPackagePath, "utf8");
  if (capAppSpmPackage !== minimalCapAppSpmPackage) {
    fs.writeFileSync(capAppSpmPackagePath, minimalCapAppSpmPackage, "utf8");
  }
}

if (fs.existsSync(entitlementsPath)) {
  const entitlements = fs.readFileSync(entitlementsPath, "utf8");
  if (!entitlements.includes("com.apple.developer.family-controls")) {
    const insertion = `${familyControlsKey}\n${familyControlsValue}\n`;
    const nextEntitlements = entitlements.replace(
      /(\s*<key>com\.apple\.security\.application-groups<\/key>\s*\n)/,
      `${insertion}$1`,
    );
    fs.writeFileSync(entitlementsPath, nextEntitlements, "utf8");
  }
}

ensureIosProjectAssetCatalogWorkaround();

if (needsPodInstall) {
  execFileSync("pod", ["install"], {
    cwd: iosDir,
    stdio: "inherit",
  });
}
