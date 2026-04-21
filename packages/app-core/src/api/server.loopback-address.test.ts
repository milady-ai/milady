import { describe, expect, it } from "vitest";
import { isLoopbackRemoteAddress } from "./server";

describe("isLoopbackRemoteAddress", () => {
  it.each([
    "127.0.0.1",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:0:127.0.0.1",
  ])("accepts loopback address %s", (address) => {
    expect(isLoopbackRemoteAddress(address)).toBe(true);
  });

  it.each([
    "10.0.0.5",
    "::ffff:10.0.0.5",
    "",
    null,
    undefined,
  ])("rejects non-loopback address %s", (address) => {
    expect(isLoopbackRemoteAddress(address)).toBe(false);
  });
});
