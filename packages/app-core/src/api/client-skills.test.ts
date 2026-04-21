import { afterEach, describe, expect, it, vi } from "vitest";
import { MiladyClient } from "./client";

describe("MiladyClient plugin registry mutations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends release stream options for plugin installs", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({ ok: true } as never);
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.installRegistryPlugin("@elizaos/plugin-test", false, {
      stream: "alpha",
      version: "2.0.0-alpha.7",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/plugins/install",
      {
        method: "POST",
        body: JSON.stringify({
          name: "@elizaos/plugin-test",
          autoRestart: false,
          stream: "alpha",
          version: "2.0.0-alpha.7",
        }),
      },
      { timeoutMs: 120_000 },
    );
  });

  it("sends release stream options for plugin updates", async () => {
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({ ok: true } as never);
    const client = new MiladyClient("http://127.0.0.1:31337");

    await client.updateRegistryPlugin("@elizaos/plugin-test", false, {
      stream: "latest",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/plugins/update",
      {
        method: "POST",
        body: JSON.stringify({
          name: "@elizaos/plugin-test",
          autoRestart: false,
          stream: "latest",
        }),
      },
      { timeoutMs: 120_000 },
    );
  });
});
