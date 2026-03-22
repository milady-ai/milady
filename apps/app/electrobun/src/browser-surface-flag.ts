export function isBrowserSurfaceEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const normalized = env.MILADY_ENABLE_BROWSER_SURFACE?.trim().toLowerCase();

  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  );
}
