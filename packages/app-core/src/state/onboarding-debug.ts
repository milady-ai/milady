/**
 * Opt-in debug logging for onboarding submission and related flows.
 *
 * Enable any of:
 * - `VITE_DEBUG_ONBOARDING=true` in env (build-time)
 * - `localStorage.setItem("milady:debug:onboarding", "1")` then refresh
 */

export function isOnboardingDebugEnabled(): boolean {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("milady:debug:onboarding") === "1"
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const env = import.meta as ImportMeta & {
      env?: Record<string, string | boolean | undefined>;
    };
    if (env.env?.VITE_DEBUG_ONBOARDING === "true") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function logOnboardingDebug(...args: unknown[]): void {
  if (!isOnboardingDebugEnabled()) return;
  console.debug("[onboarding:debug]", ...args);
}

/** Safe summary for logs — never includes secret values. */
export function summarizeOnboardingSubmitPayload(payload: Record<string, unknown>): {
  topLevelKeys: string[];
  deploymentTarget: unknown;
  hasLinkedAccounts: boolean;
  hasServiceRouting: boolean;
  credentialInputKeys: string[];
} {
  return {
    topLevelKeys: Object.keys(payload).sort(),
    deploymentTarget: payload.deploymentTarget,
    hasLinkedAccounts: Boolean(payload.linkedAccounts),
    hasServiceRouting: Boolean(payload.serviceRouting),
    credentialInputKeys:
      payload.credentialInputs && typeof payload.credentialInputs === "object"
        ? Object.keys(payload.credentialInputs as Record<string, unknown>)
        : [],
  };
}
