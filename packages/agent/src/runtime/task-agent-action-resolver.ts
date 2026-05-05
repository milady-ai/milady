type ActionLike = {
  name?: string;
  similes?: string[];
  description?: string;
  parameters?: Array<{ name?: string }>;
};

const TASK_AGENT_CREATE_TASK_PARAM_NAMES = new Set([
  "task",
  "repo",
  "workdir",
  "agenttype",
  "approvalpreset",
  "agents",
  "label",
]);

const TASK_AGENT_CREATE_TASK_SIMILES = new Set([
  "START_CODING_TASK",
  "CODE_TASK",
  "START_AGENT_TASK",
  "LAUNCH_TASK",
  "CREATE_SUBTASK",
]);

const TASK_AGENT_CREATE_TASK_DESCRIPTION_RE =
  /\b(background task agents?|asynchronous task agents?|open-ended multi-step job|continue in the background|workspace automatically)\b/i;

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function isTaskAgentCreateTaskAction(action: ActionLike): boolean {
  const similes = Array.isArray(action.similes) ? action.similes : [];
  if (
    similes.some((simile) =>
      TASK_AGENT_CREATE_TASK_SIMILES.has(normalize(simile)),
    )
  ) {
    return true;
  }

  if (
    TASK_AGENT_CREATE_TASK_DESCRIPTION_RE.test(action.description ?? "")
  ) {
    return true;
  }

  const parameters = Array.isArray(action.parameters) ? action.parameters : [];
  return parameters.some((parameter) =>
    TASK_AGENT_CREATE_TASK_PARAM_NAMES.has(
      normalize(parameter?.name).toLowerCase(),
    ),
  );
}

export function shouldPreferTaskAgentCreateTask(
  parameters?: Record<string, unknown>,
): boolean {
  if (!parameters || typeof parameters !== "object") return false;
  return Object.keys(parameters).some((key) =>
    TASK_AGENT_CREATE_TASK_PARAM_NAMES.has(key.trim().toLowerCase()),
  );
}

export function pickPreferredCreateTaskAction<T extends ActionLike>(
  actions: T[],
  options?: {
    preferTaskAgent?: boolean;
  },
): T | null {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const exactMatches = actions.filter(
    (action) =>
      normalize(action.name) === "CREATE_TASK" ||
      normalize(action.name) === "START_CODING_TASK",
  );
  if (exactMatches.length === 0) return null;

  if (options?.preferTaskAgent) {
    const taskAgentAction = exactMatches.find(isTaskAgentCreateTaskAction);
    if (taskAgentAction) return taskAgentAction;
  }

  return exactMatches[0] ?? null;
}
