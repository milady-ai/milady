export function shouldUseCloudOnlyBranding(options: {
  isDev: boolean;
  injectedApiBase?: string | null;
}): boolean {
  if (options.isDev) return false;

  // Desktop shells inject an explicit backend before React boots. When that
  // happens, the renderer should follow the host backend's capabilities rather
  // than hard-coding the production web cloud-only preset.
  const injectedApiBase = options.injectedApiBase?.trim();
  if (injectedApiBase) return false;

  return true;
}
