import { describe, expect, it } from "vitest";
import { Dashboard } from "../pages/Dashboard";
import { Homepage } from "../pages/Homepage";

describe("homepage route modules", () => {
  it("exports separate route components for the landing page and dashboard", () => {
    expect(Homepage).toBeTypeOf("function");
    expect(Dashboard).toBeTypeOf("function");
  });
});
