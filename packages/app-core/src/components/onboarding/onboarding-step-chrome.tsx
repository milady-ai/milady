interface OnboardingStepHeaderProps {
  eyebrow: string;
  title?: string;
  description?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export const onboardingEyebrowClass =
  "text-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--onboarding-text-muted)]";

export const onboardingTitleClass =
  "text-center text-xl font-light leading-[1.4] text-[var(--onboarding-text-strong)]";

export const onboardingDescriptionClass =
  "text-center text-sm leading-relaxed text-[var(--onboarding-text-muted)]";

export const onboardingFooterClass =
  "mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--onboarding-footer-border)] pt-4";

export const onboardingSecondaryActionClass =
  "p-0 text-[10px] uppercase tracking-[0.15em] text-[var(--onboarding-text-muted)] transition-colors duration-300 hover:text-[var(--onboarding-text-strong)]";

export const onboardingPrimaryActionClass =
  "group relative inline-flex min-h-[44px] items-center justify-center gap-2 overflow-hidden rounded-[8px] border border-[var(--onboarding-accent-border)] bg-[var(--onboarding-accent-bg)] px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--onboarding-accent-foreground)] transition-all duration-300 hover:border-[var(--onboarding-accent-border-hover)] hover:bg-[var(--onboarding-accent-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40";

export const onboardingLinkActionClass =
  "rounded-md px-2 py-1 text-[11px] text-[var(--onboarding-text-faint)] transition-colors duration-300 hover:text-[var(--onboarding-link)]";

export const onboardingTextShadowStyle = {
  textShadow: "0 2px 10px rgba(3,5,10,0.55)",
} as const;

export const onboardingBodyTextShadowStyle = {
  textShadow: "0 2px 10px rgba(3,5,10,0.45)",
} as const;

export const onboardingPrimaryActionTextShadowStyle = {
  textShadow: "0 1px 6px rgba(3,5,10,0.55)",
} as const;

export const onboardingSecondaryActionTextShadowStyle = {
  textShadow: "0 1px 8px rgba(3,5,10,0.45)",
} as const;

export function OnboardingStepDivider() {
  return (
    <div className="my-4 flex items-center gap-3 before:h-px before:flex-1 before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:h-px after:flex-1 after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
      <div className="h-1.5 w-1.5 shrink-0 rotate-45 bg-[rgba(240,185,11,0.4)]" />
    </div>
  );
}

export function OnboardingStepHeader({
  eyebrow,
  title,
  description,
  titleClassName = "",
  descriptionClassName = "",
}: OnboardingStepHeaderProps) {
  return (
    <>
      <div className={onboardingEyebrowClass} style={onboardingTextShadowStyle}>
        {eyebrow}
      </div>
      <OnboardingStepDivider />
      {title ? (
        <div
          className={`${onboardingTitleClass} ${titleClassName}`.trim()}
          style={onboardingTextShadowStyle}
        >
          {title}
        </div>
      ) : null}
      {description ? (
        <p
          className={`${onboardingDescriptionClass} ${descriptionClassName}`.trim()}
          style={onboardingBodyTextShadowStyle}
        >
          {description}
        </p>
      ) : null}
    </>
  );
}

export function spawnOnboardingRipple(
  target: HTMLElement | null,
  point?: { x: number; y: number },
) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const diameter = Math.max(rect.width, rect.height);
  const circle = document.createElement("span");
  const x = point?.x ?? rect.left + rect.width / 2;
  const y = point?.y ?? rect.top + rect.height / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${x - rect.left - diameter / 2}px`;
  circle.style.top = `${y - rect.top - diameter / 2}px`;
  circle.className =
    "pointer-events-none absolute rounded-full bg-[var(--onboarding-ripple)] scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards]";
  target.appendChild(circle);
  window.setTimeout(() => circle.remove(), 600);
}
