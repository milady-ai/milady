const defaultEndpoint =
  process.env.BOTDICK_HOMEPAGE_EVENTS_URL || "https://botdick.com/api/events";
const defaultAutomationEndpoint =
  process.env.BOTDICK_HOMEPAGE_AUTOMATION_URL || "https://botdick.com/api/automations/run";
const defaultTasksEndpoint =
  process.env.BOTDICK_HOMEPAGE_TASKS_URL || "https://botdick.com/api/tasks";

export async function postBotdickEvent(event, options = {}) {
  const endpoint = options.endpoint || defaultEndpoint;
  const token = options.token || process.env.BOTDICK_INGEST_TOKEN || "";
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`botdick homepage event failed ${response.status}: ${text}`);
  }

  return data;
}

export async function runBotdickAutomation(task = "project-ideas", input = {}, options = {}) {
  const endpoint = options.endpoint || defaultAutomationEndpoint;
  const token = options.token || process.env.BOTDICK_INGEST_TOKEN || "";
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...input,
      task,
    }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`botdick automation failed ${response.status}: ${text}`);
  }

  return data;
}

export async function createBotdickTask(input = {}, options = {}) {
  return postJson(options.endpoint || defaultTasksEndpoint, input, options);
}

export async function advanceBotdickTask(taskId, stage, input = {}, options = {}) {
  return postJson(`${options.endpoint || defaultTasksEndpoint}/progress`, {
    ...input,
    taskId,
    stage,
  }, options);
}

export function xViewEvent({ title, body, url, status = "viewed", meta = {} }) {
  return {
    type: "x_view",
    station: "social",
    title: title || "Viewed X",
    body: body || "Botdick checked X and reported the result.",
    url: url || "https://x.com/bot_dick_",
    status,
    meta,
  };
}

export function vpsStatusEvent({ title, body, status = "running", meta = {} }) {
  return {
    type: "vps_status",
    station: "vps",
    title: title || "VPS status",
    body: body || "Botdick checked the live VPS process and workspace.",
    status,
    meta,
  };
}

export function heartbeatEvent({ title, body, status = "alive", source = "botdick", meta = {} } = {}) {
  return {
    type: "heartbeat",
    station: "vps",
    title: title || "Runtime heartbeat",
    body: body || "Botdick runtime checked in.",
    status,
    meta: {
      ...meta,
      source,
    },
  };
}

export function xDraftEvent({ title, body, url, status = "drafted", meta = {} }) {
  return {
    type: "x_draft",
    station: "social",
    title: title || "Drafted X post",
    body: body || "Botdick drafted a post and is waiting for approval.",
    url: url || "https://x.com/bot_dick_",
    status,
    meta,
  };
}

export function taskEvent({ title, body, station = "intake", status = "started", meta = {} }) {
  return {
    type: "task",
    station,
    title,
    body,
    status,
    meta,
  };
}

export function actionEvent({
  action,
  title,
  body,
  station,
  status = "started",
  url = "",
  image = "",
  meta = {},
}) {
  return {
    type: "action_started",
    action,
    station,
    title: title || action || "Action started",
    body: body || "",
    status,
    url,
    image,
    meta,
  };
}

export function toolCallEvent({
  tool,
  toolName,
  command = "",
  title,
  body,
  station = "build",
  status = "running",
  cwd = "",
  sessionId = "",
  taskId = "",
  meta = {},
}) {
  const name = toolName || tool || "tool";
  return {
    type: command ? "command_run" : "tool_call",
    action: name,
    station,
    title: title || (command ? `${name}: ${command}` : `${name} tool call`),
    body: body || (command ? `command: ${command}` : `Botdick invoked ${name}.`),
    status,
    meta: {
      ...meta,
      tool: name,
      command,
      cwd,
      sessionId,
      taskId,
    },
  };
}

export function screenshotEvent({
  title,
  body,
  url = "",
  image = "",
  status = "captured",
  meta = {},
}) {
  return {
    type: "screenshot",
    station: "browser",
    title: title || "Screenshot captured",
    body: body || "Botdick captured a visible proof screenshot.",
    url,
    image,
    status,
    meta,
  };
}

export function imageGenerationEvent({
  title,
  body,
  prompt,
  status = "generating",
  url = "",
  image = "",
  meta = {},
}) {
  return {
    type: status === "generated" || status === "finished" || status === "complete" ? "image_generated" : "image_generation",
    action: "GENERATE_IMAGE",
    station: "browser",
    title: title || "Generating image",
    body: body || prompt || "Botdick started an image generation action.",
    status,
    url,
    image,
    meta: {
      ...meta,
      prompt,
    },
  };
}

export function projectIdeaEvent({ title, body, nextStep, status = "idea", meta = {} }) {
  return {
    type: "project_idea",
    station: "build",
    title,
    body,
    status,
    meta: {
      ...meta,
      nextStep,
    },
  };
}

async function postJson(endpoint, payload, options = {}) {
  const token = options.token || process.env.BOTDICK_INGEST_TOKEN || "";
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`botdick task API failed ${response.status}: ${text}`);
  }

  return data;
}
