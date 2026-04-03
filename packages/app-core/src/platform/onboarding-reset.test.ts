// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { applyForceFreshOnboardingReset } from "./onboarding-reset";

describe("applyForceFreshOnboardingReset", () => {
  it("clears both active-server and legacy connection persistence", () => {
    localStorage.setItem(
      "milady:active-server",
      JSON.stringify({
        id: "remote:https://ren.example.com",
        kind: "remote",
        label: "ren.example.com",
        apiBase: "https://ren.example.com",
      }),
    );
    localStorage.setItem(
      "eliza:connection-mode",
      JSON.stringify({ runMode: "local" }),
    );
    localStorage.setItem("eliza:onboarding:step", "providers");
    sessionStorage.setItem("milady_api_base", "https://stale.remote.example");

    const url = new URL("https://app.milady.ai/?reset=1");
    const history = { replaceState: () => {} };

    expect(
      applyForceFreshOnboardingReset({
        url,
        history,
        storage: localStorage,
      }),
    ).toBe(true);

    expect(localStorage.getItem("milady:active-server")).toBeNull();
    expect(localStorage.getItem("eliza:connection-mode")).toBeNull();
    expect(localStorage.getItem("eliza:onboarding:step")).toBeNull();
    expect(sessionStorage.getItem("milady_api_base")).toBeNull();
    expect(localStorage.getItem("milady:onboarding:force-fresh")).toBe("1");
    expect(url.searchParams.has("reset")).toBe(false);
  });
});
