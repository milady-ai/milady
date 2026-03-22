// src/plugins/polymarket/__tests__/autonomous/goalStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { GoalStore } from "../../autonomous/stores/goalStore";
import type { PortfolioGoal } from "../../autonomous/types";

describe("GoalStore", () => {
  let store: GoalStore;

  beforeEach(() => {
    store = new GoalStore();
  });

  it("creates and retrieves a goal", async () => {
    const goal = await store.create({
      type: "return_target",
      description: "Grow portfolio 20%",
      metric: "total_pnl_pct",
      target: 20,
      priority: "hard",
    });
    expect(goal.id).toBeDefined();
    expect(goal.status).toBe("active");
    expect(goal.current).toBe(0);
  });

  it("lists active goals", async () => {
    await store.create({ type: "risk_limit", description: "Max drawdown 10%", metric: "max_drawdown", target: 10, priority: "hard" });
    await store.create({ type: "diversification", description: "Min 3 theses", metric: "position_count", target: 3, priority: "soft" });
    expect(await store.getActive()).toHaveLength(2);
  });

  it("updates current value", async () => {
    const goal = await store.create({ type: "return_target", description: "d", metric: "m", target: 20, priority: "hard" });
    await store.updateCurrent(goal.id, 6.4);
    const updated = (await store.getActive())[0];
    expect(updated.current).toBe(6.4);
  });

  it("marks goal as achieved", async () => {
    const goal = await store.create({ type: "return_target", description: "d", metric: "m", target: 20, priority: "hard" });
    await store.updateCurrent(goal.id, 20);
    await store.markAchieved(goal.id);
    expect(await store.getActive()).toHaveLength(0);
  });

  it("checks hard goal violations", async () => {
    await store.create({ type: "risk_limit", description: "Max 15% concentration", metric: "max_position_pct", target: 15, priority: "hard" });
    const violations = store.checkHardViolations({ max_position_pct: 20 });
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("15%");
  });

  it("returns no violations when within bounds", async () => {
    await store.create({ type: "risk_limit", description: "Max 15% concentration", metric: "max_position_pct", target: 15, priority: "hard" });
    const violations = store.checkHardViolations({ max_position_pct: 10 });
    expect(violations).toHaveLength(0);
  });
});
