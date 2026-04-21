import { describe, expect, it } from "vitest";
import {
  MILADY_DESKTOP_MUSIC_GUILD_ID,
  buildMusicPlayerPaths,
  getWebMusicGuildIdFromRoomId,
} from "./useMusicPlayer";

describe("useMusicPlayer helpers", () => {
  it("buildMusicPlayerPaths encodes guild id", () => {
    const p = buildMusicPlayerPaths("test guild");
    expect(p.stream).toContain("guildId=test%20guild");
    expect(p.nowPlaying).toContain("guildId=test%20guild");
    expect(p.queue).toContain("guildId=test%20guild");
  });

  it("exports stable default guild id", () => {
    expect(MILADY_DESKTOP_MUSIC_GUILD_ID).toBe("milady-desktop");
  });

  it("getWebMusicGuildIdFromRoomId prefixes web- and falls back", () => {
    expect(getWebMusicGuildIdFromRoomId(null)).toBe("milady-desktop");
    expect(getWebMusicGuildIdFromRoomId("")).toBe("milady-desktop");
    expect(getWebMusicGuildIdFromRoomId("abc-123")).toBe("web-abc-123");
  });
});
