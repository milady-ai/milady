import * as JSON5Module from "json5";
import { describe, expect, it } from "vitest";

describe("dev-ui json5 interop", () => {
  it("resolves a parse function from default-or-namespace shape", () => {
    const JSON5 = JSON5Module.default ?? JSON5Module;
    expect(typeof JSON5.parse).toBe("function");
  });
});
