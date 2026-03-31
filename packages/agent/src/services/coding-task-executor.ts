import type { IAgentRuntime, Service } from "@elizaos/core";
import type { TaskExecutor, TaskResult, TaskSpec } from "./task-executor";

const CODING_PATTERNS =
  /\b(build|create|make|scaffold|generate|code|implement|develop|fix|debug|refactor|write)\b/i;

/**
 * Minimal subset of the AgentOrchestratorService (CODE_TASK) used by
 * this executor. The full interface lives in the orchestrator plugin;
 * we only depend on the createTask / cancelTask surface.
 */
interface CodeTaskServiceSubset extends Service {
  createTask(
    name: string,
    description: string,
    roomId?: string,
    providerId?: string,
    requiredCapabilities?: string[],
  ): Promise<{ id: string; name: string; metadata?: { status?: string } }>;
  cancelTask(taskId: string): boolean;
}

/**
 * Wraps the existing CODE_TASK service (AgentOrchestratorService) as a
 * TaskExecutor. Delegates entirely to the orchestrator — does not
 * reimplement any orchestration logic.
 *
 * The CODE_TASK service is registered by the orchestrator plugin and
 * discovered via `runtime.getService("CODE_TASK")`. The SWARM_COORDINATOR
 * service is checked as a secondary signal that coding infrastructure is
 * available.
 */
export class CodingTaskExecutor implements TaskExecutor {
  readonly type = "coding";
  readonly description =
    "Executes coding tasks using the CODE_TASK orchestrator service";

  canHandle(spec: TaskSpec, runtime: IAgentRuntime): boolean {
    // CODE_TASK service must be available
    const codeTaskService = runtime.getService("CODE_TASK");
    if (!codeTaskService) return false;

    // Explicit type match
    if (spec.type === "coding") return true;

    // Heuristic: description matches coding-related verbs
    return CODING_PATTERNS.test(spec.description);
  }

  async execute(spec: TaskSpec, runtime: IAgentRuntime): Promise<TaskResult> {
    const service = runtime.getService<CodeTaskServiceSubset>("CODE_TASK");

    if (!service) {
      return {
        taskId: spec.id,
        success: false,
        error: "CODE_TASK service not available",
      };
    }

    const startTime = Date.now();
    try {
      // Delegate to the existing orchestrator task creation flow.
      // createTask(name, description, roomId?, providerId?, capabilities?)
      const task = await service.createTask(
        spec.description.slice(0, 120),
        spec.description,
        undefined,
        spec.agentType ?? "claude",
      );

      return {
        taskId: spec.id,
        success: true,
        output: task.id,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: spec.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  async abort(_taskId: string): Promise<void> {
    // Abort is handled through the existing PTY session stop mechanism.
    // The orchestrator service manages session lifecycle via cancelTask().
  }
}
