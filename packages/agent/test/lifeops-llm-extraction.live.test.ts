/**
 * Live LLM extraction tests for LifeOps actions.
 *
 * These tests call the extraction functions directly with a real LLM to verify
 * that the prompts produce correct subaction/operation classifications without
 * relying on regex fallbacks.
 *
 * Gate: MILADY_LIVE_TEST=1 (same as the main live e2e suite).
 * Requires at least one provider API key (OPENAI_API_KEY, GROQ_API_KEY,
 * ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENROUTER_API_KEY).
 */

import crypto from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ModelType, type IAgentRuntime, type Memory, type State } from "@elizaos/core";
import { extractLifeOperationWithLlm } from "../src/actions/life.extractor.js";
import { extractGmailPlanWithLlm } from "../src/actions/gmail.js";
import { extractCalendarPlanWithLlm } from "../src/actions/calendar.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
try {
  const { config } = await import("dotenv");
  config({ path: path.join(REPO_ROOT, ".env") });
} catch {
  // dotenv optional
}

const LIVE_ENABLED =
  process.env.MILADY_LIVE_TEST === "1" || process.env.ELIZA_LIVE_TEST === "1";

// ---------------------------------------------------------------------------
// Provider selection — pick the first available key
// ---------------------------------------------------------------------------

type ProviderConfig = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

function selectProvider(): ProviderConfig | null {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    return {
      name: "groq",
      apiKey: groqKey,
      baseUrl: "https://api.groq.com/openai/v1",
      model: process.env.GROQ_SMALL_MODEL?.trim() || "llama-3.1-8b-instant",
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      name: "openai",
      apiKey: openaiKey,
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      model: process.env.OPENAI_SMALL_MODEL?.trim() || "gpt-5.4-mini",
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      name: "anthropic",
      apiKey: anthropicKey,
      baseUrl: "https://api.anthropic.com",
      model: process.env.ANTHROPIC_SMALL_MODEL?.trim() || "claude-haiku-4-5-20251001",
    };
  }

  const googleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  if (googleKey) {
    return {
      name: "google",
      apiKey: googleKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: process.env.GOOGLE_SMALL_MODEL?.trim() || "gemini-2.0-flash-001",
    };
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    return {
      name: "openrouter",
      apiKey: openrouterKey,
      baseUrl: "https://openrouter.ai/api/v1",
      model:
        process.env.OPENROUTER_SMALL_MODEL?.trim() ||
        "google/gemini-2.0-flash-001",
    };
  }

  return null;
}

const provider = selectProvider();

if (!LIVE_ENABLED || !provider) {
  const reasons = [
    !LIVE_ENABLED ? "set MILADY_LIVE_TEST=1" : null,
    !provider ? "provide a provider API key" : null,
  ]
    .filter(Boolean)
    .join(" | ");
  console.info(
    `[lifeops-llm-extraction] skipped: ${reasons}`,
  );
}

// ---------------------------------------------------------------------------
// Minimal useModel that calls the provider API directly
// ---------------------------------------------------------------------------

async function callOpenAICompatible(
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${config.name} API error ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropicApi(
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `anthropic API error ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  return data.content?.[0]?.text ?? "";
}

async function callGoogleApi(
  config: ProviderConfig,
  prompt: string,
): Promise<string> {
  const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `google API error ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function createUseModel(config: ProviderConfig) {
  return async (
    _modelType: ModelType,
    params: { prompt?: unknown },
  ): Promise<string> => {
    const prompt = String(params?.prompt ?? "");
    if (config.name === "anthropic") {
      return callAnthropicApi(config, prompt);
    }
    if (config.name === "google") {
      return callGoogleApi(config, prompt);
    }
    return callOpenAICompatible(config, prompt);
  };
}

// ---------------------------------------------------------------------------
// Minimal runtime stub
// ---------------------------------------------------------------------------

function createMinimalRuntime(
  config: ProviderConfig,
): IAgentRuntime {
  const useModel = createUseModel(config);
  return {
    agentId: crypto.randomUUID(),
    useModel,
    logger: {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => console.warn("[test:warn]", ...args),
      error: (...args: unknown[]) => console.error("[test:error]", ...args),
    },
    getSetting: () => undefined,
    getService: () => null,
  } as unknown as IAgentRuntime;
}

function makeMessage(text: string): Memory {
  return {
    id: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    roomId: crypto.randomUUID(),
    agentId: crypto.randomUUID(),
    content: { text },
    createdAt: Date.now(),
  } as unknown as Memory;
}

function makeState(recentMessages?: string): State {
  return {
    values: { recentMessages: recentMessages ?? "" },
    data: {},
    text: recentMessages ?? "",
  } as State;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TEST_TIMEOUT = 30_000;

const describeIfLive = LIVE_ENABLED && provider ? describe : describe.skip;

describeIfLive("LLM plan extraction (live)", () => {
  const runtime = provider ? createMinimalRuntime(provider) : (null as unknown as IAgentRuntime);

  describe("extractLifeOperationWithLlm", () => {
    const cases = [
      { intent: "I brushed my teeth", expected: "complete_occurrence" },
      { intent: "remind me to take vitamins every morning", expected: "create_definition" },
      { intent: "less reminders please", expected: "set_reminder_preference" },
      { intent: "how am I doing on my marathon goal", expected: "review_goal" },
      { intent: "skip workout today", expected: "skip_occurrence" },
      { intent: "snooze that reminder", expected: "snooze_occurrence" },
      { intent: "delete my meditation habit", expected: "delete_definition" },
      { intent: "I want to learn guitar this year", expected: "create_goal" },
    ] as const;

    for (const { intent, expected } of cases) {
      it(
        `classifies "${intent}" as ${expected}`,
        async () => {
          const result = await extractLifeOperationWithLlm({
            runtime,
            message: makeMessage(intent),
            state: makeState(),
            intent,
          });
          expect(result.operation).toBe(expected);
          expect(result.confidence).toBeGreaterThan(0);
        },
        TEST_TIMEOUT,
      );
    }
  });

  describe("extractGmailPlanWithLlm", () => {
    const cases = [
      {
        intent: "who emailed me today",
        expectedSubaction: "search",
        expectQueries: true,
      },
      {
        intent: "check my inbox",
        expectedSubaction: "triage",
        expectQueries: false,
      },
      {
        intent: "draft a reply to John's email",
        expectedSubaction: "draft_reply",
        expectQueries: false,
      },
      {
        intent: "any emails from Sarah about the report",
        expectedSubaction: "search",
        expectQueries: true,
      },
      {
        intent: "which emails need a response",
        expectedSubaction: "needs_response",
        expectQueries: false,
      },
      {
        intent: "send that reply now",
        expectedSubaction: "send_reply",
        expectQueries: false,
      },
    ] as const;

    for (const { intent, expectedSubaction, expectQueries } of cases) {
      it(
        `classifies "${intent}" as ${expectedSubaction}`,
        async () => {
          const plan = await extractGmailPlanWithLlm(
            runtime,
            makeMessage(intent),
            makeState(),
            intent,
          );
          expect(plan.subaction).toBe(expectedSubaction);
          if (expectQueries) {
            expect(plan.queries.length).toBeGreaterThan(0);
          }
        },
        TEST_TIMEOUT,
      );
    }
  });

  describe("extractCalendarPlanWithLlm", () => {
    const cases = [
      {
        intent: "what's on my calendar today",
        expectedSubaction: "feed",
      },
      {
        intent: "what's my next meeting",
        expectedSubaction: "next_event",
      },
      {
        intent: "find my return flight",
        expectedSubaction: "search_events",
        expectQueries: true,
      },
      {
        intent: "schedule a meeting with Alex at 3pm tomorrow",
        expectedSubaction: "create_event",
      },
      {
        intent: "what do I have while I'm in Tokyo",
        expectedSubaction: "trip_window",
        expectTripLocation: true,
      },
      {
        intent: "meetings with Sarah this week",
        expectedSubaction: "search_events",
        expectQueries: true,
      },
    ] as const;

    for (const testCase of cases) {
      it(
        `classifies "${testCase.intent}" as ${testCase.expectedSubaction}`,
        async () => {
          const plan = await extractCalendarPlanWithLlm(
            runtime,
            makeMessage(testCase.intent),
            makeState(),
            testCase.intent,
          );
          expect(plan.subaction).toBe(testCase.expectedSubaction);
          if ("expectQueries" in testCase && testCase.expectQueries) {
            expect(plan.queries.length).toBeGreaterThan(0);
          }
          if ("expectTripLocation" in testCase && testCase.expectTripLocation) {
            expect(plan.tripLocation).toBeTruthy();
          }
        },
        TEST_TIMEOUT,
      );
    }
  });
});
