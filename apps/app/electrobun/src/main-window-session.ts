export const PACKAGED_WINDOWS_BOOTSTRAP_PARTITION =
  "persist:bootstrap-isolated";

type Renderer = "native" | "cef";

type BuildInfo = {
  defaultRenderer: Renderer;
  availableRenderers: Renderer[];
};

function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePersistentPartition(partition: string): string {
  return partition.includes(":") ? partition : `persist:${partition}`;
}

export function resolveMainWindowPartition(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = trimToNull(env.MILADY_DESKTOP_TEST_PARTITION);
  if (explicit) {
    return normalizePersistentPartition(explicit);
  }

  if (trimToNull(env.MILADY_DESKTOP_TEST_API_BASE)) {
    // The Windows smoke harness redirects APPDATA/LOCALAPPDATA before launch,
    // so the bootstrap renderer can now use a persistent isolated partition.
    return PACKAGED_WINDOWS_BOOTSTRAP_PARTITION;
  }

  return null;
}

export function resolveBootstrapShellRenderer(buildInfo: BuildInfo): Renderer {
  if (buildInfo.availableRenderers.includes("native")) {
    return "native";
  }
  return buildInfo.defaultRenderer;
}

export function resolveBootstrapViewRenderer(buildInfo: BuildInfo): Renderer {
  if (buildInfo.availableRenderers.includes("cef")) {
    return "cef";
  }
  return buildInfo.defaultRenderer;
}
