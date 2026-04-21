import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPluginInfo } from "./registry-client-types.js";

const readFileMock = vi.fn();
const readdirMock = vi.fn();
const realpathMock = vi.fn();
const debugMock = vi.fn();
const resolveStateDirMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: readFileMock,
    readdir: readdirMock,
    realpath: realpathMock,
  },
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    debug: debugMock,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir: resolveStateDirMock,
}));

function makeDirent(name: string): {
  name: string;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
} {
  return {
    name,
    isDirectory: () => true,
    isSymbolicLink: () => false,
  };
}

function makeFsError(code: string, message = code): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("registry-client-local", () => {
  const workspaceRoot = path.join(path.sep, "workspace");
  const pluginsDir = path.join(workspaceRoot, "plugins");
  const appDir = path.join(pluginsDir, "app-demo");
  const installedDir = path.join(path.sep, "state", "plugins", "installed");

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.ELIZA_WORKSPACE_ROOT = workspaceRoot;
    resolveStateDirMock.mockReturnValue(path.join(path.sep, "state"));
    realpathMock.mockImplementation(async (value: string) => value);
    readFileMock.mockRejectedValue(makeFsError("ENOENT"));
    readdirMock.mockImplementation(async (dirPath: string) => {
      if (dirPath === workspaceRoot) return [];
      if (dirPath === installedDir) throw makeFsError("ENOENT");
      throw makeFsError("ENOENT");
    });
  });

  it("skips debug logging for missing optional workspace scan roots", async () => {
    readdirMock.mockImplementation(async (dirPath: string) => {
      if (dirPath === workspaceRoot) return [];
      if (dirPath === pluginsDir) return [makeDirent("app-demo")];
      if (dirPath === installedDir) throw makeFsError("ENOENT");
      throw makeFsError("ENOENT");
    });

    readFileMock.mockImplementation(async (filePath: string) => {
      if (filePath === path.join(appDir, "package.json")) {
        return JSON.stringify({
          name: "@elizaos/app-demo",
          version: "1.0.0",
          elizaos: { kind: "app" },
        });
      }
      throw makeFsError("ENOENT");
    });

    const { applyLocalWorkspaceApps } = await import(
      "./registry-client-local.js"
    );
    const plugins = new Map<string, RegistryPluginInfo>();

    await applyLocalWorkspaceApps(plugins);

    expect(plugins.get("@elizaos/app-demo")?.localPath).toBe(appDir);
    expect(debugMock).not.toHaveBeenCalled();
  });

  it("still logs unexpected filesystem failures during workspace scans", async () => {
    readdirMock.mockImplementation(async (dirPath: string) => {
      if (dirPath === workspaceRoot) return [];
      if (dirPath === pluginsDir) {
        throw makeFsError("EACCES", "permission denied");
      }
      if (dirPath === installedDir) throw makeFsError("ENOENT");
      throw makeFsError("ENOENT");
    });

    const { applyLocalWorkspaceApps } = await import(
      "./registry-client-local.js"
    );

    await applyLocalWorkspaceApps(new Map());

    expect(debugMock).toHaveBeenCalledTimes(1);
    expect(debugMock).toHaveBeenCalledWith(
      expect.stringContaining(`could not read workspace dir ${pluginsDir}`),
    );
  });
});
