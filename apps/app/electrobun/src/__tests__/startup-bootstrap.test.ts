import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = path.resolve(import.meta.dirname, "..", "index.ts");
const CONFIG_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "electrobun.config.ts",
);
const BACKGROUND_NOTICE_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "background-notice.ts",
);

describe("Electrobun startup bootstrap", () => {
  it("logs a structured startup environment block", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("[Env] platform=");
    expect(source).toContain('import.meta.dir.replaceAll("\\\\", "/")');
  });

  it("creates the main window before wiring the application menu", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");
    const createWindowIndex = source.indexOf(
      "const mainWin = attachMainWindow(await createMainWindow());",
    );
    const menuIndex = source.indexOf(
      "setupApplicationMenu();",
      createWindowIndex,
    );

    expect(createWindowIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeGreaterThan(createWindowIndex);
  });

  it("validates the built preload before creating the BrowserWindow", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");
    const validateIndex = source.indexOf(
      "readResolvedPreloadScript(import.meta.dir)",
    );
    const browserWindowIndex = source.indexOf(
      "new BrowserWindow(",
      validateIndex,
    );

    expect(validateIndex).toBeGreaterThan(-1);
    expect(browserWindowIndex).toBeGreaterThan(validateIndex);
    expect(source).toContain(
      'console.error("[Main] Failed to read preload script:", err);',
    );
  });

  it("uses the packaged app icon for the main window and tray", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");
    const configSource = fs.readFileSync(CONFIG_PATH, "utf8");

    expect(source).toContain("function resolveDesktopAppIconPath()");
    expect(source).toContain("icon: resolveDesktopAppIconPath(),");
    expect(source).toContain('process.platform === "win32"');
    expect(source).toContain('"../assets/appIcon.ico"');
    expect(configSource).toContain(
      '"assets/appIcon.ico": "assets/appIcon.ico"',
    );
  });

  it("resolves the initial renderer API base from desktop runtime mode", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("resolveDesktopRuntimeMode");
    expect(source).toContain("resolveInitialApiBase");
  });

  it("resolves packaged renderer and preload assets from the app resource root", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("resolveRendererAssetDir(import.meta.dir)");
    expect(source).toContain("readResolvedPreloadScript(import.meta.dir)");
  });

  it("allows the packaged Windows bootstrap harness to override the main window partition", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("resolveMainWindowPartition(process.env)");
    expect(source).toContain("browserWindowOptions.partition");
  });

  it("guards embedded agent startup behind local runtime mode", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain('if (runtimeResolution.mode !== "local")');
    expect(source).toContain("[Main] Skipping embedded agent startup");
  });

  it("records machine-readable startup phases for packaged smoke", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain('recordStartupPhase("main_start"');
    expect(source).toContain('recordStartupPhase("window_ready"');
    expect(source).toContain('recordStartupPhase("autostart_requested"');
    expect(source).toContain("resolveStartupBundlePath");
  });
  it("prompts with startup crash report recovery instructions", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("maybePromptStartupCrashReport");
    expect(source).toContain("Share this report in Discord and ping @iono.");
    expect(source).toContain("App Version:");
    expect(source).toContain("Runtime:");
    expect(source).toContain("Startup Log Tail:");
    expect(source).toContain("Copy Report");
    expect(source).toContain("startup-crash-report-latest.md");
  });

  it("records machine-readable startup phases for packaged smoke", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain('recordStartupPhase("main_start"');
    expect(source).toContain('recordStartupPhase("window_ready"');
    expect(source).toContain('recordStartupPhase("autostart_requested"');
    expect(source).toContain("resolveStartupBundlePath");
  });

  it("does not load repo or ~/.eliza env files in packaged desktop builds", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain(
      'const isPackagedBuild = !normalizedModuleDir.includes("/src/");',
    );
    expect(source).toContain("if (isPackagedBuild) {");
    expect(source).toContain("return;");
    expect(source).toContain("MILADY_DESKTOP_API_BASE");
  });

  it("shows a one-time background notice when window closes to background", () => {
    const indexSource = fs.readFileSync(INDEX_PATH, "utf8");
    const noticeSource = fs.readFileSync(BACKGROUND_NOTICE_PATH, "utf8");

    // ensureBackgroundWindow should call showBackgroundRunNoticeOnce
    // without creating a new window (no replacementWindow.minimize)
    const bgFnStart = indexSource.indexOf(
      "async function ensureBackgroundWindow",
    );
    expect(bgFnStart).toBeGreaterThan(-1);
    const bgFnBody = indexSource.slice(bgFnStart, bgFnStart + 500);
    expect(bgFnBody).toContain("showBackgroundRunNoticeOnce");
    expect(bgFnBody).not.toContain("createMainWindow");

    expect(noticeSource).toContain(
      'export const BACKGROUND_NOTICE_TITLE = "Milady Is Still Running";',
    );
    expect(noticeSource).toContain(
      '"Milady can send notifications and will keep running in the background after you close the window."',
    );
  });
});
