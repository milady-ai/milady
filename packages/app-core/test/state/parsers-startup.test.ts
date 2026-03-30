import { describe, expect, it } from "vitest";
import { parseAgentStartupDiagnostics } from "../../src/state/parsers.js";

describe("parseAgentStartupDiagnostics", () => {
  it("parses optional embedding fields", () => {
    const parsed = parseAgentStartupDiagnostics({
      phase: "boot",
      attempt: 2,
      embeddingPhase: "downloading",
      embeddingDetail: "40% of 200 MB",
      embeddingProgressPct: 40,
    });
    expect(parsed?.phase).toBe("boot");
    expect(parsed?.embeddingPhase).toBe("downloading");
    expect(parsed?.embeddingDetail).toBe("40% of 200 MB");
    expect(parsed?.embeddingProgressPct).toBe(40);
  });
});
