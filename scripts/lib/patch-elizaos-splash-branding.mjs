import fs from "node:fs";
import path from "node:path";

export const DEFAULT_FRAMEWORK_NAME = "elizaOS";
export const DEFAULT_SPLASH_BACKGROUND = "#0a0a0a";
export const SPLASH_BRANDING_PATCH_MARKER =
  "// milady patch: white-label splash branding";
export const SPLASH_BRAND_IMAGE_MARKER = "// milady patch: splash brand image";
export const SPLASH_POWERED_BY_MARKER =
  "// milady patch: splash powered-by caption";

const SPLASH_BRAND_MARK_IMAGE_ONLY =
  'return (_jsx("img", { src: resolveAppAssetUrl(splashBrandImage), alt: branding.appName?.trim() || "Milady", className: "mx-auto mb-2 w-full max-w-[min(92vw,36rem)] object-contain" }));';

function splashBrandMarkImageWithPoweredByJsx() {
  return [
    'return (_jsxs("div", { className: "mb-2 flex flex-col items-center gap-2 text-center", children: [_jsx("img", { src: resolveAppAssetUrl(splashBrandImage), alt: appName, className: "mx-auto w-full max-w-[min(92vw,36rem)] object-contain" }), showPoweredBy',
    '            ? _jsxs("span", { style: { fontFamily: FONT }, className: "text-3xs uppercase tracking-[0.18em] text-white/55", children: ["powered by ", frameworkName] })',
    "            : null] }));",
  ].join("\n        ");
}

export function resolveSplashBrandingLines() {
  return [
    SPLASH_BRANDING_PATCH_MARKER,
    SPLASH_BRAND_IMAGE_MARKER,
    "function resolveSplashBranding(branding) {",
    '    const appName = branding.appName?.trim() || "Eliza";',
    `    const frameworkName = branding.frameworkName?.trim() || "${DEFAULT_FRAMEWORK_NAME}";`,
    "    const showPoweredBy =",
    "        appName.localeCompare(frameworkName, undefined, {",
    '            sensitivity: "accent",',
    "        }) !== 0;",
    "    return { appName, frameworkName, showPoweredBy };",
    "}",
    SPLASH_POWERED_BY_MARKER,
    "function SplashBrandMark({ branding }) {",
    "    const splashBrandImage = branding.splashBrandImage?.trim();",
    "    const { appName, frameworkName, showPoweredBy } =",
    "        resolveSplashBranding(branding);",
    "    if (splashBrandImage) {",
    `        ${splashBrandMarkImageWithPoweredByJsx()}`,
    "    }",
    '    return (_jsxs("div", { className: "mb-4 flex flex-col items-center gap-1 text-center", children: [_jsx("span", { style: { fontFamily: FONT }, className: "text-2xl font-black uppercase tracking-[0.12em]", children: appName }), showPoweredBy',
    '        ? _jsxs("span", { style: { fontFamily: FONT }, className: "text-3xs uppercase tracking-[0.18em] text-black/55", children: ["powered by ", frameworkName] })',
    "        : null] }));",
    "}",
  ].join("\n");
}

export function patchBrandingConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  if (!filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  if (original.includes("splashBrandImage")) {
    return false;
  }

  const cloudOnlyFieldPattern = /^(\s*)cloudOnly\?: boolean;/m;
  let next = original;

  if (
    !original.includes("frameworkName") &&
    cloudOnlyFieldPattern.test(original)
  ) {
    next = next.replace(
      cloudOnlyFieldPattern,
      (match, indent) =>
        `${indent}/** Framework credit on splash (default "${DEFAULT_FRAMEWORK_NAME}"). */\n${indent}frameworkName?: string;\n${match}`,
    );
  }

  if (!next.includes("splashBrandImage")) {
    const frameworkFieldPattern = /^(\s*)frameworkName\?: string;/m;
    const splashImageFieldPattern = next.includes("frameworkName")
      ? frameworkFieldPattern
      : cloudOnlyFieldPattern;
    if (!splashImageFieldPattern.test(next)) {
      throw new Error(
        `expected BrandingConfig anchor field not found in ${filePath}`,
      );
    }
    next = next.replace(
      splashImageFieldPattern,
      (match, indent) =>
        `${match}\n${indent}/** Centered brand image on the startup splash (app public asset path). */\n${indent}splashBrandImage?: string;`,
    );
  }

  if (next === original) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

function upgradeAppCoreStartupShellBrandImage(filePath, source) {
  let next = source;
  if (next.includes(SPLASH_BRAND_IMAGE_MARKER)) {
    return false;
  }

  next = next.replace(
    "function SplashBrandingTitle({ branding }) {",
    "function SplashBrandMark({ branding }) {",
  );
  next = next.replaceAll("SplashBrandingTitle", "SplashBrandMark");

  if (
    !next.includes(
      "const splashBrandImage = branding.splashBrandImage?.trim();",
    )
  ) {
    next = next.replace(
      "function SplashBrandMark({ branding }) {",
      `${SPLASH_BRAND_IMAGE_MARKER}\nfunction SplashBrandMark({ branding }) {\n    const splashBrandImage = branding.splashBrandImage?.trim();\n    if (splashBrandImage) {\n        return (_jsx("img", { src: resolveAppAssetUrl(splashBrandImage), alt: branding.appName?.trim() || "Milady", className: "mx-auto mb-2 w-full max-w-[min(92vw,36rem)] object-contain" }));\n    }`,
    );
  }

  const splashBrandImageVar =
    "    const splashBrandImage = branding.splashBrandImage?.trim();";
  if (!next.includes(splashBrandImageVar)) {
    next = next.replace(
      "    const branding = useBranding();",
      `    const branding = useBranding();\n${splashBrandImageVar}`,
    );
  }

  if (
    next.includes(
      'className: "flex items-center justify-center h-full w-full bg-[#ffe600] text-black overflow-hidden"',
    )
  ) {
    next = next.replace(
      'className: "flex items-center justify-center h-full w-full bg-[#ffe600] text-black overflow-hidden", children: [_jsx("img", { src: resolveAppAssetUrl("splash-bg.png"), alt: "", "aria-hidden": "true", className: "pointer-events-none absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full", style: { maxWidth: 360 }',
      `className: \`flex items-center justify-center h-full w-full overflow-hidden \${splashBrandImage ? "bg-[${DEFAULT_SPLASH_BACKGROUND}] text-white" : "bg-[#ffe600] text-black"}\`, children: [splashBrandImage ? null : _jsx("img", { src: resolveAppAssetUrl("splash-bg.png"), alt: "", "aria-hidden": "true", className: "pointer-events-none absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full", style: { maxWidth: splashBrandImage ? 480 : 360 }`,
    );
  }

  if (
    next.includes(
      'className: "mt-2 text-3xs text-black/50 uppercase animate-pulse"',
    )
  ) {
    next = next.replace(
      'className: "mt-2 text-3xs text-black/50 uppercase animate-pulse", children: t(phaseToStatusKey(phase))',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this patches a generated template literal string.
      'className: `mt-2 text-3xs uppercase animate-pulse ${splashBrandImage ? "text-white/60" : "text-black/50"}`, children: t(phaseToStatusKey(phase))',
    );
  }

  if (next === source) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

export function patchAppCoreStartupShell(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let next = fs.readFileSync(filePath, "utf8");
  if (
    next.includes(SPLASH_BRANDING_PATCH_MARKER) &&
    next.includes(SPLASH_BRAND_IMAGE_MARKER)
  ) {
    return false;
  }

  if (next.includes(SPLASH_BRANDING_PATCH_MARKER)) {
    return upgradeAppCoreStartupShellBrandImage(filePath, next);
  }

  const importNeedle = 'import { useApp } from "../../state";';
  if (!next.includes(importNeedle)) {
    throw new Error(`expected useApp import not found in ${filePath}`);
  }

  next = next.replace(
    importNeedle,
    `${importNeedle}\nimport { useBranding } from "../../config/branding";`,
  );

  const helperAnchor = "const FONT = ";
  if (!next.includes(helperAnchor)) {
    throw new Error(`expected FONT constant not found in ${filePath}`);
  }

  next = next.replace(
    helperAnchor,
    `${resolveSplashBrandingLines()}\n${helperAnchor}`,
  );

  const hookNeedle =
    "    const { startupCoordinator, startupError, onboardingCloudProvisionedContainer, retryStartup, setActionNotice, setState, t, } = useApp();";
  if (!next.includes(hookNeedle)) {
    throw new Error(`expected useApp destructure not found in ${filePath}`);
  }

  next = next.replace(
    hookNeedle,
    `${hookNeedle}\n    const branding = useBranding();`,
  );

  const layoutNeedle =
    'children: _jsxs("div", { className: "w-full mt-2", children: [_jsx("div", { className: "h-5 w-full border-2 border-black/70 bg-black/5 overflow-hidden"';
  if (!next.includes(layoutNeedle)) {
    throw new Error(`expected splash layout marker not found in ${filePath}`);
  }

  next = next.replace(
    layoutNeedle,
    'children: _jsxs("div", { className: "w-full mt-2", children: [_jsx(SplashBrandMark, { branding: branding }), _jsx("div", { className: "h-5 w-full border-2 border-black/70 bg-black/5 overflow-hidden"',
  );

  const splashBrandImageVar =
    "    const splashBrandImage = branding.splashBrandImage?.trim();";
  if (!next.includes(splashBrandImageVar)) {
    next = next.replace(
      "    const branding = useBranding();",
      `    const branding = useBranding();\n${splashBrandImageVar}`,
    );
  }

  next = next.replace(
    'className: "flex items-center justify-center h-full w-full bg-[#ffe600] text-black overflow-hidden", children: [_jsx("img", { src: resolveAppAssetUrl("splash-bg.png"), alt: "", "aria-hidden": "true", className: "pointer-events-none absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full", style: { maxWidth: 360 }',
    `className: \`flex items-center justify-center h-full w-full overflow-hidden \${splashBrandImage ? "bg-[${DEFAULT_SPLASH_BACKGROUND}] text-white" : "bg-[#ffe600] text-black"}\`, children: [splashBrandImage ? null : _jsx("img", { src: resolveAppAssetUrl("splash-bg.png"), alt: "", "aria-hidden": "true", className: "pointer-events-none absolute inset-0 h-full w-full object-cover" }), _jsx("div", { className: "relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full", style: { maxWidth: splashBrandImage ? 480 : 360 }`,
  );

  next = next.replace(
    'className: "mt-2 text-3xs text-black/50 uppercase animate-pulse", children: t(phaseToStatusKey(phase))',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this patches a generated template literal string.
    'className: `mt-2 text-3xs uppercase animate-pulse ${splashBrandImage ? "text-white/60" : "text-black/50"}`, children: t(phaseToStatusKey(phase))',
  );

  if (next === fs.readFileSync(filePath, "utf8")) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

export function patchUiStartupShell(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let next = fs.readFileSync(filePath, "utf8");
  if (next.includes(SPLASH_BRANDING_PATCH_MARKER)) {
    return false;
  }

  const hardcodedNeedle = `          <span className="text-4xl font-medium leading-none tracking-normal">
            elizaOS
          </span>`;
  if (!next.includes(hardcodedNeedle)) {
    return false;
  }

  if (!next.includes("import type { StartupShellProps }")) {
    throw new Error(
      `expected StartupShellProps import not found in ${filePath}`,
    );
  }

  next = next.replace(
    'import type { StartupShellProps } from "./startup-shell-types";',
    `import type { StartupShellProps } from "./startup-shell-types";\nimport {\n  DEFAULT_APP_DISPLAY_NAME,\n  useBranding,\n} from "../../config/branding";\n${SPLASH_BRANDING_PATCH_MARKER}`,
  );

  next = next.replace(
    hardcodedNeedle,
    `          <div className="flex flex-col items-start gap-1 text-left">
            <span className="text-4xl font-medium leading-none tracking-normal">
              {(() => {
                const branding = useBranding();
                const appName =
                  branding.appName?.trim() || DEFAULT_APP_DISPLAY_NAME;
                const frameworkName =
                  branding.frameworkName?.trim() || "${DEFAULT_FRAMEWORK_NAME}";
                const showPoweredBy =
                  appName.localeCompare(frameworkName, undefined, {
                    sensitivity: "accent",
                  }) !== 0;
                return (
                  <>
                    <span>{appName}</span>
                    {showPoweredBy ? (
                      <span className="text-sm font-normal tracking-normal text-white/70">
                        powered by {frameworkName}
                      </span>
                    ) : null}
                  </>
                );
              })()}
            </span>
          </div>`,
  );

  // useBranding must be called at component top level — fix the IIFE approach.
  // Rewrite StartupLoading to use hooks properly.
  const loadingFnNeedle =
    "function StartupLoading(props: { phase: string; status: string }) {";
  if (!next.includes(loadingFnNeedle)) {
    throw new Error(
      `expected StartupLoading function not found in ${filePath}`,
    );
  }

  next = next.replace(
    `function StartupLoading(props: { phase: string; status: string }) {
  return (`,
    `function StartupLoading(props: { phase: string; status: string }) {
  const branding = useBranding();
  const appName = branding.appName?.trim() || DEFAULT_APP_DISPLAY_NAME;
  const frameworkName = branding.frameworkName?.trim() || "${DEFAULT_FRAMEWORK_NAME}";
  const showPoweredBy =
    appName.localeCompare(frameworkName, undefined, {
      sensitivity: "accent",
    }) !== 0;

  return (`,
  );

  next = next.replace(
    `          <div className="flex flex-col items-start gap-1 text-left">
            <span className="text-4xl font-medium leading-none tracking-normal">
              {(() => {
                const branding = useBranding();
                const appName =
                  branding.appName?.trim() || DEFAULT_APP_DISPLAY_NAME;
                const frameworkName =
                  branding.frameworkName?.trim() || "${DEFAULT_FRAMEWORK_NAME}";
                const showPoweredBy =
                  appName.localeCompare(frameworkName, undefined, {
                    sensitivity: "accent",
                  }) !== 0;
                return (
                  <>
                    <span>{appName}</span>
                    {showPoweredBy ? (
                      <span className="text-sm font-normal tracking-normal text-white/70">
                        powered by {frameworkName}
                      </span>
                    ) : null}
                  </>
                );
              })()}
            </span>
          </div>`,
    `          <div className="flex flex-col items-start gap-1 text-left">
            <span className="text-4xl font-medium leading-none tracking-normal">
              {appName}
            </span>
            {showPoweredBy ? (
              <span className="text-sm font-normal tracking-normal text-white/70">
                powered by {frameworkName}
              </span>
            ) : null}
          </div>`,
  );

  fs.writeFileSync(filePath, next);
  return true;
}

export function patchUiStartupShellJs(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let next = fs.readFileSync(filePath, "utf8");
  if (next.includes(SPLASH_BRANDING_PATCH_MARKER)) {
    return false;
  }

  const hardcodedNeedle = 'children: "elizaOS"';
  if (!next.includes(hardcodedNeedle)) {
    return false;
  }

  const importNeedle =
    'import { BootstrapStep } from "../setup/BootstrapStep";';
  if (!next.includes(importNeedle)) {
    throw new Error(`expected BootstrapStep import not found in ${filePath}`);
  }

  next = next.replace(
    importNeedle,
    `${importNeedle}\nimport { DEFAULT_APP_DISPLAY_NAME, useBranding } from "../../config/branding";\n${SPLASH_BRANDING_PATCH_MARKER}`,
  );

  const loadingNeedle = "function StartupLoading(props) {";
  if (!next.includes(loadingNeedle)) {
    throw new Error(
      `expected StartupLoading function not found in ${filePath}`,
    );
  }

  next = next.replace(
    loadingNeedle,
    `function StartupLoading(props) {
    const branding = useBranding();
    const appName = branding.appName?.trim() || DEFAULT_APP_DISPLAY_NAME;
    const frameworkName = branding.frameworkName?.trim() || "${DEFAULT_FRAMEWORK_NAME}";
    const showPoweredBy = appName.localeCompare(frameworkName, undefined, {
        sensitivity: "accent",
    }) !== 0;`,
  );

  next = next.replace(hardcodedNeedle, "children: appName");

  const statusNeedle =
    'className: "min-h-5 text-sm text-white/80 animate-pulse motion-reduce:animate-none"';
  if (next.includes(statusNeedle)) {
    next = next.replace(
      statusNeedle,
      'className: "min-h-5 text-sm text-white/80 animate-pulse motion-reduce:animate-none"',
    );
    // Insert powered-by line before status <p>
    const poweredByJsx = `, showPoweredBy ? (_jsx("span", { className: "text-sm font-normal tracking-normal text-white/70", children: ["powered by ", frameworkName] })) : null, _jsx("p", {`;
    next = next.replace(', _jsx("p", {', poweredByJsx);
  }

  fs.writeFileSync(filePath, next);
  return true;
}

export function collectBrandingPatchTargets(repoRoot) {
  const targets = {
    brandingConfigs: [],
    appCoreStartupShells: [],
    uiStartupShells: [],
  };

  const elizaRoot = path.join(repoRoot, "eliza");
  if (fs.existsSync(elizaRoot)) {
    targets.brandingConfigs.push(
      path.join(elizaRoot, "packages/shared/src/config/branding.ts"),
      path.join(elizaRoot, "packages/app-core/src/config/branding.ts"),
      path.join(elizaRoot, "packages/app-core/src/config/branding.d.ts"),
    );
    targets.uiStartupShells.push(
      path.join(elizaRoot, "packages/ui/src/components/shell/StartupShell.tsx"),
      path.join(elizaRoot, "packages/ui/src/components/shell/StartupShell.js"),
    );
    targets.appCoreStartupShells.push(
      path.join(
        elizaRoot,
        "packages/app-core/src/components/shell/StartupShell.tsx",
      ),
      path.join(
        elizaRoot,
        "packages/app-core/src/components/shell/StartupShell.js",
      ),
    );
  }

  const bunStore = path.join(repoRoot, "node_modules", ".bun");
  if (fs.existsSync(bunStore)) {
    for (const entry of fs.readdirSync(bunStore, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const appCoreDir = path.join(
        bunStore,
        entry.name,
        "node_modules",
        "@elizaos",
        "app-core",
      );
      if (entry.name.startsWith("@elizaos+app-core@")) {
        targets.brandingConfigs.push(
          path.join(appCoreDir, "packages/app-core/src/config/branding.d.ts"),
          path.join(appCoreDir, "packages/app-core/src/config/branding.ts"),
        );
        targets.appCoreStartupShells.push(
          path.join(
            appCoreDir,
            "packages/app-core/src/components/shell/StartupShell.js",
          ),
        );
      }
      const uiDir = path.join(
        bunStore,
        entry.name,
        "node_modules",
        "@elizaos",
        "ui",
      );
      if (entry.name.startsWith("@elizaos+ui@")) {
        targets.uiStartupShells.push(
          path.join(uiDir, "packages/ui/src/components/shell/StartupShell.tsx"),
          path.join(uiDir, "packages/ui/src/components/shell/StartupShell.js"),
          path.join(uiDir, "src/components/shell/StartupShell.tsx"),
          path.join(uiDir, "src/components/shell/StartupShell.js"),
        );
        targets.brandingConfigs.push(
          path.join(uiDir, "packages/app-core/src/config/branding.d.ts"),
          path.join(uiDir, "packages/app-core/src/config/branding.ts"),
        );
      }
    }
  }

  const linkedAppCore = path.join(
    repoRoot,
    "node_modules",
    "@elizaos",
    "app-core",
  );
  if (fs.existsSync(linkedAppCore)) {
    targets.brandingConfigs.push(
      path.join(linkedAppCore, "packages/app-core/src/config/branding.d.ts"),
      path.join(linkedAppCore, "packages/app-core/src/config/branding.ts"),
    );
    targets.appCoreStartupShells.push(
      path.join(
        linkedAppCore,
        "packages/app-core/src/components/shell/StartupShell.js",
      ),
    );
  }

  return {
    brandingConfigs: [...new Set(targets.brandingConfigs)],
    appCoreStartupShells: [...new Set(targets.appCoreStartupShells)],
    uiStartupShells: [...new Set(targets.uiStartupShells)],
  };
}

function upgradeSplashPoweredByMark(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  if (
    original.includes(SPLASH_POWERED_BY_MARKER) ||
    !original.includes(SPLASH_BRAND_IMAGE_MARKER)
  ) {
    return false;
  }

  let next = original;

  const oldBlock =
    "function SplashBrandMark({ branding }) {\n    const splashBrandImage = branding.splashBrandImage?.trim();\n    if (splashBrandImage) {\n        " +
    SPLASH_BRAND_MARK_IMAGE_ONLY +
    "\n    }\n    const { appName, frameworkName, showPoweredBy } =\n        resolveSplashBranding(branding);";

  const newBlock = [
    SPLASH_POWERED_BY_MARKER,
    "function SplashBrandMark({ branding }) {",
    "    const splashBrandImage = branding.splashBrandImage?.trim();",
    "    const { appName, frameworkName, showPoweredBy } =",
    "        resolveSplashBranding(branding);",
    "    if (splashBrandImage) {",
    `        ${splashBrandMarkImageWithPoweredByJsx()}`,
    "    }",
  ].join("\n");

  if (next.includes(oldBlock)) {
    next = next.replace(oldBlock, newBlock);
  } else if (next.includes(SPLASH_BRAND_MARK_IMAGE_ONLY)) {
    next = next.replace(
      "    const splashBrandImage = branding.splashBrandImage?.trim();\n    if (splashBrandImage) {\n        " +
        SPLASH_BRAND_MARK_IMAGE_ONLY,
      "    const splashBrandImage = branding.splashBrandImage?.trim();\n    const { appName, frameworkName, showPoweredBy } =\n        resolveSplashBranding(branding);\n    if (splashBrandImage) {\n        " +
        splashBrandMarkImageWithPoweredByJsx(),
    );
    if (!next.includes(SPLASH_POWERED_BY_MARKER)) {
      next = next.replace(
        SPLASH_BRAND_IMAGE_MARKER,
        `${SPLASH_BRAND_IMAGE_MARKER}\n${SPLASH_POWERED_BY_MARKER}`,
      );
    }
  }

  if (next === original) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

function upgradeSplashBackgroundMatch(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = original
    .replaceAll(
      'splashBrandImage ? "bg-black text-white"',
      `splashBrandImage ? "bg-[${DEFAULT_SPLASH_BACKGROUND}] text-white"`,
    )
    .replaceAll(
      'splashBrandImage ? "bg-black text-white" : "bg-[#FF5800] text-white"',
      `splashBrandImage ? "bg-[${DEFAULT_SPLASH_BACKGROUND}] text-white" : "bg-[#FF5800] text-white"`,
    );

  if (next === original) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

export function applySplashBrandingPatches(repoRoot, logPrefix) {
  const targets = collectBrandingPatchTargets(repoRoot);
  let patched = 0;

  for (const filePath of targets.brandingConfigs) {
    if (patchBrandingConfigFile(filePath)) {
      patched += 1;
      console.log(`${logPrefix} patched ${path.relative(repoRoot, filePath)}`);
    }
  }

  for (const filePath of targets.appCoreStartupShells) {
    if (patchAppCoreStartupShell(filePath)) {
      patched += 1;
      console.log(`${logPrefix} patched ${path.relative(repoRoot, filePath)}`);
      continue;
    }
    if (upgradeSplashBackgroundMatch(filePath)) {
      patched += 1;
      console.log(
        `${logPrefix} matched splash background in ${path.relative(repoRoot, filePath)}`,
      );
    }
    if (upgradeSplashPoweredByMark(filePath)) {
      patched += 1;
      console.log(
        `${logPrefix} added splash powered-by in ${path.relative(repoRoot, filePath)}`,
      );
    }
  }

  for (const filePath of targets.uiStartupShells) {
    if (filePath.endsWith(".tsx")) {
      if (patchUiStartupShell(filePath)) {
        patched += 1;
        console.log(
          `${logPrefix} patched ${path.relative(repoRoot, filePath)}`,
        );
        continue;
      }
      if (upgradeSplashBackgroundMatch(filePath)) {
        patched += 1;
        console.log(
          `${logPrefix} matched splash background in ${path.relative(repoRoot, filePath)}`,
        );
      }
      continue;
    }
    if (patchUiStartupShellJs(filePath)) {
      patched += 1;
      console.log(`${logPrefix} patched ${path.relative(repoRoot, filePath)}`);
    }
  }

  return patched;
}
