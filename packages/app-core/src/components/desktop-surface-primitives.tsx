import { cn, EmptyState } from "@miladyai/ui";
import type * as React from "react";

export const DESKTOP_PAGE_FRAME_CLASSNAME =
  "flex h-full w-full min-h-0 bg-transparent p-0 lg:p-1";

export const DESKTOP_PAGE_CONTENT_CLASSNAME = "min-w-0 flex-1 overflow-y-auto";

export const DESKTOP_TEXT_DEPTH_STRONG_CLASSNAME =
  "drop-shadow-[0_1px_0_rgba(255,255,255,0.14)] dark:drop-shadow-[0_1px_12px_rgba(0,0,0,0.34)]";

export const DESKTOP_TEXT_DEPTH_MUTED_CLASSNAME =
  "drop-shadow-[0_1px_0_rgba(255,255,255,0.08)] dark:drop-shadow-[0_1px_8px_rgba(0,0,0,0.24)]";

export const DESKTOP_SURFACE_PANEL_CLASSNAME =
  "rounded-[28px] border border-border/34 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_82%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_22px_34px_-26px_rgba(15,23,42,0.14)] ring-1 ring-border/8 backdrop-blur-md dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_36px_-26px_rgba(0,0,0,0.32)]";

export const DESKTOP_SECTION_SHELL_CLASSNAME = `overflow-visible ${DESKTOP_SURFACE_PANEL_CLASSNAME}`;

export const DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME = `${DESKTOP_SURFACE_PANEL_CLASSNAME} px-5 py-4 sm:px-6 sm:py-5`;

export const DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME =
  "rounded-[22px] border border-border/28 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_86%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(15,23,42,0.12)] ring-1 ring-border/8 backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_28px_-24px_rgba(0,0,0,0.28)]";

export const DESKTOP_RAIL_SUMMARY_CARD_COMPACT_CLASSNAME = "p-3.5";

export const DESKTOP_INSET_PANEL_CLASSNAME =
  "rounded-[22px] border border-border/28 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_72%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(255,255,255,0.02)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(255,255,255,0.01)]";

export const DESKTOP_INSET_EMPTY_PANEL_CLASSNAME =
  "min-h-[14rem] rounded-[22px] border border-dashed border-border/28 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_74%,transparent),color-mix(in_srgb,var(--bg)_93%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(255,255,255,0.02)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(255,255,255,0.01)]";

export const DESKTOP_CONTROL_SURFACE_CLASSNAME =
  "border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] text-muted-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_20px_-18px_rgba(15,23,42,0.14)] backdrop-blur-md transition-[border-color,background-color,color,transform,box-shadow] duration-200 hover:border-border/46 hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_97%,transparent))] hover:text-txt hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_16px_22px_-18px_rgba(15,23,42,0.16)] active:scale-95 disabled:hover:border-border/32 disabled:hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] disabled:hover:text-muted-strong dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_24px_-20px_rgba(0,0,0,0.24)]";

export const DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME =
  "h-8 rounded-full px-3.5 text-[10px] font-semibold tracking-[0.12em]";

export const DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME =
  "border border-accent/26 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.16),rgba(var(--accent-rgb),0.07))] text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_14px_22px_-18px_rgba(var(--accent-rgb),0.24)] ring-1 ring-inset ring-accent/10 hover:border-accent/42 hover:bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.2),rgba(var(--accent-rgb),0.1))] hover:text-txt-strong";

export const DESKTOP_CONTROL_SURFACE_DESTRUCTIVE_CLASSNAME =
  "border border-danger/30 bg-[linear-gradient(180deg,rgba(239,68,68,0.12),rgba(239,68,68,0.06))] text-danger shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_20px_-18px_rgba(127,29,29,0.18)] hover:border-danger/44 hover:bg-[linear-gradient(180deg,rgba(239,68,68,0.16),rgba(239,68,68,0.08))] hover:text-danger";

export const DESKTOP_INPUT_SHELL_CLASSNAME =
  "relative overflow-hidden border border-border/28 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_86%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_18px_28px_-24px_rgba(15,23,42,0.12)] backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)] hover:border-border/40 hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] focus-within:border-accent/24 focus-within:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_97%,transparent))] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_20px_30px_-24px_rgba(15,23,42,0.14)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_30px_-26px_rgba(0,0,0,0.24)]";

export const DESKTOP_FLOATING_ACTION_RAIL_CLASSNAME =
  "border border-border/24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_97%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_22px_-18px_rgba(15,23,42,0.14)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_24px_-18px_rgba(0,0,0,0.24)]";

export const DESKTOP_SEGMENTED_GROUP_CLASSNAME = `${DESKTOP_FLOATING_ACTION_RAIL_CLASSNAME} flex gap-1.5 rounded-[18px] p-1.5`;

export const DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME =
  "inline-flex min-h-10 items-center justify-center rounded-[15px] px-3 py-2 text-xs font-semibold tracking-[0.08em] transition-[border-color,background-color,color,box-shadow]";

export const DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME = `border ${DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME} text-txt-strong`;

export const DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME =
  "border border-transparent bg-transparent text-muted-strong hover:border-border/36 hover:bg-bg-hover/50 hover:text-txt";

export const DESKTOP_CHAT_BUBBLE_USER_CLASSNAME =
  "border border-accent/24 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.14),rgba(var(--accent-rgb),0.05))] text-txt-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_26px_-24px_rgba(var(--accent-rgb),0.18)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_28px_-24px_rgba(0,0,0,0.22)]";

export const DESKTOP_CHAT_BUBBLE_ASSISTANT_CLASSNAME =
  "border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_90%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] text-txt shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(15,23,42,0.1)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_28px_-24px_rgba(0,0,0,0.22)]";

export function DesktopPageFrame({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(DESKTOP_PAGE_FRAME_CLASSNAME, className)} {...props}>
      {children}
    </div>
  );
}

export function DesktopEmptyStatePanel({
  className,
  ...props
}: React.ComponentProps<typeof EmptyState>) {
  return (
    <EmptyState
      className={cn(
        "min-h-[18rem] rounded-[24px] border border-dashed border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] px-6 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_20px_28px_-24px_rgba(15,23,42,0.12)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_22px_30px_-24px_rgba(0,0,0,0.28)]",
        className,
      )}
      {...props}
    />
  );
}

export function DesktopInsetEmptyStatePanel({
  className,
  ...props
}: React.ComponentProps<typeof EmptyState>) {
  return (
    <EmptyState
      className={cn(
        `${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} px-5 py-10`,
        className,
      )}
      {...props}
    />
  );
}

export function DesktopRailSummaryCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(DESKTOP_RAIL_SUMMARY_CARD_CLASSNAME, className)}
      {...props}
    >
      {children}
    </div>
  );
}
