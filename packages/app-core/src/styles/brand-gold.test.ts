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

    expect(css).toContain("--onboarding-panel-bg: rgba(5, 5, 6, 0.88);");
    expect(css).toContain(
      "--onboarding-text-primary: rgba(234, 236, 239, 0.92);",
    );
  });
});
