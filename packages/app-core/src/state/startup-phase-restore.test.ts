import { describe, expect, it } from "vitest";

import { deriveSessionConnectionMode } from "./startup-phase-restore";

describe("deriveSessionConnectionMode", () => {
  it("returns null when there is no explicit session api base", () => {
    expect(
      deriveSessionConnectionMode({
        sessionApiBase: "",
        sessionApiToken: null,
      }),
    ).toBeNull();
  });

  it("normalizes an explicit session api base into a remote restore target", () => {
    expect(
      deriveSessionConnectionMode({
        sessionApiBase: "https://remote.example/api/",
        sessionApiToken: "remote-token",
      }),
    ).toEqual({
      runMode: "remote",
      remoteApiBase: "https://remote.example/api",
      remoteAccessToken: "remote-token",
    });
  });
});
