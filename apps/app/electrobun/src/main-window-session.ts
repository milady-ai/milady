function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveMainWindowPartition(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicitPartition = trimToNull(env.MILADY_DESKTOP_TEST_PARTITION);
  if (explicitPartition) {
    return explicitPartition;
  }

  return null;
}
