import { Button } from "@miladyai/ui";
import { useState } from "react";
import { useApp } from "../state";

type ConfirmDeleteControlProps = {
  onConfirm: () => void;
  disabled?: boolean;
  triggerLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  promptText?: string;
  triggerClassName: string;
  confirmClassName: string;
  cancelClassName: string;
  promptClassName?: string;
};

export function ConfirmDeleteControl({
  onConfirm,
  disabled = false,
  triggerLabel,
  confirmLabel,
  cancelLabel,
  busyLabel,
  promptText,
  triggerClassName,
  confirmClassName,
  cancelClassName,
  promptClassName = "text-[11px] text-[#e74c3c] ml-1",
}: ConfirmDeleteControlProps) {
  const { t } = useApp();
  const [confirming, setConfirming] = useState(false);
  const resolvedTriggerLabel =
    triggerLabel ??
    t("confirmdeletecontrol.Delete", { defaultValue: "Delete" });
  const resolvedConfirmLabel =
    confirmLabel ??
    t("confirmdeletecontrol.Confirm", { defaultValue: "Confirm" });
  const resolvedCancelLabel =
    cancelLabel ?? t("confirmdeletecontrol.Cancel", { defaultValue: "Cancel" });
  const resolvedPromptText =
    promptText ??
    t("confirmdeletecontrol.DeletePrompt", { defaultValue: "Delete?" });

  if (!confirming) {
    return (
      <Button
        variant="destructive"
        size="sm"
        type="button"
        className={triggerClassName}
        onClick={() => setConfirming(true)}
        disabled={disabled}
      >
        {resolvedTriggerLabel}
      </Button>
    );
  }

  return (
    <>
      <span className={promptClassName}>{resolvedPromptText}</span>
      <Button
        variant="destructive"
        size="sm"
        type="button"
        className={confirmClassName}
        onClick={() => {
          onConfirm();
          setConfirming(false);
        }}
        disabled={disabled}
      >
        {disabled && busyLabel ? busyLabel : resolvedConfirmLabel}
      </Button>
      <Button
        variant="outline"
        size="sm"
        type="button"
        className={cancelClassName}
        onClick={() => setConfirming(false)}
        disabled={disabled}
      >
        {resolvedCancelLabel}
      </Button>
    </>
  );
}
