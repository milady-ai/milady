// @vitest-environment jsdom
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { OnboardingPanel } from "./OnboardingPanel";

describe("OnboardingPanel", () => {
  it("anchors the panel to the right edge of the onboarding viewport", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <OnboardingPanel step="providers">
          <div>content</div>
        </OnboardingPanel>,
      );
    });

    const [outer, inner] = tree?.root.findAllByType("div") ?? [];
    expect(String(outer?.props.className)).toContain(
      "absolute right-0 top-0 bottom-0",
    );
    expect(String(inner?.props.className)).toContain("max-h-full");
    expect(String(inner?.props.className)).toContain(
      "bg-[var(--onboarding-panel-bg)]",
    );
    expect(String(inner?.props.className)).toContain(
      "var(--onboarding-panel-shadow)",
    );
  });
});
