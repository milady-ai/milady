import { describe, expect, test } from "vitest";
import type { Plugin } from "@elizaos/core";
import {
  auditPluginContextCoverage,
  auditRuntimeContextCoverage,
  hasContextAuditGaps,
} from "./context-audit";

describe("context audit", () => {
  test("classifies explicit, inherited, catalog, and fallback context coverage", () => {
    const plugins: Plugin[] = [
      {
        name: "explicit-plugin",
        actions: [{ name: "CUSTOM_EXPLICIT_ACTION", contexts: ["system"] }],
        providers: [{ name: "customExplicitProvider", contexts: ["knowledge"] }],
      },
      {
        name: "inherited-plugin",
        contexts: ["automation"],
        actions: [{ name: "CREATE_TRIGGER_TASK" }],
        providers: [{ name: "lifeops" }],
      },
      {
        name: "catalog-plugin",
        actions: [{ name: "SWAP_TOKEN" }],
        providers: [{ name: "walletBalance" }],
      },
      {
        name: "fallback-plugin",
        actions: [{ name: "UNKNOWN_ACTION" }],
        providers: [{ name: "unknownProvider" }],
      },
    ] as Plugin[];

    const audit = auditPluginContextCoverage(plugins);

    expect(audit.coverageBySource.actions.component).toBe(1);
    expect(audit.coverageBySource.actions.plugin).toBe(1);
    expect(audit.coverageBySource.actions.catalog).toBe(1);
    expect(audit.coverageBySource.actions.default).toBe(1);
    expect(audit.coverageBySource.providers.component).toBe(1);
    expect(audit.coverageBySource.providers.plugin).toBe(1);
    expect(audit.coverageBySource.providers.catalog).toBe(1);
    expect(audit.coverageBySource.providers.default).toBe(1);
    expect(audit.contextUsage.automation.actions).toBeGreaterThan(0);
    expect(audit.contextUsage.wallet.providers).toBeGreaterThan(0);
    expect(audit.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: "fallback-plugin",
          componentType: "action",
          componentName: "UNKNOWN_ACTION",
        }),
        expect.objectContaining({
          pluginName: "fallback-plugin",
          componentType: "provider",
          componentName: "unknownProvider",
        }),
      ]),
    );
    expect(hasContextAuditGaps(audit)).toBe(true);
  });

  test("audits runtime plugin arrays directly", () => {
    const audit = auditRuntimeContextCoverage({
      plugins: [
        {
          name: "runtime-plugin",
          actions: [{ name: "SET_USER_NAME" }],
          providers: [{ name: "userName" }],
        },
      ],
    } as never);

    expect(audit.pluginCount).toBe(1);
    expect(audit.gapCount).toBe(0);
    expect(audit.actions[0]).toMatchObject({
      componentName: "SET_USER_NAME",
      source: "catalog",
    });
  });
});
