function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const PACKAGED_BOOTSTRAP_PARTITION = "persist:bootstrap-isolated";

function normalizePartition(partition: string): string {
  return partition.includes(":") ? partition : `persist:${partition}`;
}

export function resolveMainWindowPartition(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicitPartition = trimToNull(env.MILADY_DESKTOP_TEST_PARTITION);
  if (explicitPartition) {
    return normalizePartition(explicitPartition);
  }

  if (trimToNull(env.MILADY_DESKTOP_TEST_API_BASE)) {
    return PACKAGED_BOOTSTRAP_PARTITION;
  }

  return null;
}
