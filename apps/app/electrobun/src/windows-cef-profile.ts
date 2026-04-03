function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function shouldResetWindowsCefProfile(args: {
  currentVersion: string | null;
  previousVersion: string | null;
  cefDirExists: boolean;
}): boolean {
  if (!args.cefDirExists) return false;
  const currentVersion = trimToNull(args.currentVersion);
  if (!currentVersion || currentVersion === "unknown") return false;
  const previousVersion = trimToNull(args.previousVersion);
  return previousVersion !== currentVersion;
}

export function shouldWriteWindowsCefProfileMarker(
  currentVersion: string | null,
): boolean {
  const normalized = trimToNull(currentVersion);
  return Boolean(normalized && normalized !== "unknown");
}
