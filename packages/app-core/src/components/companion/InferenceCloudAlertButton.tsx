import { AlertTriangle } from "lucide-react";
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { CompanionInferenceNotice } from "./resolve-companion-inference-notice";

export interface InferenceCloudAlertButtonProps {
  notice: CompanionInferenceNotice;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}

function InferenceTooltipPortal(props: {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  text: string;
  tipId: string;
}) {
  const { open, anchorRef, text, tipId } = props;
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      top: r.bottom + 8,
      left: r.left + r.width / 2,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    measure();
    const el = anchorRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchorRef, measure, open]);

  if (!open || coords == null || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      id={tipId}
      className="pointer-events-none rounded-md border border-border bg-bg-elevated px-2.5 py-2 text-left text-[11px] font-medium leading-snug text-txt-strong shadow-lg"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transform: "translateX(-50%)",
        zIndex: 2147483646,
        maxWidth: "min(22rem, calc(100vw - 1.5rem))",
        whiteSpace: "normal",
      }}
      role="tooltip"
    >
      {text}
    </div>,
    document.body,
  );
}

export const InferenceCloudAlertButton = memo(
  function InferenceCloudAlertButton(props: InferenceCloudAlertButtonProps) {
    const { notice, onPointerDown, onClick } = props;
    const isDanger = notice.variant === "danger";
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [tipOpen, setTipOpen] = useState(false);
    const tipId = useId();

    const showTip = useCallback(() => {
      setTipOpen(true);
    }, []);

    const hideTip = useCallback(() => {
      setTipOpen(false);
    }, []);

    return (
      <div
        className="relative inline-flex"
        onPointerEnter={showTip}
        onPointerLeave={hideTip}
      >
        <button
          ref={buttonRef}
          type="button"
          className={`inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border shadow-sm ${
            isDanger
              ? "border-danger/40 bg-danger/15 text-danger hover:bg-danger/25"
              : "border-warn/40 bg-warn/15 text-warn hover:bg-warn/25"
          }`}
          aria-label={notice.tooltip}
          aria-describedby={tipOpen ? tipId : undefined}
          data-testid="companion-inference-cloud-alert"
          onPointerDown={onPointerDown}
          onClick={onClick}
          onFocus={showTip}
          onBlur={hideTip}
        >
          <AlertTriangle className="pointer-events-none h-5 w-5 shrink-0" />
        </button>
        <InferenceTooltipPortal
          open={tipOpen}
          anchorRef={buttonRef}
          text={notice.tooltip}
          tipId={tipId}
        />
      </div>
    );
  },
);
