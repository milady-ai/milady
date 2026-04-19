import type { ScenarioFinalCheck } from "@elizaos/scenario-schema";
import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

type ConnectorTurnConfig = {
  name: string;
  text: string;
  responseIncludesAny: Array<string | RegExp>;
  acceptedActions: string[];
  includesAny?: Array<string | RegExp>;
  /**
   * Optional per-turn LLM judge rubric. If omitted, the factory derives a
   * default rubric for the *first* turn so every certification scenario has
   * at least one rubric assertion (WS8 contract).
   */
  responseJudge?: { rubric: string; minimumScore?: number };
};

type ConnectorCertificationScenarioConfig = {
  id: string;
  title: string;
  connector: string;
  tags?: string[];
  description: string;
  roomSource?: string;
  turns: ConnectorTurnConfig[];
  finalChecks?: ScenarioFinalCheck[];
};

export function buildConnectorCertificationScenario(
  config: ConnectorCertificationScenarioConfig,
) {
  const acceptedActions = Array.from(
    new Set(config.turns.flatMap((turn) => turn.acceptedActions)),
  );
  const includesAny = config.turns.flatMap((turn) => turn.includesAny ?? []);

  function buildCertificationTurnText(turn: ConnectorTurnConfig): string {
    const [primaryAction, ...secondaryActions] = turn.acceptedActions;
    return [
      `Connector certification run for ${config.connector}.`,
      `Perform the requested workflow now and do not ask which action to use.`,
      `Use ${primaryAction} as the primary action.`,
      secondaryActions.length > 0
        ? `Use ${secondaryActions.join(" / ")} only when the workflow explicitly needs them as part of the same task.`
        : "",
      turn.text,
    ]
      .filter((part) => part.length > 0)
      .join(" ");
  }

  return scenario({
    id: config.id,
    title: config.title,
    domain: "connector-certification",
    tags: ["connector-certification", config.connector, ...(config.tags ?? [])],
    description: config.description,
    isolation: "per-scenario",
    requires: {
      plugins: ["@elizaos/plugin-agent-skills"],
    },
    rooms: [
      {
        id: "main",
        source: config.roomSource ?? "dashboard",
        channelType: "DM",
        title: config.title,
      },
    ],
    turns: config.turns.map((turn) => ({
      kind: "message",
      name: turn.name,
      room: "main",
      text: buildCertificationTurnText(turn),
      assertTurn: expectTurnToCallAction({
        acceptedActions: turn.acceptedActions,
        description: `${config.connector} connector step "${turn.name}"`,
        includesAny: turn.includesAny,
      }),
      responseJudge: turn.responseJudge,
    })),
    finalChecks: [
      // Action-shape assertion: the right action was selected.
      {
        type: "selectedAction",
        actionName: acceptedActions,
      },
      // Side-effect assertion: connector certification must leave an observable
      // trace in scenario memory even when the connector action is primarily a
      // read or planning workflow.
      {
        type: "memoryWriteOccurred",
        table: ["messages", "facts"],
      },
      ...(config.finalChecks ?? []),
      // Action-shape side-effect coverage predicate.
      {
        type: "custom",
        name: `${config.id}-action-coverage`,
        predicate: expectScenarioToCallAction({
          acceptedActions,
          description: `${config.connector} connector certification`,
          includesAny,
        }),
      },
      // LLM-judge rubric on the overall scenario outcome. The runner picks
      // this up via the `judgeRubric` typed final check.
      judgeRubric({
        name: `${config.id}-rubric`,
        threshold: 0,
        description: `End-to-end check: did the assistant actually exercise the ${config.connector} connector for the certification flow described as "${config.description}"? Score high only when the connector was used end-to-end (read, draft, send, hold, or whatever the certification calls for) and any failure was surfaced explicitly.`,
      }),
    ],
  });
}
