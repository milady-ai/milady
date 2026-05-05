import type { ElizaConfig } from "../config/config.js";

type ResponseTriggerRule = {
  append?: unknown;
  suffix?: unknown;
  text?: unknown;
  trigger?: unknown;
  triggers?: unknown;
};

const BLOCKED_OUTPUT_PATTERNS = [
  /\bn[i1!|]g{2}(?:a|er)?s?\b/i,
  /\bf[a@]gg?o?t?s?\b/i,
  /\bk[i1!|]k[e3]s?\b/i,
  /\bch[i1!|]nks?\b/i,
  /\bsp[i1!|]cs?\b/i,
  /\btr[a@]nn(?:y|ies)\b/i,
];

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readTriggerList(rule: ResponseTriggerRule): string[] {
  const values = Array.isArray(rule.triggers) ? rule.triggers : [rule.trigger];
  return values
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));
}

function readAppendText(rule: ResponseTriggerRule): string | null {
  return (
    normalizeText(rule.append) ??
    normalizeText(rule.suffix) ??
    normalizeText(rule.text)
  );
}

function isBlockedOutput(text: string): boolean {
  return BLOCKED_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

function isTriggered(prompt: string, trigger: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedTrigger = trigger.toLowerCase();
  if (!normalizedTrigger) return false;
  return normalizedPrompt.includes(normalizedTrigger);
}

function readConfiguredRules(config: ElizaConfig): ResponseTriggerRule[] {
  const defaults = config.agents?.defaults as
    | (Record<string, unknown> & { responseTriggers?: unknown })
    | undefined;
  const raw = defaults?.responseTriggers;
  return Array.isArray(raw) ? (raw as ResponseTriggerRule[]) : [];
}

export function applyResponseTriggers(
  responseText: string,
  userPrompt: string,
  config: ElizaConfig,
): string {
  const rules = readConfiguredRules(config);
  if (rules.length === 0) return responseText;

  const additions: string[] = [];
  for (const rule of rules) {
    const appendText = readAppendText(rule);
    if (!appendText || isBlockedOutput(appendText)) continue;

    const triggers = readTriggerList(rule);
    if (triggers.some((trigger) => isTriggered(userPrompt, trigger))) {
      additions.push(appendText);
    }
  }

  if (additions.length === 0) return responseText;

  const uniqueAdditions = Array.from(new Set(additions)).filter(
    (addition) => !responseText.includes(addition),
  );
  if (uniqueAdditions.length === 0) return responseText;

  return `${responseText.trimEnd()}\n${uniqueAdditions.join("\n")}`;
}
