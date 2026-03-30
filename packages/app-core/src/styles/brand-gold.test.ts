import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("brand-gold onboarding styles", () => {
  it("pins onboarding to the viewport and prevents page scroll", () => {
    const css = readFileSync(
      new URL("./brand-gold.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain(".onboarding-screen {");
    expect(css).toContain("position: fixed;");
    expect(css).toContain("inset: 0;");
    expect(css).toContain("height: 100dvh;");
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain("overscroll-behavior: none;");
  });

  it("forces dark onboarding panel variables inside the onboarding screen", () => {
    const css = readFileSync(
      new URL("./brand-gold.css", import.meta.url),
      "utf8",
    );

    expect(css).toContain("--onboarding-panel-bg: rgba(6, 7, 8, 0.6);");
    expect(css).toContain(
      "--onboarding-text-primary: rgba(240, 242, 245, 0.94);",
    );
    expect(css).toContain("--onboarding-text-stroke: rgba(4, 8, 14, 0.78);");
    expect(css).toContain("--onboarding-text-shadow-strong:");
    expect(css).toContain("--onboarding-card-bg: rgba(10, 10, 12, 0.56);");
    expect(css).toContain(
      "--onboarding-card-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);",
    );
    expect(css).toContain("--onboarding-input-bg: rgba(10, 10, 12, 0.68);");
    expect(css).toContain(
      "--onboarding-text-support-bg: rgba(9, 12, 18, 0.22);",
    );
    expect(css).toContain(
      "--onboarding-secondary-hover-bg: rgba(240, 185, 11, 0.08);",
    );
    expect(css).not.toContain("--onboarding-text-stroke-soft:");
    expect(css).not.toContain("--onboarding-card-scrim-top:");
    expect(css).not.toContain("--onboarding-panel-scrim-top:");
    expect(css).not.toContain(
      "--onboarding-panel-bg: rgba(247, 248, 250, 0.92);",
    );
    expect(css).not.toContain(
      "--onboarding-card-bg: rgba(252, 253, 253, 0.76);",
    );
    expect(css).not.toContain("--onboarding-panel-bg: rgba(6, 7, 8, 0.46);");
    expect(css).not.toContain("--onboarding-card-bg: rgba(10, 10, 12, 0.42);");
  });
});
