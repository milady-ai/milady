import { describe, expect, it } from "vitest";
import {
  registrableDomain,
  TimeAggregator,
} from "../src/tracker/time-on-site.js";

describe("TimeAggregator", () => {
  it("records focus time while a domain is visible", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("example.com", true, 0);
    agg.recordFocusChange("example.com", false, 5_000);
    const report = agg.flush("device-1", 5_000);
    expect(report.domains).toHaveLength(1);
    expect(report.domains[0]).toMatchObject({
      domain: "example.com",
      focusMs: 5_000,
      sessionCount: 1,
    });
  });

  it("folds multiple sessions on the same domain into a single bucket", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("example.com", true, 0);
    agg.recordFocusChange("example.com", false, 4_000);
    agg.recordFocusChange("example.com", true, 10_000);
    agg.recordFocusChange("example.com", false, 13_000);
    const report = agg.flush("device-1", 13_000);
    expect(report.domains).toHaveLength(1);
    expect(report.domains[0]?.focusMs).toBe(7_000);
    expect(report.domains[0]?.sessionCount).toBe(2);
  });

  it("closes an open session when the domain switches", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("a.test", true, 0);
    agg.recordFocusChange("b.test", true, 3_000);
    agg.recordFocusChange("b.test", false, 5_000);
    const report = agg.flush("device-1", 5_000);
    const byDomain = Object.fromEntries(
      report.domains.map((d) => [d.domain, d.focusMs]),
    );
    expect(byDomain["a.test"]).toBe(3_000);
    expect(byDomain["b.test"]).toBe(2_000);
  });

  it("credits in-flight focus time when flushing", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("example.com", true, 0);
    const report = agg.flush("device-1", 2_000);
    expect(report.domains[0]?.focusMs).toBe(2_000);
    // A subsequent close should not double-count the already-flushed time.
    agg.recordFocusChange("example.com", false, 3_000);
    const second = agg.flush("device-1", 3_000);
    expect(second.domains[0]?.focusMs).toBe(1_000);
  });

  it("ignores invisible transitions when no session is open", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("", false, 0);
    agg.recordFocusChange("example.com", false, 1_000);
    const report = agg.flush("device-1", 1_000);
    expect(report.domains).toHaveLength(0);
  });

  it("resets the window after flush", () => {
    const agg = new TimeAggregator(0);
    agg.recordFocusChange("example.com", true, 0);
    agg.recordFocusChange("example.com", false, 1_000);
    const first = agg.flush("device-1", 1_000);
    const second = agg.flush("device-1", 2_000);
    expect(first.windowStart).toBe(new Date(0).toISOString());
    expect(second.windowStart).toBe(new Date(1_000).toISOString());
    expect(second.domains).toHaveLength(0);
  });
});

describe("registrableDomain", () => {
  it("extracts lowercase hostnames from http(s) URLs", () => {
    expect(registrableDomain("https://Example.COM/path")).toBe("example.com");
    expect(registrableDomain("http://foo.example.com")).toBe("foo.example.com");
  });

  it("rejects non-http schemes", () => {
    expect(registrableDomain("chrome://extensions")).toBe("");
    expect(registrableDomain("about:blank")).toBe("");
    expect(registrableDomain("not a url")).toBe("");
  });
});
