import {
  getTrajectoryContext,
  type IAgentRuntime,
  runWithTrajectoryContext,
  setTrajectoryContextManager,
} from "@elizaos/core";
import { installDatabaseTrajectoryLogger as upstreamInstall } from "@elizaos/agent/runtime/trajectory-persistence";
import { AsyncLocalStorage } from "node:async_hooks";

export * from "@elizaos/agent/runtime/trajectory-persistence";

/**
 * The upstream @elizaos/core trajectory context manager lazily loads
 * AsyncLocalStorage via a dynamic import and uses a synchronous
 * StackContextManager as a fallback. That stack-based fallback pops
 * the context in a `finally` block *before* async work completes,
 * which means `getTrajectoryContext()` returns undefined inside any
 * awaited call (like `useModel`). Provider access logging is
 * unaffected because `composeState` also reads from
 * `message.metadata.trajectoryStepId`, but `useModel` relies solely
 * on the async context — so LLM calls are silently dropped.
 *
 * Fix: eagerly register an AsyncLocalStorage-backed context manager
 * before any trajectory work begins. This avoids the race between
 * the lazy dynamic import and the first `runWithTrajectoryContext`
 * call.
 */
const trajectoryStorage = new AsyncLocalStorage<
  { trajectoryStepId?: string } | undefined
>();

setTrajectoryContextManager({
  run<T>(
    context: { trajectoryStepId?: string } | undefined,
    fn: () => T | Promise<T>,
  ): T | Promise<T> {
    return trajectoryStorage.run(context, fn);
  },
  active(): { trajectoryStepId?: string } | undefined {
    return trajectoryStorage.getStore();
  },
});

type RuntimeUseModel = NonNullable<IAgentRuntime["useModel"]>;

type TrajectoryLoggerService = {
  endTrajectory(stepId: string, status: string): Promise<void>;
  isEnabled(): boolean;
  startTrajectory(
    agentId: IAgentRuntime["agentId"],
    input: {
      source: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<string>;
};

/**
 * Enhanced trajectory logger installer that also patches runtime.useModel
 * to ensure LLM calls are captured even when async context is lost.
 */
export async function installDatabaseTrajectoryLogger(runtime: IAgentRuntime) {
  // Run the upstream installer first to set up the service and logLlmCall patch
  await upstreamInstall(runtime);

  const originalUseModel = runtime.useModel;
  if (typeof originalUseModel !== "function") return;

  // Patch useModel on the instance to ensure trajectory context
  const patchedUseModel = async function (
    this: IAgentRuntime,
    ...args: Parameters<RuntimeUseModel>
  ): Promise<Awaited<ReturnType<RuntimeUseModel>>> {
    // Check if we already have a trajectory/step ID in context
    const context = getTrajectoryContext();
    if (context?.trajectoryStepId) {
      return originalUseModel.call(this, ...args);
    }

    // No context found. Check if the trajectory logger is enabled.
    const trajLogger = runtime.getService(
      "trajectory_logger",
    ) as TrajectoryLoggerService | null;
    if (!trajLogger || !trajLogger.isEnabled()) {
      return originalUseModel.call(this, ...args);
    }

    // We have a logger but no context. This is the common "missing LLM calls" case.
    // We'll start a "synthetic" step to capture this orphaned call.
    const stepId = await trajLogger.startTrajectory(runtime.agentId, {
      source: "chat-orphan",
      metadata: { autoPatch: true },
    });

    try {
      return await runWithTrajectoryContext({ trajectoryStepId: stepId }, () =>
        originalUseModel.call(this, ...args),
      );
    } finally {
      // Mark the orphan trajectory as completed immediately
      await trajLogger.endTrajectory(stepId, "completed");
    }
  };

  runtime.useModel = patchedUseModel as RuntimeUseModel;
}
