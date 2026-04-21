import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRuntimePermissionState,
  mergeRuntimePermissionStates,
} from "../runtime-permissions";

describe("runtime permissions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the runtime-owned website blocking permission state", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "website-blocking",
        status: "not-determined",
        lastChecked: 1,
        canRequest: true,
        reason:
          "Milady can ask the OS for administrator/root approval whenever it needs to edit the system hosts file.",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRuntimePermissionState(3210, "website-blocking"),
    ).resolves.toMatchObject({
      id: "website-blocking",
      status: "not-determined",
      canRequest: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/api/permissions/website-blocking",
      { method: "GET" },
    );
  });

  it("merges runtime-owned permission state into the native permission snapshot", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        permission: {
          id: "website-blocking",
          status: "granted",
          lastChecked: 2,
          canRequest: false,
          reason:
            "Milady can edit the system hosts file directly on this machine.",
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const merged = await mergeRuntimePermissionStates(4321, {
      accessibility: {
        id: "accessibility",
        status: "denied",
        lastChecked: 1,
        canRequest: true,
      },
    });

    expect(merged).toMatchObject({
      accessibility: {
        id: "accessibility",
        status: "denied",
      },
      "website-blocking": {
        id: "website-blocking",
        status: "granted",
        canRequest: false,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the runtime permission fetch fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRuntimePermissionState(5555, "website-blocking"),
    ).resolves.toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "Failed to fetch runtime permission state for website-blocking",
      ),
    );
  });

  it("fills runtime-owned permissions with an explicit unavailable state when runtime fetch fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    const merged = await mergeRuntimePermissionStates(5556, {
      accessibility: {
        id: "accessibility",
        status: "granted",
        lastChecked: 1,
        canRequest: false,
      },
    });

    expect(merged["website-blocking"]).toMatchObject({
      id: "website-blocking",
      status: "denied",
      canRequest: false,
      reason: expect.stringContaining("runtime is unavailable"),
    });
    expect(warnMock).toHaveBeenCalled();
  });
});
