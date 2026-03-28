// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OnboardingStatusBanner } from "./onboarding-form-primitives";

describe("OnboardingStatusBanner", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders success banners without actions in the compact centered layout", () => {
    render(
      <OnboardingStatusBanner tone="success">
        <svg aria-hidden="true" />
        Connected
      </OnboardingStatusBanner>,
    );

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-onboarding-status-layout")).toBe(
      "compact",
    );

    const content = banner.querySelector("[data-onboarding-status-content]");
    expect(content).toBeTruthy();
    expect(content?.className).toContain("inline-flex");
    expect(content?.className).not.toContain("flex-1");
    expect(banner.querySelector("[data-onboarding-status-action]")).toBeNull();
  });

  it("keeps action-bearing neutral banners in the split layout", () => {
    render(
      <OnboardingStatusBanner
        tone="neutral"
        action={<button type="button">Open login page in browser</button>}
      >
        Open the login page in your browser to continue.
      </OnboardingStatusBanner>,
    );

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("data-onboarding-status-layout")).toBe("split");

    const content = banner.querySelector("[data-onboarding-status-content]");
    expect(content).toBeTruthy();
    expect(content?.className).toContain("flex-1");
    expect(
      banner.querySelector("[data-onboarding-status-action]"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open login page in browser" }),
    ).toBeTruthy();
  });
});
