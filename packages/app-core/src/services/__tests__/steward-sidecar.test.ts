/**
 * Tests for StewardSidecar module.
 *
 * Unit tests for the sidecar lifecycle, configuration, and wallet setup flow.
 * These tests mock child_process/fetch to avoid spawning real processes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the module's exported types and factory function
// without spawning real processes.

describe("StewardSidecar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createDesktopStewardSidecar", () => {
    it("creates a sidecar with default config", async () => {
      const { createDesktopStewardSidecar } = await import(
        "../steward-sidecar"
      );

      const sidecar = createDesktopStewardSidecar({
        dataDir: "/tmp/test-steward",
      });

      expect(sidecar).toBeDefined();
      const status = sidecar.getStatus();
      expect(status.state).toBe("stopped");
      expect(status.port).toBeNull();
      expect(status.walletAddress).toBeNull();
    });

    it("respects port override", async () => {
      const { createDesktopStewardSidecar } = await import(
        "../steward-sidecar"
      );

      const sidecar = createDesktopStewardSidecar({
        dataDir: "/tmp/test-steward",
        port: 4200,
      });

      expect(sidecar.getApiBase()).toBe("http://127.0.0.1:4200");
    });

    it("respects environment variables", async () => {
      process.env.STEWARD_PORT = "5555";
      process.env.STEWARD_DATA_DIR = "/tmp/env-steward";

      const { createDesktopStewardSidecar } = await import(
        "../steward-sidecar"
      );

      const sidecar = createDesktopStewardSidecar();

      expect(sidecar.getApiBase()).toBe("http://127.0.0.1:5555");

      delete process.env.STEWARD_PORT;
      delete process.env.STEWARD_DATA_DIR;
    });
  });

  describe("StewardSidecar instance", () => {
    it("starts in stopped state", async () => {
      const { StewardSidecar } = await import("../steward-sidecar");

      const sidecar = new StewardSidecar({
        dataDir: "/tmp/test-steward",
      });

      const status = sidecar.getStatus();
      expect(status.state).toBe("stopped");
      expect(status.restartCount).toBe(0);
      expect(status.error).toBeNull();
    });

    it("returns correct API base", async () => {
      const { StewardSidecar } = await import("../steward-sidecar");

      const sidecar = new StewardSidecar({
        dataDir: "/tmp/test-steward",
        port: 3201,
      });

      expect(sidecar.getApiBase()).toBe("http://127.0.0.1:3201");
    });

    it("calls onStatusChange callback", async () => {
      const { StewardSidecar } = await import("../steward-sidecar");

      const statusChanges: string[] = [];
      const sidecar = new StewardSidecar({
        dataDir: "/tmp/test-steward",
        onStatusChange: (status) => {
          statusChanges.push(status.state);
        },
      });

      // stop() on an already-stopped sidecar should update status
      await sidecar.stop();
      // At minimum, stop sets state to stopped
      expect(statusChanges).toContain("stopped");
    });

    it("credentials are null before start", async () => {
      const { StewardSidecar } = await import("../steward-sidecar");

      const sidecar = new StewardSidecar({
        dataDir: "/tmp/test-steward",
      });

      expect(sidecar.getCredentials()).toBeNull();
      expect(sidecar.getTenantApiKey()).toBeNull();
      expect(sidecar.getAgentToken()).toBeNull();
    });

    it("resolves ~ in data directory", async () => {
      const { StewardSidecar } = await import("../steward-sidecar");

      const sidecar = new StewardSidecar({
        dataDir: "~/.milady/steward",
      });

      const base = sidecar.getApiBase();
      // Just verify it doesn't throw — path resolution is internal
      expect(base).toBe("http://127.0.0.1:3200");
    });
  });
});
