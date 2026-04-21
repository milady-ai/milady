import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itIf } from "../../../../test/helpers/conditional-tests.ts";

const registryClientMocks = vi.hoisted(() => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../../src/services/registry-client.js", () => registryClientMocks);

import {
  importAppPlugin,
  importAppRouteModule,
} from "../../src/services/app-package-modules";

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

const hyperscapePluginPackageJsonUrl = new URL(
  "../../../../../hyperscape/packages/plugin-hyperscape/package.json",
  import.meta.url,
);
const hasWorkspaceHyperscapePlugin = fs.existsSync(
  hyperscapePluginPackageJsonUrl,
);

describe("app-package-modules", () => {
  const tempDirs: string[] = [];
  const initialCwd = process.cwd();

  afterEach(() => {
    vi.clearAllMocks();
    process.chdir(initialCwd);
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back to the built app plugin when the local source entry cannot load", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-plugin-load-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "src", "index.ts"),
      'throw new Error("source entry should be skipped");\n',
    );
    writeFile(
      path.join(tempDir, "dist", "index.js"),
      [
        "class HyperscapeService {}",
        'HyperscapeService.serviceType = "hyperscapeService";',
        "export default {",
        '  name: "@elizaos/app-test-fallback",',
        "  services: [HyperscapeService],",
        "};",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      localPath: tempDir,
    });

    const plugin = await importAppPlugin("@elizaos/app-test-fallback");

    expect(plugin?.name).toBe("@elizaos/app-test-fallback");
    expect(plugin?.services?.[0]?.serviceType).toBe("hyperscapeService");
  });

  it("falls back to the built route module when the local source route cannot load", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-route-load-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "src", "routes.ts"),
      'throw new Error("source routes should be skipped");\n',
    );
    writeFile(
      path.join(tempDir, "dist", "routes.js"),
      [
        "export async function handleAppRoutes() {",
        "  return true;",
        "}",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      localPath: tempDir,
    });

    const routeModule = await importAppRouteModule("test-fallback");

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(true);
  });

  it("resolves registry-backed bare slugs to plugin app route modules", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-app-route-"));
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "dist", "routes.js"),
      [
        "export async function handleAppRoutes() {",
        "  return true;",
        "}",
        "",
      ].join("\n"),
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      name: "@elizaos/plugin-test-route-app",
      kind: "app",
      localPath: tempDir,
    });

    const routeModule = await importAppRouteModule("test-route-app");

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(true);
  });

  it("prefers workspace-local bridge exports before consulting the registry", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-local-first-"));
    tempDirs.push(tempDir);

    const workspaceRoot = path.join(tempDir, "workspace");
    const repoRoot = path.join(workspaceRoot, "milady");
    fs.mkdirSync(repoRoot, { recursive: true });
    process.chdir(repoRoot);

    const localAppDir = path.join(
      workspaceRoot,
      "plugins",
      "plugin-hyperscape",
    );
    writeFile(
      path.join(localAppDir, "package.json"),
      JSON.stringify(
        {
          name: "@hyperscape/plugin-hyperscape",
          type: "module",
          elizaos: {
            app: {
              displayName: "Hyperscape",
              bridgeExport: "./custom/bridge",
            },
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(localAppDir, "custom", "bridge.ts"),
      [
        "export async function handleAppRoutes() {",
        "  return 'workspace-bridge';",
        "}",
        "",
      ].join("\n"),
    );
    writeFile(
      path.join(localAppDir, "src", "app.ts"),
      'throw new Error("canonical app entry should not load when bridgeExport is declared");\n',
    );
    writeFile(
      path.join(localAppDir, "src", "routes.ts"),
      'throw new Error("legacy routes entry should not load when bridgeExport is declared");\n',
    );

    registryClientMocks.getPluginInfo.mockRejectedValue(
      new Error("registry should not be consulted"),
    );

    const routeModule = await importAppRouteModule(
      "@hyperscape/plugin-hyperscape",
    );

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(
      "workspace-bridge",
    );
    expect(registryClientMocks.getPluginInfo).not.toHaveBeenCalled();
  });

  it("loads a declared bridge export before legacy app or routes entrypoints", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "app-bridge-export-"),
    );
    tempDirs.push(tempDir);

    writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "@vendor/plugin-bridge-export",
          type: "module",
          elizaos: {
            app: {
              displayName: "Bridge Export App",
              bridgeExport: "./app",
            },
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(tempDir, "src", "app.ts"),
      [
        "export async function handleAppRoutes() {",
        "  return 'bridge-export';",
        "}",
        "",
      ].join("\n"),
    );
    writeFile(
      path.join(tempDir, "src", "routes.ts"),
      'throw new Error("legacy routes entry should not load");\n',
    );

    registryClientMocks.getPluginInfo.mockResolvedValue({
      name: "@vendor/plugin-bridge-export",
      kind: "app",
      localPath: tempDir,
      appMeta: {
        displayName: "Bridge Export App",
        bridgeExport: "./app",
      },
    });

    const routeModule = await importAppRouteModule(
      "@vendor/plugin-bridge-export",
    );

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(
      "bridge-export",
    );
  });

  it("loads a workspace-local bridge export declared only in elizaos.plugin.json", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "app-manifest-bridge-"),
    );
    tempDirs.push(tempDir);

    const workspaceRoot = path.join(tempDir, "workspace");
    const repoRoot = path.join(workspaceRoot, "milady");
    fs.mkdirSync(repoRoot, { recursive: true });
    process.chdir(repoRoot);

    const localAppDir = path.join(
      workspaceRoot,
      "plugins",
      "plugin-manifest-app",
    );
    writeFile(
      path.join(localAppDir, "package.json"),
      JSON.stringify(
        {
          name: "@vendor/plugin-manifest-app",
          type: "module",
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(localAppDir, "elizaos.plugin.json"),
      JSON.stringify(
        {
          app: {
            displayName: "Manifest Bridge App",
            bridgeExport: "./bridge-entry",
          },
        },
        null,
        2,
      ),
    );
    writeFile(
      path.join(localAppDir, "bridge-entry.ts"),
      [
        "export async function handleAppRoutes() {",
        "  return 'manifest-bridge';",
        "}",
        "",
      ].join("\n"),
    );
    writeFile(
      path.join(localAppDir, "src", "app.ts"),
      'throw new Error("canonical app entry should not load when manifest bridgeExport is declared");\n',
    );

    registryClientMocks.getPluginInfo.mockRejectedValue(
      new Error("registry should not be consulted"),
    );

    const routeModule = await importAppRouteModule(
      "@vendor/plugin-manifest-app",
    );

    expect(routeModule).not.toBeNull();
    await expect(routeModule?.handleAppRoutes?.({})).resolves.toBe(
      "manifest-bridge",
    );
    expect(registryClientMocks.getPluginInfo).not.toHaveBeenCalled();
  });

  it("loads the built-in 2004scape route module without registry metadata", async () => {
    registryClientMocks.getPluginInfo.mockResolvedValue(null);

    const routeModule = await importAppRouteModule("@elizaos/app-2004scape");
    const slugRouteModule = await importAppRouteModule("2004scape");

    expect(routeModule).not.toBeNull();
    expect(slugRouteModule).not.toBeNull();
    expect(typeof routeModule?.resolveLaunchSession).toBe("function");
    expect(typeof routeModule?.refreshRunSession).toBe("function");
    expect(typeof routeModule?.handleAppRoutes).toBe("function");
  });

  itIf(hasWorkspaceHyperscapePlugin)(
    "loads the real sibling Hyperscape bridge from the workspace without registry help",
    async () => {
      process.chdir(initialCwd);

      registryClientMocks.getPluginInfo.mockRejectedValue(
        new Error("registry should not be consulted"),
      );

      const plugin = await importAppPlugin("@hyperscape/plugin-hyperscape");
      const routeModule = await importAppRouteModule(
        "@hyperscape/plugin-hyperscape",
      );

      expect(plugin?.name).toBe("@hyperscape/plugin-hyperscape");
      expect(routeModule).not.toBeNull();
      expect(typeof plugin?.appBridge?.resolveLaunchSession).toBe("function");
      expect(typeof routeModule?.prepareLaunch).toBe("function");
      expect(typeof routeModule?.resolveViewerAuthMessage).toBe("function");
      expect(typeof routeModule?.resolveLaunchSession).toBe("function");
      expect(typeof routeModule?.refreshRunSession).toBe("function");
      expect(registryClientMocks.getPluginInfo).not.toHaveBeenCalled();
    },
  );
});
