/**
 * Backwards-compatible re-exports for legacy app-core confirm/prompt modal imports.
 *
 * The shared @miladyai/ui implementation is now the canonical modal system.
 */

export {
  ConfirmDialog as ConfirmModal,
  type ConfirmDialogProps as ConfirmModalProps,
  type ConfirmOptions,
  PromptDialog as PromptModal,
  type PromptDialogProps as PromptModalProps,
  type PromptOptions,
  useConfirm,
  usePrompt,
} from "@miladyai/ui";
