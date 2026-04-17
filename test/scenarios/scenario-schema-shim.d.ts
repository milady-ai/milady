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
    | void
    | undefined
    | Promise<string | undefined | void>;

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
    by?: string;
    connector?: string;
    provider?: string;
    state?: string;
    capabilities?: string[];
    scopes?: string[];
    limit?: number;
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
        type: "selectedAction";
        actionName: string | string[];
        [key: string]: unknown;
      }
    | {
        type: "selectedActionArguments";
        actionName: string | string[];
        includesAny?: Array<string | RegExp>;
        includesAll?: Array<string | RegExp>;
        [key: string]: unknown;
      }
    | {
        type: "clarificationRequested";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "interventionRequestExists";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "pushSent";
        channel: string | string[];
        [key: string]: unknown;
      }
    | {
        type: "pushEscalationOrder";
        channelOrder: string[];
        [key: string]: unknown;
      }
    | {
        type: "pushAcknowledgedSync";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "approvalRequestExists";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "draftExists";
        channel?: string | string[];
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "messageDelivered";
        channel?: string | string[];
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "browserTaskCompleted";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "browserTaskNeedsHuman";
        expected?: boolean;
        [key: string]: unknown;
      }
    | {
        type: "uploadedAssetExists";
        expected?: boolean;
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
