export * from "./AppContext";
// Sub-context providers are exported for composition inside AppProvider.
// Consumer hooks (useChatState, useNavigation, useLifecycle) are NOT
// re-exported here to prevent split-brain — all reads should go through
// useApp() until AppContext's duplicate state is fully removed.
export { ChatProvider } from "./ChatContext";
export { LifecycleProvider } from "./LifecycleContext";
export { NavigationProvider } from "./NavigationContext";
export * from "./parsers";
export * from "./persistence";
export { TranslationProvider, useTranslation } from "./TranslationContext";
export type { TranslateFn } from "./TranslationContext";
export * from "./types";
export * from "./useApp";
export * from "./vrm";
