import { describe, expect, it } from "vitest";
import {
  classifyContribution,
  decisionFor,
  scopeVerdictFor,
} from "./review-local-agent.mjs";

describe("review-local-agent", () => {
  it("classifies docs-only changes as docs", () => {
    expect(
      classifyContribution({
        title: "docs: update guide",
        body: "",
        files: ["docs/build-and-release.md"],
      }),
    ).toBe("docs");
  });

  it("classifies workflow-only changes as ci", () => {
    expect(
      classifyContribution({
        title: "chore: tweak workflow",
        body: "",
        files: [".github/workflows/ci.yml"],
      }),
    ).toBe("ci");
  });

  it("classifies test-only changes as test", () => {
    expect(
      classifyContribution({
        title: "test: add regression",
        body: "",
        files: ["test/wallet-live.e2e.test.ts"],
      }),
    ).toBe("test");
  });

  it("classifies non-technical style changes as aesthetic", () => {
    expect(
      classifyContribution({
        title: "restyle dark mode typography",
        body: "theme polish",
        files: ["packages/app-core/src/components/Theme.css"],
      }),
    ).toBe("aesthetic");
  });

  it("classifies security text as security", () => {
    expect(
      classifyContribution({
        title: "fix auth bypass regression",
        body: "security hardening",
        files: ["packages/agent/src/api/server.ts"],
      }),
    ).toBe("security");
  });

  it("maps scope verdicts", () => {
    expect(scopeVerdictFor("aesthetic")).toBe("out of scope");
    expect(scopeVerdictFor("feature")).toBe("needs deep review");
    expect(scopeVerdictFor("bugfix")).toBe("in scope");
  });

  it("maps decision from scope and checks", () => {
    expect(
      decisionFor({ scopeVerdict: "out of scope", checksExitCode: 0 }),
    ).toBe("CLOSE");
    expect(decisionFor({ scopeVerdict: "in scope", checksExitCode: 1 })).toBe(
      "REQUEST CHANGES",
    );
    expect(decisionFor({ scopeVerdict: "in scope", checksExitCode: 0 })).toBe(
      "APPROVE",
    );
  });
});
