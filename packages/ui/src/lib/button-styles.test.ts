import { describe, it, expect } from "vitest";
import { btnPrimary, btnGhost, btnDanger, inputCls } from "./button-styles";

describe("button-styles", () => {
  it("btnPrimary contains expected classes", () => {
    expect(btnPrimary).toContain("px-4");
    expect(btnPrimary).toContain("py-2");
    expect(btnPrimary).toContain("font-medium");
    expect(btnPrimary).toContain("rounded-lg");
    expect(btnPrimary).toContain("cursor-pointer");
    expect(btnPrimary).toContain("disabled:opacity-40");
  });

  it("btnGhost contains expected classes", () => {
    expect(btnGhost).toContain("bg-transparent");
    expect(btnGhost).toContain("rounded-lg");
    expect(btnGhost).toContain("cursor-pointer");
    expect(btnGhost).toContain("transition-colors");
  });

  it("btnDanger contains expected classes", () => {
    expect(btnDanger).toContain("bg-transparent");
    expect(btnDanger).toContain("rounded-lg");
    expect(btnDanger).toContain("cursor-pointer");
    expect(btnDanger).toContain("text-[var(--danger,#e74c3c)]");
  });

  it("inputCls contains expected classes", () => {
    expect(inputCls).toContain("flex-1");
    expect(inputCls).toContain("rounded-lg");
    expect(inputCls).toContain("focus:outline-none");
    expect(inputCls).toContain("transition-colors");
  });
});
