import { describe, expect, it } from "vitest";
import { tryHandleMusicPlayerStatusFallback } from "./music-player-route-fallback";

function createResponseRecorder() {
  return {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: "",
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    },
    end(payload?: string) {
      this.body = payload ?? "";
    },
  };
}

describe("tryHandleMusicPlayerStatusFallback", () => {
  it("ignores unrelated routes", () => {
    const res = createResponseRecorder();

    const handled = tryHandleMusicPlayerStatusFallback({
      pathname: "/api/status",
      method: "GET",
      runtime: null,
      res: res as never,
    });

    expect(handled).toBe(false);
    expect(res.body).toBe("");
  });

  it("returns a stable payload when music-player is not enabled", () => {
    const res = createResponseRecorder();

    const handled = tryHandleMusicPlayerStatusFallback({
      pathname: "/music-player/status",
      method: "GET",
      runtime: { getService: () => null } as never,
      res: res as never,
    });

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      available: false,
      error: "Music player plugin is not enabled",
    });
  });

  it("returns the active track when one exists", () => {
    const res = createResponseRecorder();

    const handled = tryHandleMusicPlayerStatusFallback({
      pathname: "/music-player/status",
      method: "GET",
      runtime: {
        getService: () => ({
          getQueues: () => new Map([["guild-1", {}]]),
          getCurrentTrack: () => ({
            id: "track-1",
            title: "A Song",
            url: "https://example.com/song.mp3",
            duration: 123,
          }),
          getIsPaused: () => false,
        }),
      } as never,
      res: res as never,
    });

    expect(handled).toBe(true);
    expect(JSON.parse(res.body)).toEqual({
      available: true,
      guildId: "guild-1",
      track: {
        id: "track-1",
        title: "A Song",
        url: "https://example.com/song.mp3",
        duration: 123,
      },
      isPaused: false,
      streamUrl: "/music-player/stream?guildId=guild-1",
    });
  });
});
