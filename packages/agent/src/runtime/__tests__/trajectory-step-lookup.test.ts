import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { loadTrajectoryByStepId } from "../trajectory-internals";

type SqlQuery = {
  queryChunks?: Array<{ value?: unknown }>;
};

function extractSqlText(query: SqlQuery): string {
  if (!Array.isArray(query.queryChunks)) return "";
  return query.queryChunks
    .map((chunk) => {
      const value = chunk?.value;
      if (Array.isArray(value)) return value.join("");
      return String(value ?? "");
    })
    .join("");
}

describe("loadTrajectoryByStepId", () => {
  it("finds a persisted trajectory when the stepId differs from the trajectory id", async () => {
    const trajectoryId = "trajectory-123";
    const stepId = "step-456";
    const startTime = 1_775_300_000_000;
    const runtime = {
      agentId: "test-agent",
      adapter: {
        db: {
          execute: async (query: SqlQuery) => {
            const sql = extractSqlText(query);
            if (sql.includes("WHERE id = 'step-456'")) {
              return { rows: [] };
            }
            if (
              sql.includes("COALESCE(steps_json, '') LIKE") &&
              sql.includes('"stepId":"step-456"')
            ) {
              return {
                rows: [
                  {
                    id: trajectoryId,
                    source: "client_chat",
                    status: "completed",
                    start_time: startTime,
                    end_time: startTime + 500,
                    steps_json: JSON.stringify([
                      {
                        stepId,
                        stepNumber: 0,
                        timestamp: startTime,
                        llmCalls: [
                          {
                            callId: "call-1",
                            timestamp: startTime + 250,
                            model: "TEXT_LARGE",
                            userPrompt: "hello",
                            response: "world",
                          },
                        ],
                        providerAccesses: [],
                      },
                    ]),
                    metadata: JSON.stringify({ source: "client_chat" }),
                    created_at: new Date(startTime).toISOString(),
                    updated_at: new Date(startTime + 500).toISOString(),
                  },
                ],
              };
            }
            throw new Error(`unexpected sql: ${sql}`);
          },
        },
      },
    } as unknown as AgentRuntime;

    const loaded = await loadTrajectoryByStepId(runtime, stepId);

    expect(loaded?.id).toBe(trajectoryId);
    expect(loaded?.steps).toHaveLength(1);
    expect(loaded?.steps[0]?.stepId).toBe(stepId);
    expect(loaded?.steps[0]?.llmCalls[0]?.userPrompt).toBe("hello");
  });
});
