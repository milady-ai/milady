import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  LifeOpsDefinitionEntry,
  LifeOpsGoalEntry,
  SelectedLiveProvider,
  StartedLifeOpsLiveRuntime,
} from "./lifeops-live-harness.ts";
import {
  REPO_ROOT,
  assertNoProviderIssue,
  buildLifeActionPrompt,
  getReminderPreference,
  listDefinitionEntries,
  listGoalEntries,
  normalizeLiveText,
  postLiveConversationMessage,
  selectLifeOpsLiveProvider,
  startLifeOpsLiveRuntime,
  waitForTrajectoryCall,
} from "./lifeops-live-harness.ts";
import { createConversation } from "../../../../test/helpers/http.ts";

export type LifeActionPromptSpec = {
  action: string;
  intent: string;
  summary: string;
  title?: string;
};

export type ScenarioRoom = {
  id: string;
  source?: string;
  title?: string;
};

export type ScenarioTurn = {
  name: string;
  room?: string;
  source?: string;
  text?: string;
  lifeActionPrompt?: LifeActionPromptSpec;
  responseIncludesAll?: string[];
  responseIncludesAny?: string[];
  responseExcludes?: string[];
  plannerIncludesAll?: string[];
  plannerIncludesAny?: string[];
  plannerExcludes?: string[];
  attempts?: number;
  trajectoryTimeoutMs?: number;
};

type DefinitionCountDeltaCheck = {
  type: "definitionCountDelta";
  title: string;
  titleAliases?: string[];
  delta: number;
  cadenceKind?: string;
  requiredWindows?: string[];
  requiredSlots?: Array<{ label?: string; minuteOfDay?: number }>;
  requireReminderPlan?: boolean;
  websiteAccess?: {
    unlockMode?: string;
    unlockDurationMinutes?: number;
    websites?: string[];
  };
};

type ReminderIntensityCheck = {
  type: "reminderIntensity";
  title: string;
  titleAliases?: string[];
  expected: string;
};

type GoalCountDeltaCheck = {
  type: "goalCountDelta";
  title: string;
  titleAliases?: string[];
  delta: number;
  expectedStatus?: string;
  expectedReviewState?: string;
};

export type ScenarioFinalCheck =
  | DefinitionCountDeltaCheck
  | ReminderIntensityCheck
  | GoalCountDeltaCheck;

export type LifeOpsLiveScenario = {
  id: string;
  title: string;
  domain: string;
  description?: string;
  rooms?: ScenarioRoom[];
  turns: ScenarioTurn[];
  finalChecks?: ScenarioFinalCheck[];
};

export type ScenarioTurnReport = {
  conversationId: string;
  name: string;
  plannerResponse?: string;
  responseText: string;
  source: string;
  text: string;
  trajectoryId?: string;
};

export type ScenarioReport = {
  durationMs: number;
  error?: string;
  finalChecks: Array<{ label: string; status: "passed" | "failed"; detail: string }>;
  id: string;
  providerName: string;
  startedAt: string;
  status: "passed" | "failed";
  title: string;
  turns: ScenarioTurnReport[];
};

export type ScenarioMatrixReport = {
  completedAt: string;
  failedCount: number;
  providerName: string;
  scenarios: ScenarioReport[];
  startedAt: string;
  totalCount: number;
};

const DEFAULT_SCENARIO_DIR = path.join(REPO_ROOT, "test", "lifeops", "scenarios");

function normalizeText(text: string): string {
  return normalizeLiveText(text);
}

function assertIncludesAll(label: string, text: string, fragments?: string[]): void {
  if (!fragments || fragments.length === 0) {
    return;
  }

  const normalized = normalizeText(text);
  for (const fragment of fragments) {
    if (!normalized.includes(fragment.toLowerCase())) {
      throw new Error(`${label} did not include "${fragment}".\nactual=${text}`);
    }
  }
}

function assertIncludesAny(label: string, text: string, fragments?: string[]): void {
  if (!fragments || fragments.length === 0) {
    return;
  }

  const normalized = normalizeText(text);
  if (!fragments.some((fragment) => normalized.includes(fragment.toLowerCase()))) {
    throw new Error(
      `${label} did not include any of ${JSON.stringify(fragments)}.\nactual=${text}`,
    );
  }
}

function assertExcludes(label: string, text: string, fragments?: string[]): void {
  if (!fragments || fragments.length === 0) {
    return;
  }

  const normalized = normalizeText(text);
  for (const fragment of fragments) {
    if (normalized.includes(fragment.toLowerCase())) {
      throw new Error(`${label} unexpectedly included "${fragment}".\nactual=${text}`);
    }
  }
}

function definitionMatchesTitle(
  entry: LifeOpsDefinitionEntry,
  title: string,
  titleAliases: string[] = [],
): boolean {
  const normalizedTitle = normalizeText(String(entry.definition?.title ?? ""));
  return [title, ...titleAliases].some(
    (candidate) => normalizedTitle === normalizeText(candidate),
  );
}

function goalMatchesTitle(
  entry: LifeOpsGoalEntry,
  title: string,
  titleAliases: string[] = [],
): boolean {
  const normalizedTitle = normalizeText(String(entry.goal?.title ?? ""));
  return [title, ...titleAliases].some(
    (candidate) => normalizedTitle === normalizeText(candidate),
  );
}

function renderTurnText(turn: ScenarioTurn): string {
  if (typeof turn.text === "string" && turn.text.trim().length > 0) {
    return turn.text;
  }
  if (turn.lifeActionPrompt) {
    const prompt = turn.lifeActionPrompt;
    return buildLifeActionPrompt(
      prompt.summary,
      prompt.action,
      prompt.intent,
      prompt.title,
    );
  }
  throw new Error(`Scenario turn "${turn.name}" did not provide text.`);
}

async function createScenarioRooms(
  runtime: StartedLifeOpsLiveRuntime,
  scenario: LifeOpsLiveScenario,
): Promise<Map<string, { conversationId: string; source: string }>> {
  const rooms = scenario.rooms?.length
    ? scenario.rooms
    : [{ id: "main", source: "discord", title: scenario.title }];

  const created = new Map<string, { conversationId: string; source: string }>();
  for (const room of rooms) {
    const conversation = await createConversation(runtime.port, {
      title: room.title ?? `${scenario.title} (${room.id})`,
    });
    created.set(room.id, {
      conversationId: conversation.conversationId,
      source: room.source ?? "discord",
    });
  }

  return created;
}

async function collectScenarioBaseline(
  runtime: StartedLifeOpsLiveRuntime,
  scenario: LifeOpsLiveScenario,
): Promise<{
  definitionCounts: Map<string, number>;
  goalCounts: Map<string, number>;
}> {
  const definitionTitles = new Set<string>();
  const goalTitles = new Set<string>();

  for (const check of scenario.finalChecks ?? []) {
    if (check.type === "definitionCountDelta" || check.type === "reminderIntensity") {
      definitionTitles.add(check.title);
      continue;
    }
    if (check.type === "goalCountDelta") {
      goalTitles.add(check.title);
    }
  }

  const definitions = await listDefinitionEntries(runtime.port);
  const goals = await listGoalEntries(runtime.port);

  const definitionCounts = new Map<string, number>();
  for (const title of definitionTitles) {
    const matchingChecks = (scenario.finalChecks ?? []).filter(
      (check): check is DefinitionCountDeltaCheck | ReminderIntensityCheck =>
        (check.type === "definitionCountDelta" ||
          check.type === "reminderIntensity") &&
        check.title === title,
    );
    const titleAliases = matchingChecks.flatMap((check) => check.titleAliases ?? []);
    definitionCounts.set(
      title,
      definitions.filter((entry) =>
        definitionMatchesTitle(entry, title, titleAliases),
      ).length,
    );
  }

  const goalCounts = new Map<string, number>();
  for (const title of goalTitles) {
    const matchingChecks = (scenario.finalChecks ?? []).filter(
      (check): check is GoalCountDeltaCheck =>
        check.type === "goalCountDelta" && check.title === title,
    );
    const titleAliases = matchingChecks.flatMap((check) => check.titleAliases ?? []);
    goalCounts.set(
      title,
      goals.filter((entry) => goalMatchesTitle(entry, title, titleAliases)).length,
    );
  }

  return { definitionCounts, goalCounts };
}

async function validateFinalChecks(args: {
  baseline: Awaited<ReturnType<typeof collectScenarioBaseline>>;
  runtime: StartedLifeOpsLiveRuntime;
  scenario: LifeOpsLiveScenario;
}): Promise<Array<{ label: string; status: "passed" | "failed"; detail: string }>> {
  const results: Array<{ label: string; status: "passed" | "failed"; detail: string }> = [];
  const definitions = await listDefinitionEntries(args.runtime.port);
  const goals = await listGoalEntries(args.runtime.port);

  for (const check of args.scenario.finalChecks ?? []) {
    const label = `${args.scenario.id}:${check.type}:${check.title}`;
    try {
      if (check.type === "definitionCountDelta") {
        const matches = definitions.filter((entry) =>
          definitionMatchesTitle(entry, check.title, check.titleAliases),
        );
        const beforeCount = args.baseline.definitionCounts.get(check.title) ?? 0;
        const delta = matches.length - beforeCount;
        if (delta !== check.delta) {
          throw new Error(
            `expected definition delta ${check.delta} for "${check.title}" but saw ${delta}`,
          );
        }

        const latest = matches[matches.length - 1];
        if (check.delta > 0 && !latest) {
          throw new Error(`expected to find "${check.title}" after the scenario`);
        }
        if (latest && check.cadenceKind) {
          const cadence =
            latest.definition?.cadence &&
            typeof latest.definition.cadence === "object"
              ? (latest.definition.cadence as Record<string, unknown>)
              : null;
          if (String(cadence?.kind ?? "") !== check.cadenceKind) {
            throw new Error(
              `expected cadence kind ${check.cadenceKind} but saw ${String(cadence?.kind ?? "")}`,
            );
          }
          if (check.requiredWindows?.length) {
            const windows = Array.isArray(cadence?.windows)
              ? cadence.windows.map((entry) => String(entry))
              : [];
            for (const window of check.requiredWindows) {
              if (!windows.includes(window)) {
                throw new Error(`expected cadence window "${window}"`);
              }
            }
          }
          if (check.requiredSlots?.length) {
            const slots = Array.isArray(cadence?.slots)
              ? cadence.slots
              : [];
            for (const requiredSlot of check.requiredSlots) {
              const matchedSlot = slots.find((candidate) => {
                if (!candidate || typeof candidate !== "object") {
                  return false;
                }
                const slot = candidate as Record<string, unknown>;
                if (
                  typeof requiredSlot.label === "string" &&
                  String(slot.label ?? "") !== requiredSlot.label
                ) {
                  return false;
                }
                if (
                  typeof requiredSlot.minuteOfDay === "number" &&
                  Number(slot.minuteOfDay ?? -1) !== requiredSlot.minuteOfDay
                ) {
                  return false;
                }
                return true;
              });
              if (!matchedSlot) {
                throw new Error(
                  `missing required slot ${JSON.stringify(requiredSlot)}`,
                );
              }
            }
          }
        }

        if (latest && check.requireReminderPlan) {
          const reminderPlanId = String(latest.reminderPlan?.id ?? "");
          if (!reminderPlanId) {
            throw new Error(`expected a reminder plan for "${check.title}"`);
          }
        }

        if (latest && check.websiteAccess) {
          const websiteAccess =
            latest.definition?.websiteAccess &&
            typeof latest.definition.websiteAccess === "object"
              ? (latest.definition.websiteAccess as Record<string, unknown>)
              : null;
          if (
            check.websiteAccess.unlockMode &&
            String(websiteAccess?.unlockMode ?? "") !==
              check.websiteAccess.unlockMode
          ) {
            throw new Error(
              `expected websiteAccess.unlockMode=${check.websiteAccess.unlockMode}`,
            );
          }
          if (
            typeof check.websiteAccess.unlockDurationMinutes === "number" &&
            Number(websiteAccess?.unlockDurationMinutes ?? -1) !==
              check.websiteAccess.unlockDurationMinutes
          ) {
            throw new Error(
              `expected websiteAccess.unlockDurationMinutes=${check.websiteAccess.unlockDurationMinutes}`,
            );
          }
          if (check.websiteAccess.websites?.length) {
            const websites = Array.isArray(websiteAccess?.websites)
              ? websiteAccess.websites.map((entry) => String(entry))
              : [];
            for (const website of check.websiteAccess.websites) {
              if (!websites.includes(website)) {
                throw new Error(`expected website "${website}"`);
              }
            }
          }
        }
      } else if (check.type === "reminderIntensity") {
        const matches = definitions.filter((entry) =>
          definitionMatchesTitle(entry, check.title, check.titleAliases),
        );
        const latest = matches[matches.length - 1];
        const definitionId = String(latest?.definition?.id ?? "");
        if (!definitionId) {
          throw new Error(`could not resolve a definition id for "${check.title}"`);
        }
        const preference = await getReminderPreference(args.runtime.port, definitionId);
        const effective =
          preference.effective && typeof preference.effective === "object"
            ? (preference.effective as Record<string, unknown>)
            : null;
        if (String(effective?.intensity ?? "") !== check.expected) {
          throw new Error(
            `expected reminder intensity ${check.expected} but saw ${String(effective?.intensity ?? "")}`,
          );
        }
      } else if (check.type === "goalCountDelta") {
        const matches = goals.filter((entry) =>
          goalMatchesTitle(entry, check.title, check.titleAliases),
        );
        const beforeCount = args.baseline.goalCounts.get(check.title) ?? 0;
        const delta = matches.length - beforeCount;
        if (delta !== check.delta) {
          throw new Error(
            `expected goal delta ${check.delta} for "${check.title}" but saw ${delta}`,
          );
        }
        const latest = matches[matches.length - 1];
        if (check.delta > 0 && !latest) {
          throw new Error(`expected to find goal "${check.title}"`);
        }
        if (
          latest &&
          check.expectedStatus &&
          String(latest.goal?.status ?? "") !== check.expectedStatus
        ) {
          throw new Error(`expected goal status ${check.expectedStatus}`);
        }
        if (
          latest &&
          check.expectedReviewState &&
          String(latest.goal?.reviewState ?? "") !== check.expectedReviewState
        ) {
          throw new Error(
            `expected goal reviewState ${check.expectedReviewState}`,
          );
        }
      }

      results.push({ label, status: "passed", detail: "ok" });
    } catch (error) {
      results.push({
        label,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return results;
}

export async function runLifeOpsLiveScenario(args: {
  runtime: StartedLifeOpsLiveRuntime;
  scenario: LifeOpsLiveScenario;
}): Promise<ScenarioReport> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const turns: ScenarioTurnReport[] = [];
  const baseline = await collectScenarioBaseline(args.runtime, args.scenario);

  try {
    const rooms = await createScenarioRooms(args.runtime, args.scenario);

    for (const turn of args.scenario.turns) {
      const room = rooms.get(turn.room ?? "main");
      if (!room) {
        throw new Error(
          `Scenario "${args.scenario.id}" referenced an unknown room "${turn.room ?? "main"}"`,
        );
      }

      const text = renderTurnText(turn);
      const responseText = await postLiveConversationMessage(
        args.runtime,
        room.conversationId,
        text,
        turn.name,
        turn.attempts ?? 3,
        turn.source ?? room.source,
      );
      assertNoProviderIssue(turn.name, responseText, args.runtime);
      assertIncludesAll(`${turn.name} response`, responseText, turn.responseIncludesAll);
      assertIncludesAny(`${turn.name} response`, responseText, turn.responseIncludesAny);
      assertExcludes(`${turn.name} response`, responseText, turn.responseExcludes);

      let plannerResponse = "";
      let trajectoryId = "";
      if (
        turn.plannerIncludesAll?.length ||
        turn.plannerIncludesAny?.length ||
        turn.plannerExcludes?.length
      ) {
        const trajectory = await waitForTrajectoryCall(
          args.runtime.port,
          text,
          turn.trajectoryTimeoutMs,
        );
        plannerResponse = String(trajectory.llmCall.response ?? "");
        trajectoryId = trajectory.trajectoryId;
        assertIncludesAll(
          `${turn.name} planner`,
          plannerResponse,
          turn.plannerIncludesAll,
        );
        assertIncludesAny(
          `${turn.name} planner`,
          plannerResponse,
          turn.plannerIncludesAny,
        );
        assertExcludes(
          `${turn.name} planner`,
          plannerResponse,
          turn.plannerExcludes,
        );
      }

      turns.push({
        conversationId: room.conversationId,
        name: turn.name,
        plannerResponse: plannerResponse || undefined,
        responseText,
        source: turn.source ?? room.source,
        text,
        trajectoryId: trajectoryId || undefined,
      });
    }

    const finalChecks = await validateFinalChecks({
      baseline,
      runtime: args.runtime,
      scenario: args.scenario,
    });

    return {
      durationMs: Date.now() - startedMs,
      finalChecks,
      id: args.scenario.id,
      providerName: args.runtime.providerName,
      startedAt,
      status: "passed",
      title: args.scenario.title,
      turns,
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedMs,
      error: error instanceof Error ? error.message : String(error),
      finalChecks: [],
      id: args.scenario.id,
      providerName: args.runtime.providerName,
      startedAt,
      status: "failed",
      title: args.scenario.title,
      turns,
    };
  }
}

export async function loadLifeOpsScenarioCatalog(
  dir: string = DEFAULT_SCENARIO_DIR,
): Promise<LifeOpsLiveScenario[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const scenarios: LifeOpsLiveScenario[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(dir, entry.name);
    const raw = await readFile(filePath, "utf8");
    scenarios.push(JSON.parse(raw) as LifeOpsLiveScenario);
  }

  scenarios.sort((left, right) => left.id.localeCompare(right.id));
  return scenarios;
}

export async function runLifeOpsScenarioMatrix(options?: {
  isolate?: "shared" | "per-scenario";
  reportPath?: string;
  scenarioIds?: string[];
  selectedProvider?: SelectedLiveProvider | null;
}): Promise<{ report: ScenarioMatrixReport; reportPath: string }> {
  const catalog = await loadLifeOpsScenarioCatalog();
  const selectedIds = new Set(options?.scenarioIds ?? []);
  const scenarios =
    selectedIds.size > 0
      ? catalog.filter((scenario) => selectedIds.has(scenario.id))
      : catalog;

  if (scenarios.length === 0) {
    throw new Error("No LifeOps scenarios matched the requested selection.");
  }

  const selectedProvider =
    options?.selectedProvider ?? (await selectLifeOpsLiveProvider());
  if (!selectedProvider) {
    throw new Error("No live provider is configured for the LifeOps scenario run.");
  }

  const isolate = options?.isolate ?? "shared";
  const reports: ScenarioReport[] = [];
  let sharedRuntime: StartedLifeOpsLiveRuntime | null = null;

  if (isolate === "shared") {
    sharedRuntime = await startLifeOpsLiveRuntime({ selectedProvider });
  }

  try {
    for (const scenario of scenarios) {
      const runtime =
        isolate === "shared"
          ? (sharedRuntime as StartedLifeOpsLiveRuntime)
          : await startLifeOpsLiveRuntime({ selectedProvider });

      try {
        reports.push(await runLifeOpsLiveScenario({ runtime, scenario }));
      } finally {
        if (isolate === "per-scenario") {
          await runtime.close();
        }
      }
    }
  } finally {
    if (sharedRuntime) {
      await sharedRuntime.close();
    }
  }

  const report: ScenarioMatrixReport = {
    completedAt: new Date().toISOString(),
    failedCount: reports.filter((entry) => entry.status === "failed").length,
    providerName: selectedProvider.name,
    scenarios: reports,
    startedAt:
      reports.length > 0 ? reports[0].startedAt : new Date().toISOString(),
    totalCount: reports.length,
  };

  const reportPath =
    options?.reportPath ??
    path.join(
      REPO_ROOT,
      ".tmp",
      `lifeops-scenario-report-${Date.now()}.json`,
    );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, reportPath };
}
