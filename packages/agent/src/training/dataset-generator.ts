/**
 * Synthetic dataset generator for fine-tuning the shouldRespond + context-routing
 * classifier and the action planner.
 *
 * Architecture:
 * 1. Takes scenario blueprints and expands each into N variants
 * 2. Uses a teacher model (Claude/GPT-5) to generate realistic conversations
 * 3. Randomizes agent name per sample to prevent statistical pollution
 * 4. Exports in Gemini supervised tuning JSONL format
 *
 * Teacher model selection:
 * - ANTHROPIC_API_KEY → Claude Sonnet 4
 * - OPENAI_API_KEY → GPT-5 / GPT-4o
 * - Falls back to whichever is available
 */

import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { AgentContext } from "./context-types.js";
import {
  ALL_BLUEPRINTS,
  type ScenarioBlueprint,
} from "./scenario-blueprints.js";
import { ALL_CONTEXTS, ACTION_CONTEXT_MAP } from "./context-catalog.js";

// ==================== Types ====================

export interface TrainingSample {
  /** Unique sample ID */
  id: string;
  /** Source blueprint ID */
  blueprintId: string;
  /** The randomized agent name used in this sample */
  agentName: string;
  /** The conversation messages (multi-turn) */
  messages: ConversationMessage[];
  /** Expected classifier output */
  expectedOutput: ClassifierOutput;
  /** Metadata for filtering/analysis */
  metadata: SampleMetadata;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  /** Speaker name (for group chat context) */
  name?: string;
  content: string;
}

export interface ClassifierOutput {
  decision: "RESPOND" | "IGNORE" | "STOP";
  primaryContext: AgentContext;
  secondaryContexts: AgentContext[];
  reasoning: string;
  expectedAction?: string;
}

export interface SampleMetadata {
  platform: string;
  pattern: string;
  turnCount: number;
  generatedBy: string;
  generatedAt: string;
  variant: number;
  totalVariants: number;
}

/**
 * Gemini supervised tuning format.
 * See: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-use-supervised-tuning
 */
export interface GeminiTuningExample {
  messages: Array<{
    role: "system" | "user" | "model";
    content: string;
  }>;
}

// ==================== Name pools ====================

const AGENT_NAMES = [
  "Nova", "Kai", "Echo", "Luna", "Atlas", "Vex", "Iris", "Cypher",
  "Sage", "Bolt", "Pixel", "Nyx", "Orion", "Zephyr", "Flux",
  "Aria", "Cosmo", "Dash", "Ember", "Ghost", "Helix", "Jade",
  "Karma", "Lux", "Muse", "Neo", "Onyx", "Proto", "Qubit", "Rune",
  "Spark", "Titan", "Uno", "Volt", "Wren", "Xeno", "Yara", "Zen",
  "Chip", "Delta", "Ava", "Rex", "Sky", "Zara",
];

const PARTICIPANT_NAMES = [
  "Alice", "Bob", "Charlie", "Dave", "Eve", "Frank", "Grace", "Hank",
  "Ivy", "Jack", "Karen", "Leo", "Mia", "Nick", "Olivia", "Pete",
  "Quinn", "Rose", "Sam", "Tina", "Uma", "Vince", "Wendy", "Xavier",
  "Yuki", "Zack", "Maya", "Raj", "Sofia", "Tyler", "Aisha", "Ben",
  "Chloe", "Dan", "Elena", "Finn", "Gabe", "Hannah", "Isaac", "Jade",
];

const OTHER_BOT_NAMES = [
  "AssistBot", "Helper", "Cortana", "Alexa", "Siri", "Bard",
  "CoPilot", "Genie", "Oracle", "Alfred", "Jarvis", "Friday",
];

const PLATFORMS = [
  "telegram", "discord", "slack", "matrix", "irc",
];

// ==================== Teacher model interface ====================

export interface TeacherModel {
  name: string;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Create a teacher model using the Anthropic API.
 */
export function createAnthropicTeacher(apiKey: string): TeacherModel {
  return {
    name: "anthropic/claude-sonnet-4",
    async generate(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Anthropic API error: ${response.status} ${await response.text()}`,
        );
      }
      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
      };
      return data.content[0]?.text ?? "";
    },
  };
}

/**
 * Create a teacher model using the OpenAI API.
 */
export function createOpenAITeacher(apiKey: string): TeacherModel {
  return {
    name: "openai/gpt-5",
    async generate(systemPrompt: string, userPrompt: string): Promise<string> {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 4096,
            temperature: 0.9,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${await response.text()}`,
        );
      }
      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? "";
    },
  };
}

// ==================== Randomization utilities ====================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomAgentName(exclude: string[] = []): string {
  const available = AGENT_NAMES.filter(
    (n) => !exclude.map((e) => e.toLowerCase()).includes(n.toLowerCase()),
  );
  return pickRandom(available.length > 0 ? available : AGENT_NAMES);
}

function randomParticipants(
  count: number,
  exclude: string[] = [],
): string[] {
  const available = PARTICIPANT_NAMES.filter(
    (n) => !exclude.map((e) => e.toLowerCase()).includes(n.toLowerCase()),
  );
  return pickN(available, count);
}

// ==================== Prompt construction ====================

function buildTeacherSystemPrompt(): string {
  return `You are a synthetic data generator for training an AI agent's message classifier.
Your task is to generate realistic multi-turn group chat conversations.

IMPORTANT RULES:
1. Output ONLY valid JSON. No markdown, no explanation, no preamble.
2. Each message must have "name" (speaker name) and "content" (message text).
3. Messages should feel natural - casual, varied length, sometimes with typos.
4. Group chats should have 3-6 participants plus optionally the agent.
5. The agent's messages (when present) should be clearly from an AI assistant.
6. NEVER include the expected classifier output in the conversation itself.
7. Messages should be diverse in tone: some short, some long, some with emoji.

Output format:
{
  "messages": [
    {"name": "Alice", "content": "hey everyone"},
    {"name": "Bob", "content": "what's up"},
    ...
  ]
}`;
}

function buildTeacherUserPrompt(
  blueprint: ScenarioBlueprint,
  agentName: string,
  participants: string[],
  platform: string,
  otherBotName?: string,
  variant: number = 0,
): string {
  const turnRange = `${blueprint.minContextTurns}-${blueprint.maxContextTurns}`;
  const participantList = participants.join(", ");

  let extraInstructions = "";

  if (blueprint.pattern === "group_wrong_agent" && otherBotName) {
    extraInstructions = `There is ANOTHER bot named "${otherBotName}" in the chat. Someone addresses "${otherBotName}" (not "${agentName}"). "${agentName}" should NOT be addressed.`;
  }

  if (blueprint.pattern === "group_about_agent") {
    extraInstructions = `People talk ABOUT "${agentName}" in third person ("the bot", "it", "${agentName} can do X") but NEVER address it directly. No "@${agentName}" or "${agentName}, can you...".`;
  }

  if (blueprint.pattern === "group_noise") {
    extraInstructions = `"${agentName}" should NOT appear in any message at all. This is pure human conversation.`;
  }

  if (blueprint.pattern === "group_action_emergence") {
    extraInstructions = `The intent to perform an action should emerge GRADUALLY over multiple messages. Users discuss the topic, one user's intent builds up, and finally they ask the agent to execute. The last 1-2 messages should clearly direct the agent.`;
  }

  if (blueprint.pattern === "group_multi_turn_intent") {
    extraInstructions = `The action intent should build across 3+ messages from the same user. They start by observing/discussing, then express desire, then finally ask the agent to act.`;
  }

  const keywordsHint =
    blueprint.groundingKeywords.length > 0
      ? `Try to naturally include some of these words/phrases: ${blueprint.groundingKeywords.join(", ")}`
      : "";

  return `Generate variant #${variant + 1} of a ${platform} group chat conversation.

SCENARIO: ${blueprint.description}
AGENT NAME: ${agentName}
PARTICIPANTS: ${participantList}
PLATFORM: ${platform}
TARGET TURNS: ${turnRange} messages
CONVERSATION PATTERN: ${blueprint.pattern}
${keywordsHint}
${extraInstructions}

${blueprint.generationHint}

Remember:
- Output ONLY the JSON with "messages" array
- Each message has "name" and "content"
- Make it feel natural and realistic
- Vary message lengths and tones
- The last message should be the one the classifier evaluates`;
}

// ==================== Core generation ====================

/**
 * Generate a single training sample from a blueprint.
 */
export async function generateSample(
  blueprint: ScenarioBlueprint,
  teacher: TeacherModel,
  variant: number,
  totalVariants: number,
): Promise<TrainingSample> {
  const agentName = randomAgentName();
  const participantCount = 3 + Math.floor(Math.random() * 3); // 3-5
  const participants = randomParticipants(participantCount, [agentName]);
  const platform = pickRandom(PLATFORMS);
  const otherBotName =
    blueprint.pattern === "group_wrong_agent"
      ? pickRandom(OTHER_BOT_NAMES)
      : undefined;

  const systemPrompt = buildTeacherSystemPrompt();
  const userPrompt = buildTeacherUserPrompt(
    blueprint,
    agentName,
    participants,
    platform,
    otherBotName,
    variant,
  );

  const raw = await teacher.generate(systemPrompt, userPrompt);

  // Parse the teacher's output
  let parsed: { messages: Array<{ name: string; content: string }> };
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // If parsing fails, create a minimal sample
    parsed = {
      messages: [
        { name: participants[0]!, content: "Hey everyone" },
        {
          name: participants[1]!,
          content:
            blueprint.decision === "RESPOND"
              ? `${agentName}, can you help?`
              : "What's for lunch?",
        },
      ],
    };
  }

  // Convert to training format
  const messages: ConversationMessage[] = parsed.messages.map((m) => ({
    role: "user" as const,
    name: m.name,
    content: m.content,
  }));

  const expectedOutput: ClassifierOutput = {
    decision: blueprint.decision,
    primaryContext: blueprint.primaryContext,
    secondaryContexts: blueprint.secondaryContexts ?? [],
    reasoning: blueprint.description,
    expectedAction: blueprint.expectedAction,
  };

  return {
    id: randomUUID(),
    blueprintId: blueprint.id,
    agentName,
    messages,
    expectedOutput,
    metadata: {
      platform,
      pattern: blueprint.pattern,
      turnCount: messages.length,
      generatedBy: teacher.name,
      generatedAt: new Date().toISOString(),
      variant,
      totalVariants,
    },
  };
}

// ==================== Batch generation ====================

export interface GenerationConfig {
  /** Number of variants per blueprint */
  variantsPerBlueprint: number;
  /** Teacher model to use */
  teacher: TeacherModel;
  /** Output directory */
  outputDir: string;
  /** Optional filter: only generate for these contexts */
  filterContexts?: AgentContext[];
  /** Optional filter: only generate for these decisions */
  filterDecisions?: Array<"RESPOND" | "IGNORE" | "STOP">;
  /** Concurrency limit for teacher API calls */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number, sample: TrainingSample) => void;
}

/**
 * Generate the full synthetic dataset.
 */
export async function generateDataset(
  config: GenerationConfig,
): Promise<TrainingSample[]> {
  let blueprints = ALL_BLUEPRINTS;

  if (config.filterContexts) {
    const ctxSet = new Set(config.filterContexts);
    blueprints = blueprints.filter(
      (b) =>
        ctxSet.has(b.primaryContext) ||
        b.secondaryContexts?.some((c) => ctxSet.has(c)),
    );
  }

  if (config.filterDecisions) {
    const decSet = new Set(config.filterDecisions);
    blueprints = blueprints.filter((b) => decSet.has(b.decision));
  }

  const totalSamples = blueprints.length * config.variantsPerBlueprint;
  const samples: TrainingSample[] = [];
  let completed = 0;

  const concurrency = config.concurrency ?? 5;

  // Process in batches to respect concurrency
  const tasks: Array<() => Promise<TrainingSample>> = [];
  for (const blueprint of blueprints) {
    for (let v = 0; v < config.variantsPerBlueprint; v++) {
      tasks.push(() =>
        generateSample(
          blueprint,
          config.teacher,
          v,
          config.variantsPerBlueprint,
        ),
      );
    }
  }

  // Execute with concurrency limit
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map((fn) => fn()));

    for (const result of results) {
      completed++;
      if (result.status === "fulfilled") {
        samples.push(result.value);
        config.onProgress?.(completed, totalSamples, result.value);
      } else {
        console.error(`Failed to generate sample: ${result.reason}`);
      }
    }
  }

  return samples;
}

// ==================== Export formats ====================

/**
 * Convert a training sample to Gemini supervised tuning format.
 * The system message contains the shouldRespond prompt template,
 * the user message contains the conversation, and the model message
 * contains the expected structured output.
 */
export function toGeminiFormat(
  sample: TrainingSample,
  includeContextRouting: boolean = true,
): GeminiTuningExample {
  // Build the system prompt (the shouldRespond template with agent name filled)
  const systemContent = `You are ${sample.agentName}, an AI assistant in a group chat.
Decide whether to RESPOND, IGNORE, or STOP based on the conversation.${
    includeContextRouting
      ? `\nAlso determine the primary domain context from: ${ALL_CONTEXTS.join(", ")}`
      : ""
  }`;

  // Build the user message (the conversation history)
  const conversationLines = sample.messages
    .map((m) => `[${m.name}]: ${m.content}`)
    .join("\n");

  const userContent = `Platform: ${sample.metadata.platform}
Agent name: ${sample.agentName}

Conversation:
${conversationLines}

Should ${sample.agentName} respond?`;

  // Build the model response (the expected classifier output)
  let modelContent: string;
  if (includeContextRouting) {
    modelContent = `name: ${sample.agentName}
reasoning: ${sample.expectedOutput.reasoning}
action: ${sample.expectedOutput.decision}
primaryContext: ${sample.expectedOutput.primaryContext}
secondaryContexts: [${sample.expectedOutput.secondaryContexts.join(", ")}]`;
  } else {
    modelContent = `name: ${sample.agentName}
reasoning: ${sample.expectedOutput.reasoning}
action: ${sample.expectedOutput.decision}`;
  }

  if (sample.expectedOutput.expectedAction) {
    modelContent += `\nexpectedAction: ${sample.expectedOutput.expectedAction}`;
  }

  return {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
      { role: "model", content: modelContent },
    ],
  };
}

/**
 * Export the full dataset to JSONL files for Gemini supervised tuning.
 * Creates separate files for should_respond and context_routing.
 */
export async function exportToGeminiJSONL(
  samples: TrainingSample[],
  outputDir: string,
): Promise<{ shouldRespondPath: string; contextRoutingPath: string; combinedPath: string }> {
  await mkdir(outputDir, { recursive: true });

  // Combined (shouldRespond + context routing)
  const combinedPath = join(outputDir, "combined_training.jsonl");
  const combinedLines = samples
    .map((s) => JSON.stringify(toGeminiFormat(s, true)))
    .join("\n");
  await writeFile(combinedPath, combinedLines + "\n");

  // shouldRespond only (no context routing — for Flash Lite)
  const shouldRespondPath = join(outputDir, "should_respond_training.jsonl");
  const srLines = samples
    .map((s) => JSON.stringify(toGeminiFormat(s, false)))
    .join("\n");
  await writeFile(shouldRespondPath, srLines + "\n");

  // Context routing only (for samples where decision is RESPOND)
  const contextRoutingPath = join(outputDir, "context_routing_training.jsonl");
  const crLines = samples
    .filter((s) => s.expectedOutput.decision === "RESPOND")
    .map((s) => JSON.stringify(toGeminiFormat(s, true)))
    .join("\n");
  await writeFile(contextRoutingPath, crLines + "\n");

  // Also write the raw samples for analysis
  const rawPath = join(outputDir, "raw_samples.json");
  await writeFile(rawPath, JSON.stringify(samples, null, 2));

  // Write stats
  const stats = {
    totalSamples: samples.length,
    byDecision: {
      RESPOND: samples.filter((s) => s.expectedOutput.decision === "RESPOND")
        .length,
      IGNORE: samples.filter((s) => s.expectedOutput.decision === "IGNORE")
        .length,
      STOP: samples.filter((s) => s.expectedOutput.decision === "STOP")
        .length,
    },
    byContext: Object.fromEntries(
      ALL_CONTEXTS.map((ctx) => [
        ctx,
        samples.filter((s) => s.expectedOutput.primaryContext === ctx).length,
      ]),
    ),
    byPattern: Object.fromEntries(
      [...new Set(samples.map((s) => s.metadata.pattern))].map((p) => [
        p,
        samples.filter((s) => s.metadata.pattern === p).length,
      ]),
    ),
    uniqueAgentNames: new Set(samples.map((s) => s.agentName)).size,
    avgTurnCount:
      samples.reduce((sum, s) => sum + s.metadata.turnCount, 0) /
      samples.length,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(join(outputDir, "stats.json"), JSON.stringify(stats, null, 2));

  return { shouldRespondPath, contextRoutingPath, combinedPath };
}

/**
 * Export from existing Milady trajectories to training format.
 * Converts real trajectory data into the same JSONL format.
 */
export async function exportTrajectoriesAsTraining(
  trajectories: Array<{
    steps: Array<{
      llmCalls: Array<{
        purpose?: string;
        systemPrompt?: string;
        userPrompt?: string;
        response?: string;
        model?: string;
      }>;
    }>;
    metadata?: Record<string, unknown>;
  }>,
  agentName: string,
  outputPath: string,
): Promise<number> {
  const examples: GeminiTuningExample[] = [];

  for (const trajectory of trajectories) {
    for (const step of trajectory.steps) {
      for (const call of step.llmCalls) {
        if (
          call.purpose === "should_respond" &&
          call.systemPrompt &&
          call.userPrompt &&
          call.response
        ) {
          examples.push({
            messages: [
              { role: "system", content: call.systemPrompt },
              { role: "user", content: call.userPrompt },
              { role: "model", content: call.response },
            ],
          });
        }
      }
    }
  }

  const content = examples.map((e) => JSON.stringify(e)).join("\n");
  await writeFile(outputPath, content + "\n");

  return examples.length;
}
