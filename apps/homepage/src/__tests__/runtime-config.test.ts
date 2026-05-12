import { describe, expect, it } from "vitest";
import {
  getCloudAgentApiPath,
  isLocalAgentAutoProbeDefaultHostname,
  shouldAutoProbeLocalAgentForConfig,
} from "../lib/runtime-config";

describe("runtime config", () => {
  it("auto-probes local agents only on local dev hosts by default", () => {
    expect(isLocalAgentAutoProbeDefaultHostname("localhost")).toBe(true);
    expect(isLocalAgentAutoProbeDefaultHostname("127.0.0.1")).toBe(true);
    expect(isLocalAgentAutoProbeDefaultHostname("[::1]")).toBe(true);
    expect(isLocalAgentAutoProbeDefaultHostname("milady.ai")).toBe(false);
    expect(isLocalAgentAutoProbeDefaultHostname("www.milady.ai")).toBe(false);
  });

  it("does not probe loopback agents from hosted pages even when explicitly enabled", () => {
    expect(
      shouldAutoProbeLocalAgentForConfig({
        pageHostname: "milady.ai",
        explicit: "1",
        localAgentBase: "http://localhost:2138",
      }),
    ).toBe(false);
  });

  it("keeps local dev probing configurable", () => {
    expect(
      shouldAutoProbeLocalAgentForConfig({ pageHostname: "localhost" }),
    ).toBe(true);
    expect(
      shouldAutoProbeLocalAgentForConfig({
        pageHostname: "localhost",
        explicit: "false",
      }),
    ).toBe(false);
  });

  it("allows explicit hosted probing when the configured agent base is not loopback", () => {
    expect(
      shouldAutoProbeLocalAgentForConfig({
        pageHostname: "milady.ai",
        explicit: "true",
        localAgentBase: "https://agent.example.com",
      }),
    ).toBe(true);
  });

  it("uses the upstream Eliza Cloud agent route by default", () => {
    expect(getCloudAgentApiPath()).toBe("/api/v1/eliza/agents");
    expect(getCloudAgentApiPath("agent 1", "pairing-token")).toBe(
      "/api/v1/eliza/agents/agent%201/pairing-token",
    );
  });
});
