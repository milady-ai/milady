/**
 * Companion / 3D avatar components.
 *
 * Import from `@miladyai/app-core/companion` instead of
 * `@miladyai/app-core/components` to opt-in to the three.js-based
 * avatar rendering stack (~850 KB+). Consumers that don't need 3D
 * companions can skip this entry point entirely.
 */

export * from "../avatar/VrmEngine";
export * from "../avatar/VrmViewer";
export * from "../chat/ChatAvatar";
export * from "./CompanionSceneHost";
export * from "../shell/CompanionShell";
export * from "../pages/CompanionView";
export * from "../shell/companion-shell-styles";
export { useSharedCompanionScene } from "./shared-companion-scene-context";
export * from "./VrmStage";
