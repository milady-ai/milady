export const APP_TEXT_DEPTH_STRONG_CLASSNAME =
  "drop-shadow-[0_1px_0_rgba(255,255,255,0.14)] dark:drop-shadow-[0_1px_12px_rgba(0,0,0,0.34)]";

export const APP_PANEL_SHELL_CLASSNAME =
  "relative flex min-h-0 flex-1 overflow-hidden rounded-[30px] border border-border/44 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_80%,transparent),color-mix(in_srgb,var(--bg)_96%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_24px_42px_-28px_rgba(15,23,42,0.16)] ring-1 ring-border/10 backdrop-blur-md dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_26px_44px_-28px_rgba(0,0,0,0.36)]";

export const APP_DESKTOP_SPLIT_SHELL_CLASSNAME = `flex min-h-0 flex-1 flex-col lg:flex-row ${APP_PANEL_SHELL_CLASSNAME}`;

export const APP_DESKTOP_INLINE_SPLIT_SHELL_CLASSNAME = `settings-shell plugins-game-modal plugins-game-modal--inline ${APP_DESKTOP_SPLIT_SHELL_CLASSNAME}`;

export const APP_SIDEBAR_RAIL_CLASSNAME =
  "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-border/34 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_76%,transparent),color-mix(in_srgb,var(--bg-muted)_97%,transparent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_-1px_0_0_rgba(255,255,255,0.03)] backdrop-blur-md lg:border-b-0 lg:border-r dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_-1px_0_0_rgba(255,255,255,0.02)]";

export const APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME = `flex min-h-0 w-full max-w-none shrink-0 flex-col border-b border-border/40 lg:w-[clamp(18rem,23vw,21rem)] lg:min-w-[18rem] lg:max-w-[22rem] lg:border-b-0 lg:border-r ${APP_SIDEBAR_RAIL_CLASSNAME}`;

export const APP_SIDEBAR_INNER_CLASSNAME =
  "flex min-h-0 flex-1 flex-col px-3 pb-4 pt-3";

export const APP_SIDEBAR_STICKY_HEADER_CLASSNAME =
  "sticky top-0 z-10 border-b border-border/24 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_94%,transparent),color-mix(in_srgb,var(--bg)_84%,transparent))] px-3 pb-3.5 pt-3 backdrop-blur-md";

export const APP_SIDEBAR_KICKER_CLASSNAME = `text-[11px] font-semibold uppercase tracking-[0.16em] text-txt-strong ${APP_TEXT_DEPTH_STRONG_CLASSNAME}`;

export const APP_SIDEBAR_META_CLASSNAME = "mt-1.5 text-xs text-muted";

export const APP_SIDEBAR_SECTION_LABEL_CLASSNAME =
  "px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70";

export const APP_SIDEBAR_SECTION_HEADING_CLASSNAME =
  "px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/70";

export const APP_SIDEBAR_SCROLL_REGION_CLASSNAME =
  "custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]";

export const APP_SIDEBAR_CARD_BASE_CLASSNAME =
  "group flex h-auto w-full min-w-0 items-start justify-start gap-3 rounded-[18px] border px-3.5 py-3 text-left transition-[border-color,background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";

export const APP_SIDEBAR_CARD_COMPACT_CLASSNAME =
  "gap-2.5 rounded-[16px] px-3 py-2.5";

export const APP_SIDEBAR_CARD_ICON_COMPACT_CLASSNAME =
  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border text-[13px] font-bold";

export const APP_SIDEBAR_CARD_ACTIVE_CLASSNAME =
  "border-accent/26 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.18),rgba(var(--accent-rgb),0.08))] text-txt shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_24px_-22px_rgba(var(--accent-rgb),0.22)] ring-1 ring-inset ring-accent/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_28px_-22px_rgba(0,0,0,0.26),0_0_0_1px_rgba(var(--accent-rgb),0.12)]";

export const APP_SIDEBAR_CARD_INACTIVE_CLASSNAME =
  "border-border/10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_18%,transparent),transparent)] text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-border/28 hover:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_28%,transparent),transparent)] hover:text-txt hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_20px_-22px_rgba(15,23,42,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_22px_-22px_rgba(0,0,0,0.22)]";

export const APP_SIDEBAR_PILL_CLASSNAME =
  "inline-flex min-h-6 items-center rounded-full border border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_82%,transparent),color-mix(in_srgb,var(--bg)_92%,transparent))] px-2.5 py-1 text-[11px] font-medium text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_18px_-18px_rgba(15,23,42,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_18px_-18px_rgba(0,0,0,0.24)]";

export const APP_SIDEBAR_COMPACT_PILL_CLASSNAME = `${APP_SIDEBAR_PILL_CLASSNAME} min-h-0 px-2 py-1 text-[10px]`;

export const APP_SIDEBAR_COMPACT_CARD_CLASSNAME = `items-start gap-2.5 rounded-[16px] px-3 py-2.5 ${APP_SIDEBAR_CARD_BASE_CLASSNAME}`;

export const APP_SIDEBAR_COMPACT_TITLE_CLASSNAME =
  "block text-[13px] font-semibold leading-snug text-inherit";

export const APP_SIDEBAR_COMPACT_META_CLASSNAME =
  "mt-0.5 block text-[10px] leading-5 text-muted/85";

export const APP_SIDEBAR_COMPACT_ICON_ACTIVE_CLASSNAME =
  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border border-accent/30 bg-accent/18 text-[13px] font-bold text-txt-strong";

export const APP_SIDEBAR_COMPACT_ICON_INACTIVE_CLASSNAME =
  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] border border-border/50 bg-bg-accent/80 text-[13px] font-bold text-muted";

export const APP_SIDEBAR_SEARCH_INPUT_CLASSNAME =
  "h-10 rounded-[16px] border-border/34 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_14px_20px_-20px_rgba(15,23,42,0.12)] focus-visible:border-accent/28 focus-visible:ring-1 focus-visible:ring-accent/24 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_22px_-20px_rgba(0,0,0,0.22)]";
