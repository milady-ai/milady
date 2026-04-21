import { describe, expect, it } from "vitest";
import { matchPluginRoutePath } from "./runtime-plugin-routes.js";

describe("matchPluginRoutePath", () => {
  it("matches static segments", () => {
    expect(
      matchPluginRoutePath("/music-player/stream", "/music-player/stream"),
    ).toEqual({});
  });

  it("rejects length mismatch", () => {
    expect(
      matchPluginRoutePath(
        "/music-player/stream",
        "/music-player/stream/extra",
      ),
    ).toBeNull();
  });

  it("captures :param segments", () => {
    expect(
      matchPluginRoutePath(
        "/music-player/stream/:guildId",
        "/music-player/stream/foo%20bar",
      ),
    ).toEqual({ guildId: "foo bar" });
  });

  it("matches multi-param routes", () => {
    expect(matchPluginRoutePath("/a/:x/b/:y", "/a/1/b/2")).toEqual({
      x: "1",
      y: "2",
    });
  });
});
