/**
 * Branded confirmation modal to replace native window.confirm dialogs.
 *
 * Uses the Dialog component from @miladyai/ui for consistent overlay,
 * focus management, Escape-to-cancel, and portal behavior.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warn" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export interface PromptModalProps {
  open: boolean;
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const confirmBtnStyle: React.CSSProperties =
    tone === "danger"
      ? { background: "#ef4444", color: "#fff" }
      : tone === "warn"
        ? { background: "#f59e0b", color: "#fff" }
        : { background: "var(--accent)", color: "var(--accent-foreground)" };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent className="max-w-md rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-bold mb-3">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm whitespace-pre-line mb-6">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="px-4 py-2 text-sm"
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium"
            style={confirmBtnStyle}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PromptModal({
  open,
  title = "Enter Value",
  message,
  placeholder,
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [defaultValue, open]);

  const handleConfirm = useCallback(() => {
    onConfirm(value);
  }, [onConfirm, value]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent
        className="max-w-md rounded-xl p-6"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleConfirm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold mb-3">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm whitespace-pre-line mb-4">
            {message}
          </DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm mb-6"
          style={{
            background: "var(--bg-hover)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
        />
        <DialogFooter className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="px-4 py-2 text-sm"
          >
            {cancelLabel}
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--accent-foreground)",
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook providing an async confirm() that manages <ConfirmModal> state.
 *
 * Usage:
 *   const { confirm, modalProps } = useConfirm();
 *   const ok = await confirm({ message: "Delete?" });
 *   // render <ConfirmModal {...modalProps} /> somewhere in JSX
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warn" | "default";
}

export function useConfirm() {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );

  const modalProps: ConfirmModalProps = state
    ? {
        open: true,
        ...state.opts,
        onConfirm: () => {
          state.resolve(true);
          setState(null);
        },
        onCancel: () => {
          state.resolve(false);
          setState(null);
        },
      }
    : {
        open: false,
        message: "",
        onConfirm: () => {},
        onCancel: () => {},
      };

  return { confirm, modalProps };
}

export interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function usePrompt() {
  const [state, setState] = useState<{
    opts: PromptOptions;
    resolve: (value: string | null) => void;
  } | null>(null);

  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> =>
      new Promise((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );

  const modalProps: PromptModalProps = state
    ? {
        open: true,
        ...state.opts,
        onConfirm: (value) => {
          state.resolve(value);
          setState(null);
        },
        onCancel: () => {
          state.resolve(null);
          setState(null);
        },
      }
    : {
        open: false,
        message: "",
        onConfirm: () => {},
        onCancel: () => {},
      };

  return { prompt, modalProps };
}
