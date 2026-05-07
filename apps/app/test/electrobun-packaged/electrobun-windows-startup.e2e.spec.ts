import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startLiveApiServer, type TestApiServer } from "./live-api";
import {
  PackagedDesktopHarness,
  resolvePackagedLauncher,
} from "./packaged-app-helpers";
import {
  getPackagedRendererBootstrapProbeScript,
  hasPackagedRendererBootstrapRequests,
  isPackagedRendererBootstrapProbeReady,
  type PackagedRendererBootstrapProbe,
} from "./windows-bootstrap";

const windowsTest = process.platform === "win32" ? test : null;

windowsTest?.(
  "packaged Windows app bootstraps the renderer against the external API override",
  async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "milady-win-e2e-"),
    );
    const extractDir = path.join(tempRoot, "extract");
    const launcherPath = await resolvePackagedLauncher(extractDir);
    expect(launcherPath, "Windows packaged launcher is required.").toBeTruthy();

    let api: TestApiServer | null = null;
    let harness: PackagedDesktopHarness | null = null;

    try {
      api = await startLiveApiServer({ onboardingComplete: true, port: 0 });
      harness = new PackagedDesktopHarness({
        tempRoot,
        launcherPath: launcherPath as string,
        apiBase: api.baseUrl,
      });

      await harness.start();

      let lastProbe: PackagedRendererBootstrapProbe | null = null;
      try {
        await expect
          .poll(
            async () => {
              lastProbe = await harness.eval<PackagedRendererBootstrapProbe>(
                getPackagedRendererBootstrapProbeScript(),
              );
              return (
                isPackagedRendererBootstrapProbeReady(
                  lastProbe,
                  api?.baseUrl ?? "",
                ) && hasPackagedRendererBootstrapRequests(api?.requests ?? [])
              );
            },
            {
              timeout: process.env.CI ? 180_000 : 90_000,
              message:
                "Expected the packaged Windows renderer to reach the external API bootstrap requests",
            },
          )
          .toBe(true);
      } catch (error) {
        throw new Error(
          [
            "Expected the packaged Windows renderer to reach the external API bootstrap requests",
            `Last renderer probe: ${JSON.stringify(lastProbe)}`,
            `Observed API requests: ${JSON.stringify(api?.requests ?? [])}`,
            error instanceof Error ? error.message : String(error),
          ].join("\n"),
        );
      }

      expect(api.requests.length).toBeGreaterThan(0);
      expect(
        `${harness.logs?.stdout.join("") ?? ""}\n${harness.logs?.stderr.join("") ?? ""}`,
      ).not.toMatch(
        /Fatal error during startup|startup failure|Cannot find module/i,
      );
    } finally {
      await harness?.stop().catch(() => undefined);
      await api?.close().catch(() => undefined);
      await fs
        .rm(tempRoot, { recursive: true, force: true })
        .catch(() => undefined);
    }
  },
);
