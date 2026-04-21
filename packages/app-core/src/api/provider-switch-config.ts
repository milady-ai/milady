export * from "@miladyai/agent/api/provider-switch-config";

import { applyOnboardingConnectionConfig as upstreamApplyOnboardingConnectionConfig } from "@miladyai/agent/api/provider-switch-config";

export async function applyOnboardingConnectionConfig(
  ...args: Parameters<typeof upstreamApplyOnboardingConnectionConfig>
): Promise<
  Awaited<ReturnType<typeof upstreamApplyOnboardingConnectionConfig>>
> {
  // Keep app-core aligned with the agent implementation.
  // Anthropic subscription links are preserved for task agents without
  // creating a main-runtime llmText route, so this wrapper should remain a
  // transparent pass-through.
  await upstreamApplyOnboardingConnectionConfig(...args);
}
