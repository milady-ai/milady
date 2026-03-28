import type http from "node:http";
import { describe, expect, it } from "vitest";
import { getProvidedApiToken } from "./auth";

function mockReq(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return { headers };
}

describe("getProvidedApiToken", () => {
  it("accepts the documented x-milady-token header", () => {
    expect(
      getProvidedApiToken(mockReq({ "x-milady-token": "milady-token" })),
    ).toBe("milady-token");
  });

  it("does not accept the undocumented x-milaidy-token typo alias", () => {
    expect(
      getProvidedApiToken(mockReq({ "x-milaidy-token": "typo-token" })),
    ).toBeNull();
  });
});
