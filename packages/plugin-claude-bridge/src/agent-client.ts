const AGENT_URL = process.env.CLAUDE_AGENT_URL ?? "http://localhost:3100";
const ELIZA_PORT = process.env.API_PORT ?? process.env.SERVER_PORT ?? "2138";

export function getAgentUrl(): string {
  return AGENT_URL;
}

export function getCallbackUrl(): string {
  return `http://localhost:${ELIZA_PORT}/api/claude-agent/callback`;
}

export async function submitTask(
  type: string,
  prompt: string,
  cwd?: string,
): Promise<{ id: string; status: string }> {
  const resp = await fetch(`${AGENT_URL}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      prompt,
      cwd: cwd ?? "/opt/apps",
      callbackUrl: getCallbackUrl(),
      stream: false,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Agent service returned ${resp.status}`);
  }

  return resp.json() as Promise<{ id: string; status: string }>;
}

export async function isAgentOnline(): Promise<boolean> {
  try {
    const resp = await fetch(`${AGENT_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
