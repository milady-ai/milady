function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Steward-managed cloud containers should skip local pairing and onboarding UI.
 *
 * This is intentionally narrower than the generic API-token contract: the
 * Steward runtime sets a dedicated outbound token that marks the container as
 * platform-managed, while direct client requests remain governed by the normal
 * inbound auth checks.
 */
export function isCloudProvisionedContainer(): boolean {
  const hasCloudFlag =
    process.env.MILADY_CLOUD_PROVISIONED === "1" ||
    process.env.ELIZA_CLOUD_PROVISIONED === "1";

  return hasCloudFlag && hasValue(process.env.STEWARD_AGENT_TOKEN);
}
