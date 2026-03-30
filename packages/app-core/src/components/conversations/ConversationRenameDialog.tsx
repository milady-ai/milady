import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@miladyai/ui";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../state";

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
  const { handleRenameConversation, suggestConversationTitle, t } = useApp();
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
  }, [open, initialTitle]);

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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        data-testid="conv-rename-dialog"
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onPointerDownOutside={onClose}
      >
        <DialogHeader>
          <DialogTitle>{t("conversations.renameDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("conversations.renameDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-1">
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

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
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
              onClick={() => void handleSave()}
              disabled={
                !conversationId || !draft.trim() || saving || suggesting
              }
            >
              {saving
                ? t("conversations.renameDialogSaving")
                : t("conversations.renameDialogSave")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
