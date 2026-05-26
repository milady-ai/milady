import { describe, expect, it } from "vitest";
import {
  hasPackagedRendererBootstrapRequests,
  isPackagedRendererBootstrapProbeReady,
  type PackagedRendererBootstrapProbe,
} from "./windows-bootstrap";

describe("windows packaged bootstrap probe", () => {
  it("requires the fresh first-run API status when requested", () => {
    const probe: PackagedRendererBootstrapProbe = {
      ok: true,
      apiBase: "http://127.0.0.1:31337",
      bootApiBase: "http://127.0.0.1:31337",
      legacyApiBase: null,
      status: 200,
      firstRunStatus: 200,
      firstRunComplete: false,
    };

    expect(
      isPackagedRendererBootstrapProbeReady(probe, "http://127.0.0.1:31337", {
        expectedFirstRunComplete: false,
      }),
    ).toBe(true);
    expect(
      isPackagedRendererBootstrapProbeReady(
        { ...probe, firstRunComplete: true },
        "http://127.0.0.1:31337",
        { expectedFirstRunComplete: false },
      ),
    ).toBe(false);
  });

  it("treats the first-run status request as a renderer bootstrap signal", () => {
    expect(
      hasPackagedRendererBootstrapRequests(["GET /api/first-run/status"]),
    ).toBe(true);
  });

  it("rejects main-process heartbeat requests as renderer bootstrap proof", () => {
    expect(hasPackagedRendererBootstrapRequests(["GET /api/triggers"])).toBe(
      false,
    );
    expect(
      hasPackagedRendererBootstrapRequests(["GET /api/stream/settings"]),
    ).toBe(false);
    expect(hasPackagedRendererBootstrapRequests(["GET /api/drop/status"])).toBe(
      false,
    );
  });
});
