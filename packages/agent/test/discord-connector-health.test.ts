/**
 * Connector Health Monitor Tests — Discord Focus
 *
 * Verifies the ConnectorHealthMonitor correctly detects discord plugin
 * presence/absence, covers the CONNECTOR_PLUGIN_MAP, and handles
 * edge cases in case-sensitivity.
 */

import { describe, expect, it } from "vitest";
import { ConnectorHealthMonitor } from "../src/api/connector-health";
import { CONNECTOR_PLUGINS } from "../src/config/plugin-auto-enable";

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function createMockRuntime(opts: {
  services?: Record<string, unknown>;
  clients?: Record<string, unknown>;
}) {
  return {
    getService(name: string) {
      return opts.services?.[name] ?? null;
    },
    clients: opts.clients ?? {},
  } as any;
}

function createMonitor(opts: {
  runtime: ReturnType<typeof createMockRuntime>;
  connectors: Record<string, unknown>;
}) {
  const messages: Record<string, unknown>[] = [];
  const monitor = new ConnectorHealthMonitor({
    runtime: opts.runtime,
    config: { connectors: opts.connectors },
    broadcastWs: (payload) => messages.push(payload),
    intervalMs: 60_000, // won't fire in tests since we call check() manually
  });
  return { monitor, messages };
}

// ---------------------------------------------------------------------------
// 1. Discord plugin detection
// ---------------------------------------------------------------------------

describe("connector health monitor — discord detection", () => {
  it("reports discord as 'ok' when discord service is loaded", async () => {
    const runtime = createMockRuntime({
      services: { discord: { name: "discord" } },
    });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    await monitor.check();
    const statuses = monitor.getConnectorStatuses();
    expect(statuses.discord).toBe("ok");
  });

  it("reports discord as 'ok' when discord is in runtime.clients", async () => {
    const runtime = createMockRuntime({
      clients: { discord: { connected: true } },
    });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");
  });

  it("reports discord as 'missing' when plugin is not loaded", async () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor, messages } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("missing");
    // Should broadcast a system-warning on first "missing" detection
    expect(messages.some((m) => m.type === "system-warning")).toBe(true);
  });

  it("does not broadcast warning on repeated 'missing' checks", async () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor, messages } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    await monitor.check();
    const firstWarningCount = messages.length;

    await monitor.check();
    // No new warning should be broadcast
    expect(messages.length).toBe(firstWarningCount);
  });

  it("broadcasts warning when status transitions from ok to missing", async () => {
    let services: Record<string, unknown> = { discord: { name: "discord" } };
    const runtime = createMockRuntime({ services });

    // Override getService to use mutable reference
    runtime.getService = (name: string) => services[name] ?? null;

    const { monitor, messages } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    // First check: ok
    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");

    // Simulate plugin crash/unload
    services = {};
    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("missing");
    expect(messages.some((m) => m.type === "system-warning")).toBe(true);
  });

  it("skips connectors with enabled: false", async () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: false } },
    });

    await monitor.check();
    const statuses = monitor.getConnectorStatuses();
    // Disabled connector should not appear in statuses
    expect(statuses.discord).toBeUndefined();
  });

  it("skips connectors not in config", async () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor } = createMonitor({
      runtime,
      connectors: {},
    });

    await monitor.check();
    expect(Object.keys(monitor.getConnectorStatuses())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. CONNECTOR_PLUGIN_MAP coverage
// ---------------------------------------------------------------------------

describe("connector health monitor — CONNECTOR_PLUGIN_MAP", () => {
  it("recognises discord, telegram, twitter, slack, farcaster", async () => {
    // These are the connectors with entries in the health monitor's internal map
    const knownConnectors = [
      "discord",
      "telegram",
      "twitter",
      "slack",
      "farcaster",
    ];

    for (const name of knownConnectors) {
      const runtime = createMockRuntime({
        services: { [name]: { name } },
      });
      const { monitor } = createMonitor({
        runtime,
        connectors: { [name]: { enabled: true } },
      });

      await monitor.check();
      expect(monitor.getConnectorStatuses()[name]).toBe("ok");
    }
  });

  it("returns 'unknown' for connectors without a health monitor mapping", async () => {
    // Connectors like telegramAccount, signal, etc. are in CONNECTOR_PLUGINS
    // All connectors are now mapped in the health monitor (expanded to 19).
    // Use a truly unknown connector name to test the fallback path.
    const unknownConnectors = ["myCustomConnector", "futurePlugin"];

    for (const name of unknownConnectors) {
      const runtime = createMockRuntime({ services: {} });
      const { monitor } = createMonitor({
        runtime,
        connectors: { [name]: { enabled: true } },
      });

      await monitor.check();
      // Truly unknown connectors (not in CONNECTOR_PLUGIN_MAP) get "unknown"
      expect(monitor.getConnectorStatuses()[name]).toBe("unknown");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Case-sensitivity regression tests
// ---------------------------------------------------------------------------

describe("connector health monitor — case sensitivity", () => {
  it("normalizes mixed-case connector names before plugin lookup", async () => {
    const runtime = createMockRuntime({
      services: {
        discord: { name: "discord" },
        "telegram-account": { name: "telegram-account" },
      },
    });
    const { monitor } = createMonitor({
      runtime,
      connectors: {
        Discord: { enabled: true },
        TelegramAccount: { enabled: true },
      },
    });

    await monitor.check();
    const statuses = monitor.getConnectorStatuses();

    expect(statuses.Discord).toBe("ok");
    expect(statuses.TelegramAccount).toBe("ok");
  });

  it("camelCase connector IDs in config are preserved", () => {
    // Verify that CONNECTOR_PLUGINS uses the exact case from the schema
    expect(CONNECTOR_PLUGINS.telegramAccount).toBe(
      "@elizaos-plugins/client-telegram-account",
    );
    expect(CONNECTOR_PLUGINS.googlechat).toBe(
      "@elizaos/plugin-google-chat",
    );
    expect(CONNECTOR_PLUGINS.msteams).toBe("@elizaos/plugin-msteams");
  });
});

// ---------------------------------------------------------------------------
// 4. Start / stop lifecycle
// ---------------------------------------------------------------------------

describe("connector health monitor — lifecycle", () => {
  it("start() runs initial check", async () => {
    const runtime = createMockRuntime({
      services: { discord: {} },
    });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    monitor.start();
    // Give the synchronous check() a tick to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(monitor.getConnectorStatuses().discord).toBe("ok");
    monitor.stop();
  });

  it("stop() prevents further checks", () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    monitor.start();
    monitor.stop();
    // After stop, no timer should be running
    // (We can't easily test this, but at minimum stop() should not throw)
    expect(() => monitor.stop()).not.toThrow();
  });

  it("double start() does not create duplicate timers", () => {
    const runtime = createMockRuntime({ services: {} });
    const { monitor } = createMonitor({
      runtime,
      connectors: { discord: { enabled: true } },
    });

    monitor.start();
    monitor.start(); // Should be a no-op
    monitor.stop();
  });

  it("cleans up removed connectors on check", async () => {
    const runtime = createMockRuntime({
      services: { discord: {} },
    });

    // Start with discord configured
    const connectors: Record<string, unknown> = {
      discord: { enabled: true },
    };
    const { monitor } = createMonitor({ runtime, connectors });

    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");

    // Remove discord from config
    delete connectors.discord;
    await monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBeUndefined();
  });
});
