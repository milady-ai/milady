import process from "node:process";

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Milady entrypoints should consistently default to the Milady namespace even
 * when they bypass the CLI/profile bootstrap path.
 */
export function ensureMiladyNamespaceDefaults(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const resolvedNamespace =
    trimEnvValue(env.MILADY_NAMESPACE) ??
    trimEnvValue(env.ELIZA_NAMESPACE) ??
    "milady";

  if (!trimEnvValue(env.MILADY_NAMESPACE)) {
    env.MILADY_NAMESPACE = resolvedNamespace;
  }
  if (!trimEnvValue(env.ELIZA_NAMESPACE)) {
    env.ELIZA_NAMESPACE = resolvedNamespace;
  }
}

ensureMiladyNamespaceDefaults();
