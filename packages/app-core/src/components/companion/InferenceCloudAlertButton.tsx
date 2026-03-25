import { Button, IconTooltip } from "@miladyai/ui";
import { AlertTriangle } from "lucide-react";
import { memo, type CSSProperties, type PointerEvent } from "react";
import type { CompanionInferenceNotice } from "./resolve-companion-inference-notice";

export interface InferenceCloudAlertButtonProps {
  notice: CompanionInferenceNotice;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}

export const InferenceCloudAlertButton = memo(
  function InferenceCloudAlertButton(props: InferenceCloudAlertButtonProps) {
    const { notice, onPointerDown, onClick } = props;
    const isDanger = notice.variant === "danger";
    const toneVar = isDanger ? "var(--danger)" : "var(--warn)";
    const toneStyle: CSSProperties = {
      borderColor: `color-mix(in srgb, ${toneVar} 34%, var(--border))`,
      background: `color-mix(in srgb, ${toneVar} 12%, var(--card))`,
      color: `color-mix(in srgb, var(--text-strong) 78%, ${toneVar} 22%)`,
    };

    return (
      <IconTooltip label={notice.tooltip} position="bottom" multiline>
        <Button
          size="icon"
          variant="outline"
          className="h-11 min-h-[44px] min-w-[44px] rounded-xl shadow-sm transition-all duration-200 hover:border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--card))] hover:text-[color:color-mix(in_srgb,var(--text-strong)_84%,var(--accent)_16%)]"
          aria-label={notice.tooltip}
          data-testid="companion-inference-cloud-alert"
          onPointerDown={onPointerDown}
          onClick={onClick}
          style={toneStyle}
        >
          <AlertTriangle className="pointer-events-none h-5 w-5 shrink-0" />
        </Button>
      </IconTooltip>
    );
  },
);
