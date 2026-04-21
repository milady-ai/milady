import { describe, expect, it } from "vitest";
import { MESSAGES, UI_LANGUAGES } from "../messages";

describe("navigation translations", () => {
  it("includes nav.browser in every shipped language", () => {
    for (const language of UI_LANGUAGES) {
      expect(MESSAGES[language]["nav.browser"]).toBeTruthy();
    }
  });
});
