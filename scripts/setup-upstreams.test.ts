import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMiladyCopyPatches } from "./setup-upstreams.mjs";

const tempDirs: string[] = [];
const LEGACY_COPY =
  "Sent through the connected {{source}} account on this Mac.";
const DEVICE_COPY =
  "Sent through the connected {{source}} account on this device.";

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-setup-upstreams-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("applyMiladyCopyPatches", () => {
  it("rewrites legacy inbox hint copy across target files", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );

    writeFile(chatViewPath, `copy: "${LEGACY_COPY}"`);
    writeFile(localePath, `{"reply_hint":"${LEGACY_COPY}"}`);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(2);
    expect(fs.readFileSync(chatViewPath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(chatViewPath, "utf8")).not.toContain(LEGACY_COPY);
    expect(fs.readFileSync(localePath, "utf8")).toContain(DEVICE_COPY);
    expect(fs.readFileSync(localePath, "utf8")).not.toContain(LEGACY_COPY);
  });

  it("is idempotent after replacement", () => {
    const elizaRoot = makeTempDir();
    const chatViewPath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "components",
      "pages",
      "ChatView.tsx",
    );

    writeFile(chatViewPath, DEVICE_COPY);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(fs.readFileSync(chatViewPath, "utf8")).toBe(DEVICE_COPY);
  });

  it("warns when target files exist but legacy string is missing", () => {
    const elizaRoot = makeTempDir();
    const localePath = path.join(
      elizaRoot,
      "packages",
      "app-core",
      "src",
      "i18n",
      "locales",
      "en.json",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeFile(localePath, `{"reply_hint":"${DEVICE_COPY}"}`);

    expect(applyMiladyCopyPatches(elizaRoot)).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      "[setup-upstreams] WARNING: inbox reply hint legacy string not found — patch may need updating",
    );

    warnSpy.mockRestore();
  });
});
