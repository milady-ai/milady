// Shorthand ambient declarations for @elizaos/app-* packages whose source
// doesn't live in the local eliza submodule at typecheck time. These suppress
// TS2307/TS2882 errors; actual module resolution happens at bundle time via
// Vite. All exports are inferred as `any` by TypeScript's shorthand rule.

declare module "@elizaos/app-lifeops/ui";
declare module "@elizaos/app-lifeops/platform";
declare module "@elizaos/app-lifeops/widgets";
declare module "@elizaos/app-lifeops/components/LifeOpsActivitySignalsEffect";
declare module "@elizaos/app-steward/ui";
declare module "@elizaos/app-training/ui";
declare module "@elizaos/app-babylon/ui";
declare module "@elizaos/app-scape/ui";
declare module "@elizaos/app-hyperscape/ui";
declare module "@elizaos/app-2004scape/ui";
declare module "@elizaos/app-defense-of-the-agents/ui";
declare module "@elizaos/app-screenshare/ui";
declare module "@elizaos/app-shopify/register";
declare module "@elizaos/app-hyperliquid/client";
declare module "@elizaos/app-core/components/character/CharacterEditor";
declare module "@elizaos/app-task-coordinator/register-slots";
