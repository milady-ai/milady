import baseConfig from "./real.config";

export const heavyOnlyE2EPaths = [
  "eliza/packages/agent/test/anvil-contracts.real.e2e.test.ts",
  "eliza/packages/app-core/test/app/memory-relationships.real.e2e.test.ts",
  "eliza/packages/app-core/test/app/onboarding-companion.live.e2e.test.ts",
  "eliza/packages/app-core/test/app/qa-checklist.real.e2e.test.ts",
];

export const defaultE2EInclude = [
  "eliza/packages/agent/test/cloud-auth.live.e2e.test.ts",
  "eliza/packages/agent/test/database-conversation.live.e2e.test.ts",
  "eliza/packages/agent/test/plugin-lifecycle.live.e2e.test.ts",
  "eliza/packages/agent/test/wallet-live.e2e.test.ts",
];

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: defaultE2EInclude,
    exclude: [...(baseConfig.test?.exclude ?? []), ...heavyOnlyE2EPaths],
  },
};
