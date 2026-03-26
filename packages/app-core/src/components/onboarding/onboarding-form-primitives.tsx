import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldMessage,
  cn,
} from "@miladyai/ui";
import * as React from "react";

export const onboardingDetailStackClassName =
  "flex w-full flex-col gap-4 text-left";
export const onboardingCenteredStackClassName =
  "flex w-full flex-col items-center gap-3 text-center";
export const onboardingHelperTextClassName =
  "text-sm leading-relaxed text-[var(--onboarding-text-muted)]";
export const onboardingSubtleTextClassName =
  "text-xs leading-relaxed text-[var(--onboarding-text-subtle)]";
export const onboardingInfoPanelClassName =
  "rounded-2xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)]/90 px-4 py-4 backdrop-blur-[18px] backdrop-saturate-[1.15]";
export const onboardingInputClassName =
  "h-12 w-full rounded-xl border border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] px-4 text-left text-[var(--onboarding-text-primary)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[var(--onboarding-text-faint)] focus-visible:border-[var(--onboarding-field-focus-border)] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[var(--onboarding-field-focus-shadow)]";
export const onboardingChoiceCardTitleClassName =
  "text-[11px] font-medium leading-[1.2] text-[var(--onboarding-text-primary)] [text-shadow:0_1px_8px_rgba(3,5,10,0.6)]";
export const onboardingChoiceCardDescriptionClassName =
  "mt-0.5 text-[9px] leading-[1.2] text-[var(--onboarding-text-subtle)] [text-shadow:0_1px_8px_rgba(3,5,10,0.5)]";
export const onboardingChoiceCardBadgeClassName =
  "ml-auto shrink-0 whitespace-nowrap rounded-full bg-[var(--onboarding-accent-bg)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--onboarding-accent-foreground)] [text-shadow:0_1px_6px_rgba(3,5,10,0.45)]";
export const onboardingChoiceCardDetectedBadgeClassName =
  "ml-auto shrink-0 whitespace-nowrap rounded-full bg-[rgba(34,197,94,0.2)] px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[rgba(34,197,94,0.94)] [text-shadow:0_1px_6px_rgba(3,5,10,0.45)]";
export const onboardingChoiceCardRecommendedLabelClassName =
  "ml-auto shrink-0 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.12em] text-accent";

export function getOnboardingChoiceCardClassName({
  detected = false,
  selected = false,
  recommended = false,
}: {
  detected?: boolean;
  selected?: boolean;
  recommended?: boolean;
}) {
  return cn(
    "flex min-h-[48px] w-full items-center justify-between gap-[10px] rounded-[10px] border px-[12px] py-[9px] text-left backdrop-blur-[18px] backdrop-saturate-[1.2] transition-[border-color,background-color,box-shadow] duration-200",
    recommended
      ? "border-[var(--onboarding-recommended-border)] bg-[var(--onboarding-recommended-bg)] hover:border-[var(--onboarding-recommended-border-strong)] hover:bg-[var(--onboarding-recommended-bg-hover)]"
      : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] hover:border-[var(--onboarding-card-border-strong)] hover:bg-[var(--onboarding-card-bg-hover)]",
    selected &&
      "border-[rgba(240,185,11,0.32)] bg-[rgba(240,185,11,0.12)] shadow-[0_0_0_1px_rgba(240,185,11,0.18)]",
    detected &&
      "border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.1)] hover:border-[rgba(34,197,94,0.5)] hover:bg-[rgba(34,197,94,0.15)]",
  );
}

interface OnboardingFieldProps {
  align?: "left" | "center";
  children: (controlProps: {
    describedBy?: string;
    invalid: boolean;
  }) => React.ReactNode;
  className?: string;
  controlId?: string;
  description?: React.ReactNode;
  descriptionClassName?: string;
  label?: React.ReactNode;
  labelClassName?: string;
  message?: React.ReactNode;
  messageClassName?: string;
  messageTone?: "default" | "danger" | "success";
}

export function OnboardingField({
  align = "left",
  children,
  className,
  controlId,
  description,
  descriptionClassName,
  label,
  labelClassName,
  message,
  messageClassName,
  messageTone = "default",
}: OnboardingFieldProps) {
  const descriptionId =
    controlId && description ? `${controlId}-description` : undefined;
  const messageId = controlId && message ? `${controlId}-message` : undefined;
  const describedBy =
    [descriptionId, messageId].filter(Boolean).join(" ") || undefined;
  const isInvalid = Boolean(message) && messageTone === "danger";

  return (
    <Field
      className={cn(
        "w-full gap-2.5",
        align === "center" ? "items-center text-center" : "text-left",
        className,
      )}
    >
      {label ? (
        <FieldLabel
          htmlFor={controlId}
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--onboarding-text-muted)]",
            align === "center" && "text-center",
            labelClassName,
          )}
        >
          {label}
        </FieldLabel>
      ) : null}
      {children({ describedBy, invalid: isInvalid })}
      {description ? (
        <FieldDescription
          id={descriptionId}
          className={cn(
            onboardingHelperTextClassName,
            align === "center" && "text-center",
            descriptionClassName,
          )}
        >
          {description}
        </FieldDescription>
      ) : null}
      {message ? (
        <FieldMessage
          id={messageId}
          tone={messageTone}
          aria-live={messageTone === "danger" ? "assertive" : "polite"}
          className={cn(
            "leading-relaxed",
            align === "center" && "text-center",
            messageClassName,
          )}
        >
          {message}
        </FieldMessage>
      ) : null}
    </Field>
  );
}

export const OnboardingStatusBanner = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    action?: React.ReactNode;
    live?: "polite" | "assertive";
    tone: "success" | "neutral" | "error";
  }
>(({ action, children, className, live = "polite", tone, ...props }, ref) => {
  const toneClass =
    tone === "success"
      ? "border-[var(--ok-muted)] bg-[var(--ok-subtle)] text-[var(--ok)]"
      : tone === "error"
        ? "border-[color:color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"
        : "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] text-[var(--onboarding-text-muted)]";

  return (
    <div
      ref={ref}
      aria-live={live}
      role={tone === "error" ? "alert" : "status"}
      tabIndex={-1}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm",
        toneClass,
        className,
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
});
OnboardingStatusBanner.displayName = "OnboardingStatusBanner";
