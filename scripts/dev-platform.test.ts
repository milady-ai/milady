import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(import.meta.dirname, "dev-platform.mjs");

describe("dev-platform.mjs", () => {
  it("points Electrobun at the sibling desktop dev API when it launches one", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("resolveDesktopApiPort(process.env)");
    expect(script).toContain("resolveDesktopUiPort(process.env)");
    expect(script).toContain("const apiPort = String(resolvedApiPort);");
    expect(script).toContain(
      "MILADY_DESKTOP_API_BASE: `http://127.0.0.1:$" + "{apiPort}`",
    );
    expect(script).toContain("MILADY_API_PORT: apiPort");
    expect(script).toContain("ELIZA_API_PORT: apiPort");
  });

  it("only injects the external desktop API base when the helper API is enabled", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("...(skipApi");
    expect(script).toContain("? {}");
  });

  it("bootstraps whisper assets for Electrobun voice input when desktop dev needs them", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("MILADY_DESKTOP_ENSURE_WHISPER");
    expect(script).toContain("desktopWhisperAssetsMissing()");
    expect(script).toContain('execSync("bun run build:whisper"');
    expect(script).toContain("ensureDesktopWhisperAssets();");
  });

  it("enables the macOS CEF workaround for desktop dev unless explicitly overridden", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("const desktopCefWorkaroundEnv");
    expect(script).toContain("process.env.MILADY_DESKTOP_FORCE_CEF?.trim()");
    expect(script).toContain('return "1";');
    expect(script).toContain(
      "MILADY_DESKTOP_FORCE_CEF: desktopCefWorkaroundEnv",
    );
  });

  it("reenables macOS native devtools in desktop dev unless explicitly overridden", () => {
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");

    expect(script).toContain("const desktopUnsafeDevtoolsEnv");
    expect(script).toContain(
      "process.env.MILADY_ALLOW_UNSAFE_NATIVE_DEVTOOLS?.trim()",
    );
    expect(script).toContain("MILADY_ALLOW_UNSAFE_NATIVE_DEVTOOLS:");
  });
});
