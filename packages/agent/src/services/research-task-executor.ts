import { type IAgentRuntime, ModelType } from "@elizaos/core";
import type { TaskExecutor, TaskResult, TaskSpec } from "./task-executor";

const RESEARCH_PATTERNS =
  /\b(research|investigate|analyze|find out|look into|explore|summarize|compare|evaluate|review|study|assess)\b/i;

/**
 * Decomposes research questions into sub-questions, answers each via the
 * runtime's LLM, and synthesizes a final report.
 */
export class ResearchTaskExecutor implements TaskExecutor {
  readonly type = "research";
  readonly description =
    "Decomposes research questions and produces analysis artifacts";

  canHandle(spec: TaskSpec, _runtime: IAgentRuntime): boolean {
    if (spec.type === "research") return true;
    return RESEARCH_PATTERNS.test(spec.description);
  }

  async execute(spec: TaskSpec, runtime: IAgentRuntime): Promise<TaskResult> {
    const startTime = Date.now();
    try {
      // Step 1: Decompose the research question into sub-questions
      const decomposition = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: [
          "Decompose this research question into 3-5 focused sub-questions",
          "that can be answered independently:",
          "",
          spec.description,
          "",
          "Return as a JSON array of strings.",
        ].join("\n"),
      });

      let subQuestions: string[];
      try {
        // useModel(TEXT_LARGE) returns string, but LLMs may wrap JSON in
        // markdown fences like ```json\n[...]\n``` — strip them before parsing.
        let raw = decomposition;
        const fenceMatch = raw.match(
          /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
        );
        if (fenceMatch) raw = fenceMatch[1];
        const parsed: unknown = JSON.parse(raw.trim());
        subQuestions = Array.isArray(parsed)
          ? (parsed.filter((q) => typeof q === "string") as string[])
          : [spec.description];
        if (subQuestions.length === 0) subQuestions = [spec.description];
      } catch {
        subQuestions = [spec.description];
      }

      // Step 2: Answer each sub-question
      const answers: Array<{ question: string; answer: string }> = [];
      for (const question of subQuestions) {
        const answer = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt: [
            "Answer this research question concisely but thoroughly:",
            "",
            question,
            "",
            `Context: This is part of a larger research task: "${spec.description}"`,
          ].join("\n"),
        });
        answers.push({
          question,
          answer:
            typeof answer === "string" ? answer : String(answer),
        });
      }

      // Step 3: Synthesize into a final report
      const findingsBlock = answers
        .map(
          (a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`,
        )
        .join("\n\n");

      const synthesis = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: [
          "Synthesize these research findings into a coherent report:",
          "",
          `Original question: ${spec.description}`,
          "",
          `Findings:\n${findingsBlock}`,
          "",
          "Provide a structured summary with key findings, conclusions, and any caveats.",
        ].join("\n"),
      });

      const report =
        typeof synthesis === "string" ? synthesis : String(synthesis);

      return {
        taskId: spec.id,
        success: true,
        output: report,
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
    // Research tasks are sequential LLM calls — no persistent process to abort.
    // Could add cancellation token support in the future.
  }
}
