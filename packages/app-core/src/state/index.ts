export * from "./AppContext";
// Sub-context providers + consumer hooks. All are pass-through bridges —
// AppProvider owns the state, providers expose it for targeted subscriptions.
// No duplicate state, no split-brain.
export { CharacterProvider, useCharacter } from "./CharacterContext";
export type { CharacterContextValue } from "./CharacterContext";
export { ChatProvider, useChatState } from "./ChatContext";
export type { ChatStateValue } from "./ChatContext";
export { LifecycleProvider, useLifecycle } from "./LifecycleContext";
export type { LifecycleContextValue } from "./LifecycleContext";
export { NavigationProvider, useNavigation } from "./NavigationContext";
export type { NavigationContextValue } from "./NavigationContext";
export * from "./parsers";
export * from "./persistence";
export { TranslationProvider } from "./TranslationContext";
export type { TranslateFn } from "./TranslationContext";
export * from "./types";
export * from "./useApp";
export * from "./vrm";
