// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type {
  AppRunSummary,
  AppViewerAuthMessage,
} from "../../api/client-types-cloud";
import { DEFAULT_BOOT_CONFIG, setBootConfig } from "../../config/boot-config";
import {
  buildViewerSessionKey,
  resolveEmbeddedViewerUrl,
  resolvePostMessageTargetOrigin,
  resolveViewerReadyEventType,
  shouldUseEmbeddedAppViewer,
} from "./viewer-auth";

function createRun(viewer: AppRunSummary["viewer"]): AppRunSummary {
  return {
    runId: "run-1",
    appName: "@vendor/plugin-app",
    displayName: "Vendor App",
    pluginName: "@vendor/plugin-app",
    launchType: "connect",
    launchUrl: viewer?.url ?? null,
    viewer,
    session: null,
    status: "running",
    summary: null,
    startedAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-08T00:00:00.000Z",
    lastHeartbeatAt: null,
    supportsBackground: false,
    viewerAttachment: "embedded",
    health: {
      state: "healthy",
      message: null,
    },
  };
}

describe("viewer-auth", () => {
  it("resolves relative and absolute viewer origins correctly", () => {
    setBootConfig(DEFAULT_BOOT_CONFIG);
    window.history.replaceState({}, "", "/apps");

    expect(resolvePostMessageTargetOrigin("/apps/hyperscape")).toBe(
      window.location.origin,
    );
    expect(
      resolvePostMessageTargetOrigin(
        "https://hyperscape.example/viewer?mode=spectator#panel",
      ),
    ).toBe("https://hyperscape.example");
    expect(resolvePostMessageTargetOrigin("data:text/html,viewer")).toBe("*");
  });

  it("resolves local app viewer routes through the configured api base", () => {
    setBootConfig({
      ...DEFAULT_BOOT_CONFIG,
      apiBase: "http://127.0.0.1:31337",
    });

    expect(resolveEmbeddedViewerUrl("/api/apps/2004scape/viewer")).toBe(
      "http://127.0.0.1:31337/api/apps/2004scape/viewer",
    );
    expect(resolvePostMessageTargetOrigin("/api/apps/2004scape/viewer")).toBe(
      "http://127.0.0.1:31337",
    );
    expect(buildViewerSessionKey("/api/apps/2004scape/viewer", null)).toBe(
      "http://127.0.0.1:31337/api/apps/2004scape/viewer::null",
    );
  });

  it("derives viewer ready event names only from non-empty auth payload types", () => {
    const authPayload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token",
    };

    expect(resolveViewerReadyEventType(authPayload)).toBe("HYPERSCAPE_READY");
    expect(
      resolveViewerReadyEventType({ type: "APP_VIEWER_READY", authToken: "x" }),
    ).toBe("APP_VIEWER_READY");
    expect(resolveViewerReadyEventType({ type: "   " })).toBeNull();
    expect(resolveViewerReadyEventType(null)).toBeNull();
  });

  it("builds a stable viewer session key from viewer url and auth payload", () => {
    setBootConfig(DEFAULT_BOOT_CONFIG);
    const payload: AppViewerAuthMessage = {
      type: "HYPERSCAPE_AUTH",
      authToken: "token-1",
      followEntity: "char-123",
    };

    expect(buildViewerSessionKey("https://hyperscape.example", payload)).toBe(
      'https://hyperscape.example::{"type":"HYPERSCAPE_AUTH","authToken":"token-1","followEntity":"char-123"}',
    );
    expect(buildViewerSessionKey("https://hyperscape.example", null)).toBe(
      "https://hyperscape.example::null",
    );
  });

  it("treats only embedded-capable viewers as embedded app viewers", () => {
    expect(
      shouldUseEmbeddedAppViewer(
        createRun({ url: "https://hyperscape.example/viewer" }),
      ),
    ).toBe(false);

    expect(
      shouldUseEmbeddedAppViewer(
        createRun({
          url: "https://hyperscape.example/viewer",
          postMessageAuth: true,
        }),
      ),
    ).toBe(true);

    expect(
      shouldUseEmbeddedAppViewer(
        createRun({
          url: "https://hyperscape.example/viewer",
          embedParams: { embedded: " true " },
        }),
      ),
    ).toBe(true);

    expect(
      shouldUseEmbeddedAppViewer(
        createRun({
          url: "https://hyperscape.example/viewer",
          embedParams: { surface: "agent-control" },
        }),
      ),
    ).toBe(true);

    expect(shouldUseEmbeddedAppViewer(null)).toBe(false);
    expect(
      shouldUseEmbeddedAppViewer({
        ...createRun(null),
        viewer: { postMessageAuth: true } as unknown as AppRunSummary["viewer"],
      }),
    ).toBe(false);
  });
});
