declare module "@elizaos/scenario-schema" {
  export type CapturedAction = {
    actionName: string;
    parameters?: unknown;
    result?: {
      success?: boolean;
      data?: unknown;
      values?: unknown;
      text?: string;
    };
    error?: {
      message?: string;
    };
  };

  export type ScenarioTurnExecution = {
    actionsCalled: CapturedAction[];
    responseText?: string;
    plannerText?: string;
  };

  export type ScenarioCheckResult =
    | string
    | undefined
    | Promise<string | undefined>;

  export type ScenarioAssertResponse =
    | ((text: string) => ScenarioCheckResult)
    | ((status: number, body: unknown) => ScenarioCheckResult);

  export type ScenarioContext = {
    runtime?: unknown;
    actionsCalled: CapturedAction[];
    turns?: ScenarioTurnExecution[];
  };

  export type ScenarioSeedStep = {
    type: string;
    name?: string;
    apply?: (ctx: ScenarioContext) => ScenarioCheckResult;
    [key: string]: unknown;
  };

  export type ScenarioTurn = {
    kind?: string;
    name: string;
    text?: string;
    assertResponse?: ScenarioAssertResponse;
    assertTurn?: (turn: ScenarioTurnExecution) => ScenarioCheckResult;
    [key: string]: unknown;
  };

  export type ScenarioFinalCheck =
    | {
        type: "custom";
        name: string;
        predicate: (ctx: ScenarioContext) => ScenarioCheckResult;
        [key: string]: unknown;
      }
    | {
        type: "actionCalled";
        actionName: string;
        status?: string;
        minCount?: number;
        [key: string]: unknown;
      }
    | {
        type: string;
        [key: string]: unknown;
      };

  export type ScenarioDefinition = {
    id: string;
    title: string;
    domain: string;
    turns: ScenarioTurn[];
    seed?: ScenarioSeedStep[];
    finalChecks?: ScenarioFinalCheck[];
    [key: string]: unknown;
  };

  export function scenario<const T extends ScenarioDefinition>(value: T): T;
}
