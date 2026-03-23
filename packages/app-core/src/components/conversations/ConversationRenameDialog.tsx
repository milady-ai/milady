import { Button, Input, Label } from "@miladyai/ui";
import { Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../state";

/**
 * Rename modal: we intentionally avoid @miladyai/ui Radix Dialog here.
 *
 * Why createPortal(document.body) + huge z-index:
 * - Mobile chat wraps the sidebar in `fixed inset-0 z-[120]`; game-modal shells use
 *   z-[100]. Radix Dialog defaulted to z-50, so users saw only the dim layer while the
 *   panel painted under those full-screen stacks.
 * - Portaling to body with an explicit z-index avoids ancestor stacking contexts inside
 *   the sidebar tree. No Radix enter animation on this surface avoids “invisible panel”
 *   edge cases in WKWebView / layered UIs.
 *
 * Why isVitest() skips the portal:
 * - react-test-renderer cannot mix createPortal(…, document.body) with the test tree.
 */
const RENAME_LAYER_Z = 50_000;

function isVitest(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.VITEST === "true" || process.env.VITEST === "1")
  );
}

export interface ConversationRenameDialogProps {
  open: boolean;
  conversationId: string | null;
  /** Raw API title (not localized). */
  initialTitle: string;
  onClose: () => void;
}

export function ConversationRenameDialog({
  open,
  conversationId,
  initialTitle,
  onClose,
}: ConversationRenameDialogProps) {
  const {
    handleRenameConversation,
    suggestConversationTitle,
    t,
  } = useApp();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialTitle);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialTitle);
      setSuggesting(false);
      setSaving(false);
    }
  }, [open, initialTitle, conversationId]);

  useEffect(() => {
    if (!open || typeof document === "undefined" || isVitest()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const tmr = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(tmr);
  }, [open, conversationId]);

  const handleSuggest = async () => {
    if (!conversationId || suggesting || saving) return;
    setSuggesting(true);
    try {
      const suggested = await suggestConversationTitle(conversationId);
      if (suggested) setDraft(suggested);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    if (!conversationId || saving || suggesting) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await handleRenameConversation(conversationId, trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  const layer = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: RENAME_LAYER_Z }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0 bg-black/80 p-0"
        aria-label={t("common.cancel")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="conv-rename-dialog"
        className="relative z-10 grid w-full max-w-md gap-4 rounded-lg border border-border bg-bg p-6 text-txt shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-sm p-1 text-muted opacity-80 ring-offset-bg transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("common.cancel")}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex flex-col space-y-1.5 pr-8 text-left">
          <h2 id={titleId} className="text-lg font-semibold leading-none tracking-tight">
            {t("conversations.renameDialogTitle")}
          </h2>
        </div>

        <div className="grid gap-3 py-1">
          <p className="text-sm text-muted">
            {t("conversations.renameDialogDescription")}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="conv-rename-title-input">
              {t("conversations.renameDialogLabel")}
            </Label>
            <Input
              ref={inputRef}
              id="conv-rename-title-input"
              data-testid="conv-rename-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              disabled={suggesting || saving}
              className="text-txt"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="conv-rename-suggest"
            className="gap-1.5 border-border"
            onClick={() => void handleSuggest()}
            disabled={!conversationId || suggesting || saving}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {suggesting
              ? t("conversations.renameDialogSuggesting")
              : t("conversations.renameDialogSuggest")}
          </Button>
          <div className="flex gap-2 justify-end w-full sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="conv-rename-cancel"
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="conv-rename-save"
              className="bg-accent text-accent-fg hover:opacity-90"
              onClick={() => void handleSave()}
              disabled={
                !conversationId ||
                !draft.trim() ||
                saving ||
                suggesting
              }
            >
              {saving
                ? t("conversations.renameDialogSaving")
                : t("conversations.renameDialogSave")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return null;
  }

  // react-test-renderer cannot mix createPortal(document.body) with the test tree.
  if (isVitest()) {
    return layer;
  }

  return createPortal(layer, document.body);
}
