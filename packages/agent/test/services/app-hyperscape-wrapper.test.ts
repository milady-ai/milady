import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeIf } from "../../../../test/helpers/conditional-tests.ts";

const hyperscapePluginModuleUrl = new URL(
  "../../../../../hyperscape/packages/plugin-hyperscape/src/index.ts",
  import.meta.url,
);
const hasHyperscapePluginModule = existsSync(hyperscapePluginModuleUrl);
const hyperscapePluginModule = hasHyperscapePluginModule
  ? ((await import(hyperscapePluginModuleUrl.href)) as {
      hyperscapePlugin?: {
        app?: {
          displayName?: string;
          runtimePlugin?: string;
        };
        appBridge?: {
          handleAppRoutes?: unknown;
          prepareLaunch?: unknown;
          resolveViewerAuthMessage?: unknown;
          ensureRuntimeReady?: unknown;
          collectLaunchDiagnostics?: unknown;
          resolveLaunchSession?: unknown;
          refreshRunSession?: unknown;
        };
      };
    })
  : null;

describeIf(hasHyperscapePluginModule)("plugin-hyperscape app bridge", () => {
  it("exports app metadata and a host bridge from the runtime plugin", () => {
    const plugin = hyperscapePluginModule?.hyperscapePlugin;

    expect(plugin?.app?.displayName).toBe("Hyperscape");
    expect(plugin?.app?.runtimePlugin).toBe("@hyperscape/plugin-hyperscape");
    expect(typeof plugin?.appBridge?.handleAppRoutes).toBe("function");
    expect(typeof plugin?.appBridge?.prepareLaunch).toBe("function");
    expect(typeof plugin?.appBridge?.resolveViewerAuthMessage).toBe("function");
    expect(typeof plugin?.appBridge?.ensureRuntimeReady).toBe("function");
    expect(typeof plugin?.appBridge?.collectLaunchDiagnostics).toBe("function");
    expect(typeof plugin?.appBridge?.resolveLaunchSession).toBe("function");
    expect(typeof plugin?.appBridge?.refreshRunSession).toBe("function");
  });
});
