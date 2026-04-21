/**
 * Public entry point for the eliza package.
 *
 * Config types are the primary public API surface.
 * @module eliza
 */

export * from "@miladyai/shared/config";
export type { RestartHandler } from "@miladyai/shared/restart";
export {
  RESTART_EXIT_CODE,
  requestRestart,
  setRestartHandler,
} from "@miladyai/shared/restart";
