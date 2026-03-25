import type { OnboardingStep } from "@miladyai/app-core/state";
import { type ReactNode, useEffect, useRef } from "react";

interface OnboardingPanelProps {
  step: OnboardingStep;
  children: ReactNode;
}

export function OnboardingPanel({ step, children }: OnboardingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef(step);

  // Re-trigger entry animation on step change
  useEffect(() => {
    if (prevStepRef.current !== step && panelRef.current) {
      const panel = panelRef.current;
      panel.style.animation = "none";
      // Force reflow
      void panel.offsetHeight;
      panel.style.animation = "";

      // Re-trigger children stagger
      panel.querySelectorAll<HTMLElement>(":scope > *").forEach((child) => {
        child.style.animation = "none";
        void child.offsetHeight;
        child.style.animation = "";
      });
    }
    prevStepRef.current = step;
  }, [step]);

  return (
    <div className="absolute right-0 top-0 bottom-0 z-10 flex min-h-0 w-full max-w-[min(100%,32rem)] flex-col items-end justify-center py-[clamp(1rem,5vh,2.5rem)] pr-[clamp(1rem,4vw,3.5rem)] pl-0 max-lg:max-w-[min(100%,28rem)] max-lg:pr-8 max-md:relative max-md:max-w-none max-md:items-stretch max-md:justify-end max-md:px-4 max-md:pb-4 max-md:pt-2">
      <div
        className="onboarding-panel relative flex max-h-full min-h-0 w-full max-w-[30rem] flex-col gap-0 overflow-x-hidden overflow-y-auto rounded-[18px] border border-[var(--onboarding-panel-border)] bg-[linear-gradient(180deg,rgba(9,12,18,0.18),rgba(9,12,18,0.08)),var(--onboarding-panel-bg)] py-[clamp(1.5rem,4vw,2.25rem)] px-[clamp(1rem,3vw,1.5rem)] shadow-[var(--onboarding-panel-shadow)] backdrop-blur-[36px] backdrop-saturate-[1.24] animate-[onboarding-panel-enter_0.6s_cubic-bezier(0.25,0.46,0.45,0.94)_both] max-md:max-h-[min(60dvh,calc(100dvh-8.5rem))] max-md:max-w-none max-md:rounded-[16px]"
        ref={panelRef}
      >
        {children}
      </div>
    </div>
  );
}
