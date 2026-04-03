export type OnboardingRunMode = "local" | "cloud" | "";

export type OnboardingServerTarget = "" | "local" | "remote" | "elizacloud";

export interface OnboardingServerSelection {
  runMode: OnboardingRunMode;
  cloudProvider: string;
}

export function resolveOnboardingServerTarget(args: {
  runMode: OnboardingRunMode;
  cloudProvider?: string | null;
}): OnboardingServerTarget {
  if (args.runMode === "local") {
    return "local";
  }

  if (args.runMode === "cloud" && args.cloudProvider === "remote") {
    return "remote";
  }

  if (args.runMode === "cloud") {
    return "elizacloud";
  }

  return "";
}

export function buildOnboardingServerSelection(
  target: OnboardingServerTarget,
): OnboardingServerSelection {
  switch (target) {
    case "local":
      return { runMode: "local", cloudProvider: "" };
    case "remote":
      return { runMode: "cloud", cloudProvider: "remote" };
    case "elizacloud":
      return { runMode: "cloud", cloudProvider: "elizacloud" };
    case "":
      return { runMode: "", cloudProvider: "" };
  }
}

export function activeServerKindToOnboardingServerTarget(
  kind: "local" | "cloud" | "remote",
): Exclude<OnboardingServerTarget, ""> {
  switch (kind) {
    case "local":
      return "local";
    case "cloud":
      return "elizacloud";
    case "remote":
      return "remote";
  }
}
