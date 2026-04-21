/**
 * Stub for optional @elizaos/plugin-computeruse — satisfies root `tsc` when the
 * real plugin is not linked as a workspace package.
 */
import type { Action } from "@elizaos/core";

export const useComputerAction: Action | undefined = undefined;
export const computerUsePlugin = { actions: [] as Action[] };
