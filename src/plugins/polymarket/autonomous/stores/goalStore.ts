import type { PortfolioGoal } from "../types";
import { PortfolioGoalSchema } from "../types";

interface CreateGoalParams {
  type: PortfolioGoal["type"];
  description: string;
  metric: string;
  target: number;
  priority: PortfolioGoal["priority"];
  timeframe?: { start: number; end: number };
}

export class GoalStore {
  private goals = new Map<string, PortfolioGoal>();

  async create(params: CreateGoalParams): Promise<PortfolioGoal> {
    const goal: PortfolioGoal = {
      id: `goal-${crypto.randomUUID()}`,
      type: params.type,
      description: params.description,
      metric: params.metric,
      target: params.target,
      current: 0,
      timeframe: params.timeframe,
      priority: params.priority,
      status: "active",
    };
    PortfolioGoalSchema.parse(goal);
    this.goals.set(goal.id, goal);
    return { ...goal };
  }

  async getActive(): Promise<PortfolioGoal[]> {
    return [...this.goals.values()]
      .filter((g) => g.status === "active")
      .map((g) => ({ ...g }));
  }

  async updateCurrent(id: string, value: number): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.current = value;
  }

  async markAchieved(id: string): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.status = "achieved";
  }

  async markFailed(id: string): Promise<void> {
    const goal = this.goals.get(id);
    if (!goal) throw new Error(`Goal ${id} not found`);
    goal.status = "failed";
  }

  /**
   * Check if any hard goals would be violated by the given metrics.
   * Each metric key maps to a current value; goal.target is the limit.
   * For risk_limit goals: violation when current > target.
   * For diversification goals: violation when current < target.
   */
  checkHardViolations(currentMetrics: Record<string, number>): PortfolioGoal[] {
    const violations: PortfolioGoal[] = [];
    for (const goal of this.goals.values()) {
      if (goal.status !== "active" || goal.priority !== "hard") continue;
      const currentValue = currentMetrics[goal.metric];
      if (currentValue === undefined) continue;

      const isViolation =
        goal.type === "diversification"
          ? currentValue < goal.target
          : currentValue > goal.target;

      if (isViolation) {
        violations.push({ ...goal });
      }
    }
    return violations;
  }

  getAll(): PortfolioGoal[] {
    return [...this.goals.values()].map((g) => ({ ...g }));
  }
}
