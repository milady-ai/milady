const service = "agentic-electrobun-app";

// Bun.secrets is useful for local app credentials because it uses the OS credential store.
// Treat it as an API that may evolve; keep production/cloud deployment secrets in the
// deployment secret manager or environment, not in a checked-in file.
export async function getSecret(name: string): Promise<string | null> {
  return Bun.secrets.get({ service, name });
}

export async function setSecret(name: string, value: string): Promise<void> {
  await Bun.secrets.set({ service, name, value });
}

export async function deleteSecret(name: string): Promise<boolean> {
  return Bun.secrets.delete({ service, name });
}
