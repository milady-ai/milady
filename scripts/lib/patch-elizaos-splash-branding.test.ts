import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_FRAMEWORK_NAME,
  patchAppCoreStartupShell,
  patchBrandingConfigFile,
  patchUiStartupShell,
  SPLASH_BRANDING_PATCH_MARKER,
} from "./patch-elizaos-splash-branding.mjs";

describe("patch-elizaos-splash-branding", () => {
  it("adds frameworkName to BrandingConfig", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-branding-"));
    const filePath = path.join(dir, "branding.ts");
    fs.writeFileSync(
      filePath,
      `export interface BrandingConfig {
  appName: string;
    cloudOnly?: boolean;
}
`,
    );

    expect(patchBrandingConfigFile(filePath)).toBe(true);
    const next = fs.readFileSync(filePath, "utf8");
    expect(next).toContain("frameworkName?: string");
    expect(patchBrandingConfigFile(filePath)).toBe(false);
  });

  it("replaces hardcoded elizaOS in ui StartupShell", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-ui-splash-"));
    const filePath = path.join(dir, "StartupShell.tsx");
    fs.writeFileSync(
      filePath,
      `import type { StartupShellProps } from "./startup-shell-types";

function StartupLoading(props: { phase: string; status: string }) {
  return (
    <div>
          <span className="text-4xl font-medium leading-none tracking-normal">
            elizaOS
          </span>
    </div>
  );
}
`,
    );

    expect(patchUiStartupShell(filePath)).toBe(true);
    const next = fs.readFileSync(filePath, "utf8");
    expect(next).toContain(SPLASH_BRANDING_PATCH_MARKER);
    expect(next).toContain("{appName}");
    expect(next).toContain(`powered by {frameworkName}`);
    expect(next).not.toContain(">elizaOS<");
    expect(patchUiStartupShell(filePath)).toBe(false);
  });

  it("injects splash branding into app-core StartupShell", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-core-splash-"));
    const filePath = path.join(dir, "StartupShell.js");
    fs.writeFileSync(
      filePath,
      `import { useApp } from "../../state";
const FONT = "monospace";
export function StartupShell() {
    const { startupCoordinator, startupError, onboardingCloudProvisionedContainer, retryStartup, setActionNotice, setState, t, } = useApp();
    return (_jsxs("div", { children: [_jsx("div", { className: "relative z-10 flex flex-col items-center gap-5 px-6 text-center w-full", style: { maxWidth: 360 }, children: _jsxs("div", { className: "w-full mt-2", children: [_jsx("div", { className: "h-5 w-full border-2 border-black/70 bg-black/5 overflow-hidden" })] }) })] }));
}
`,
    );

    expect(patchAppCoreStartupShell(filePath)).toBe(true);
    const next = fs.readFileSync(filePath, "utf8");
    expect(next).toContain("SplashBrandingTitle");
    expect(next).toContain(DEFAULT_FRAMEWORK_NAME);
    expect(patchAppCoreStartupShell(filePath)).toBe(false);
  });
});
