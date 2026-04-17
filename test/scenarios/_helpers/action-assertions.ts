import type {
  CapturedAction,
  ScenarioCheckResult,
  ScenarioContext,
  ScenarioTurnExecution,
} from "@elizaos/scenario-schema";

type Pattern = string | RegExp;

type ActionExpectation = {
  acceptedActions: string[];
  description: string;
  includesAny?: Pattern[];
  includesAll?: Pattern[];
  minCount?: number;
};

function actionBlob(action: CapturedAction): string {
  const parts: string[] = [action.actionName];
  if (action.parameters) {
    parts.push(JSON.stringify(action.parameters));
  }
  if (action.result?.data) {
    parts.push(JSON.stringify(action.result.data));
  }
  if (action.result?.values) {
    parts.push(JSON.stringify(action.result.values));
  }
  if (action.result?.text) {
    parts.push(action.result.text);
  }
  if (action.error?.message) {
    parts.push(action.error.message);
  }
  return parts.join(" | ");
}

function matchesPattern(value: string, pattern: Pattern): boolean {
  if (typeof pattern === "string") {
    return value.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(value);
}

function describeActionSet(actions: CapturedAction[]): string {
  return actions.map((action) => action.actionName).join(", ") || "(none)";
}

function validateActionExpectation(
  actions: CapturedAction[],
  expectation: ActionExpectation,
): ScenarioCheckResult {
  const matched = actions.filter((action) =>
    expectation.acceptedActions.includes(action.actionName),
  );
  const minCount = expectation.minCount ?? 1;
  if (matched.length < minCount) {
    return `Expected ${expectation.description} via [${expectation.acceptedActions.join(", ")}] but got ${describeActionSet(actions)}.`;
  }

  const blobs = matched.map((action) => actionBlob(action)).join(" || ");
  for (const pattern of expectation.includesAll ?? []) {
    if (!matchesPattern(blobs, pattern)) {
      return `Expected ${expectation.description} payload to include ${String(pattern)}. Payloads: ${blobs}`;
    }
  }

  if (expectation.includesAny?.length) {
    const hasAny = expectation.includesAny.some((pattern) =>
      matchesPattern(blobs, pattern),
    );
    if (!hasAny) {
      return `Expected ${expectation.description} payload to include one of [${expectation.includesAny.map(String).join(", ")}]. Payloads: ${blobs}`;
    }
  }

  return undefined;
}

export function expectTurnToCallAction(expectation: ActionExpectation) {
  return (turn: ScenarioTurnExecution): ScenarioCheckResult =>
    validateActionExpectation(turn.actionsCalled, expectation);
}

export function expectScenarioToCallAction(expectation: ActionExpectation) {
  return (ctx: ScenarioContext): ScenarioCheckResult =>
    validateActionExpectation(ctx.actionsCalled, expectation);
}
