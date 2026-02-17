
import { AgentRuntime, type Character } from "@elizaos/core";
import sqlPlugin from "@elizaos/plugin-sql";
import { trajectoryLoggerPlugin } from "../plugins/plugin-trajectory-logger/typescript/index.ts";
import { TrajectoryLoggerService } from "../plugins/plugin-trajectory-logger/typescript/TrajectoryLoggerService.ts";
import { v4 as uuidv4 } from "uuid";

// Mock Character
const character: Character = {
  name: "VerificationAgent",
  username: "verify_agent",
  modelProvider: "openai",
  bio: "I am a verification agent.",
  lore: [],
  messageExamples: [],
  style: { all: [], chat: [], post: [] },
  plugins: [],
};

async function main() {
  console.log("Starting verification of Trajectory Logger...");
  console.log("Imported TrajectoryLoggerService prototype keys:", Object.getOwnPropertyNames(TrajectoryLoggerService.prototype));

  // Initialize Runtime with SQL Plugin and Trajectory Logger Plugin
  // Note: We use forcedPlugin to override services but we also manually register later
  // to be absolutely sure we beat the bootstrap plugin.
  const forcedPlugin = {
    ...trajectoryLoggerPlugin,
    services: [TrajectoryLoggerService]
  };

  const runtime = new AgentRuntime({
    character: character as unknown,
    plugins: [sqlPlugin as unknown, forcedPlugin as unknown],
  });

  console.log("Runtime initialized. Waiting for plugins to load...");
  await runtime.initialize();

  // Verify Database Adapter is available
  if (!runtime.adapter) {
    console.error(
      "❌ Database adapter not initialized! plugin-sql might have failed.",
    );
    process.exit(1);
  }
  console.log("✅ Database adapter initialized.");

  // HACK: Bootstrap plugin registers a stale TrajectoryLoggerService.
  // We must remove it and register our fresh local instance to verify the new code.
  console.log("Clearing stale trajectory_logger service registered by bootstrap...");
  // Use 'any' cast to access private/protected members if necessary, though services map is public
  (runtime.services as Map<any, any>).set("trajectory_logger", []);

  console.log("Registering fresh TrajectoryLoggerService...");
  // Pass the CLASS, not an instance. Cast to any to avoid type mismatch if d.ts is outdated.
  await runtime.registerService(TrajectoryLoggerService as any);

  // Retrieve Trajectory Logger Service
  console.log("Checking for Trajectory Logger Service...");

  // No need to wait loop since we just registered it synchronously
  const loggerService =
    runtime.getService<TrajectoryLoggerService>("trajectory_logger");

  if (!loggerService) {
    console.error("❌ Trajectory Logger Service not found!");
    process.exit(1);
  }
  console.log("✅ Trajectory Logger Service found.");
  console.log("Service keys:", Object.keys(loggerService));
  const proto = Object.getPrototypeOf(loggerService);
  console.log(
    "Service prototype keys:",
    Object.getOwnPropertyNames(proto),
  );

  // Ensure it's enabled
  if (typeof loggerService.setEnabled === "function") {
    loggerService.setEnabled(true);
  } else {
    console.warn("⚠️ setEnabled method missing on loggerService!");
  }

  if (
    typeof loggerService.isEnabled === "function" &&
    !loggerService.isEnabled()
  ) {
    console.error("❌ Failed to enable Trajectory Logger!");
    process.exit(1);
  }
  console.log("✅ Trajectory Logger enabled.");

  // Simulate Message Flow
  const userId = uuidv4();
  const roomId = uuidv4();
  const agentId = runtime.agentId;

  console.log("Simulating MESSAGE_RECEIVED...");

  // 1. Start Trajectory
  // Explicitly check method existence to fail fast
  if (typeof loggerService.startTrajectory !== 'function') {
    console.error("❌ startTrajectory is NOT a function on the service instance!");
    process.exit(1);
  }

  const trajectoryId = await loggerService.startTrajectory(agentId, {
    metadata: {
      roomId,
      conversationId: roomId,
      source: "verification_script",
    }
  }); // Using simplified signature if needed, matching source code expectations

  console.log(`Started trajectory: ${trajectoryId}`);

  // 2. Add a Step
  const stepId = loggerService.startStep(trajectoryId, {
    timestamp: Date.now(),
    agentBalance: 0,
    agentPoints: 0,
    agentPnL: 0,
    openPositions: 0,
  });
  console.log(`Started step: ${stepId}`);

  // Simulate LLM Call/Action
  await loggerService.completeStep(trajectoryId, stepId, {
    actionType: "text",
    actionName: "response",
    parameters: { text: "Hello response" },
    success: true,
  });
  console.log("Completed step 1.");

  // 3. End Trajectory
  await loggerService.endTrajectory(trajectoryId, "completed", {
    conversationId: roomId,
  });
  console.log("Ended trajectory.");

  // 4. Verify Persistence
  console.log("Verifying persistence...");
  // Allow DB to flush
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const savedTrajectory = await loggerService.getTrajectoryDetail(trajectoryId);

  if (!savedTrajectory) {
    console.error("❌ Failed to load saved trajectory from DB!");
    process.exit(1);
  }

  if (savedTrajectory.metrics.finalStatus !== "completed") {
    console.error(
      `❌ Unexpected status: ${savedTrajectory.metrics.finalStatus}`,
    );
    process.exit(1);
  }

  console.log("✅ Trajectory loaded successfully and status matches.");
  console.log("Verification COMPLETE.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
