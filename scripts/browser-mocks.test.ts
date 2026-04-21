// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  installCanvasMocks,
  suppressReactTestConsoleErrors,
} from "../test/helpers/browser-mocks";

describe("browser-mocks", () => {
  it("suppresses React test console errors without wrapping console.error repeatedly", () => {
    const original = console.error;

    suppressReactTestConsoleErrors();
    const firstPatched = console.error;
    suppressReactTestConsoleErrors();
    const secondPatched = console.error;

    expect(firstPatched).toBe(original);
    expect(secondPatched).toBe(firstPatched);
  });

  it("installs canvas mocks only once per environment", () => {
    installCanvasMocks();
    const firstGetContext = HTMLCanvasElement.prototype.getContext;
    const firstToDataURL = HTMLCanvasElement.prototype.toDataURL;

    installCanvasMocks();

    expect(HTMLCanvasElement.prototype.getContext).toBe(firstGetContext);
    expect(HTMLCanvasElement.prototype.toDataURL).toBe(firstToDataURL);
  });
});
