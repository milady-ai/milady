import { describe, expect, it } from "vitest";
import { resolveCharacterGreetingAnimation } from "./character-greeting";

describe("resolveCharacterGreetingAnimation", () => {
  it("prefers the explicit character greeting animation when present", () => {
    expect(
      resolveCharacterGreetingAnimation({
        avatarIndex: 1,
        greetingAnimation: "/animations/greetings/custom.fbx.gz",
      }),
    ).toBe("animations/greetings/custom.fbx.gz");
  });

  it("resolves the preset-specific greeting animation by avatar index", () => {
    expect(
      resolveCharacterGreetingAnimation({
        avatarIndex: 2,
      }),
    ).toBe("animations/greetings/greeting2.fbx.gz");
  });

  it("does not fall back to the generic salute for custom avatars", () => {
    expect(
      resolveCharacterGreetingAnimation({
        avatarIndex: 0,
      }),
    ).toBeNull();
  });
});
