import type { ScenarioFinalCheck } from "@elizaos/scenario-schema";
import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

type ConnectorTurnConfig = {
  name: string;
  text: string;
  responseIncludesAny: Array<string | RegExp>;
  acceptedActions: string[];
  includesAny?: Array<string | RegExp>;
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
      text: turn.text,
      assertTurn: expectTurnToCallAction({
        acceptedActions: turn.acceptedActions,
        description: `${config.connector} connector step "${turn.name}"`,
        includesAny: turn.includesAny,
      }),
      responseIncludesAny: turn.responseIncludesAny,
    })),
    finalChecks: [
      {
        type: "selectedAction",
        actionName: acceptedActions,
      },
      ...(config.finalChecks ?? []),
      {
        type: "custom",
        name: `${config.id}-action-coverage`,
        predicate: expectScenarioToCallAction({
          acceptedActions,
          description: `${config.connector} connector certification`,
          includesAny,
        }),
      },
    ],
  });
}
