import { describe, expect, it } from "vitest";
import {
  coordinatorScenarios,
  countCoordinatorScenariosByFamily,
  listCoordinatorScenarios,
} from "../src/evals/coordinator-scenarios.js";

describe("coordinator scenario catalog", () => {
  it("keeps at least fifty scenarios in the catalog", () => {
    expect(coordinatorScenarios.length).toBeGreaterThanOrEqual(50);
  });

  it("preserves smoke/core/full profile slicing", () => {
    const smoke = listCoordinatorScenarios("smoke");
    const core = listCoordinatorScenarios("core");
    const full = listCoordinatorScenarios("full");

    expect(smoke.length).toBeGreaterThan(0);
    expect(core.length).toBeGreaterThan(smoke.length);
    expect(full.length).toBeGreaterThan(core.length);
  });

  it("covers every scenario family with at least one entry", () => {
    const counts = countCoordinatorScenariosByFamily();
    for (const count of Object.values(counts)) {
      expect(count).toBeGreaterThan(0);
    }
  });
});
