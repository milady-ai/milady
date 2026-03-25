export const SHELL_CONTROL_BASE_CLASSNAME =
  "border border-border/60 bg-bg/70 text-txt shadow-sm backdrop-blur-md transition-[border-color,background-color,color,transform,box-shadow] duration-200 hover:border-accent/70 hover:bg-bg-hover/90 hover:text-txt hover:shadow-md active:scale-[0.98] disabled:active:scale-100 disabled:hover:border-border/60 disabled:hover:bg-bg/70 disabled:hover:text-txt";

export const SHELL_ICON_BUTTON_CLASSNAME = `inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${SHELL_CONTROL_BASE_CLASSNAME}`;

export const SHELL_EXPANDED_BUTTON_CLASSNAME = `inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl px-3.5 ${SHELL_CONTROL_BASE_CLASSNAME}`;

export const SHELL_SEGMENTED_CONTROL_CLASSNAME =
  "inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-bg/35 p-0.5 shadow-sm backdrop-blur-md";

export const SHELL_SEGMENT_ACTIVE_CLASSNAME =
  "border-[color:color-mix(in_srgb,var(--accent)_34%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--card))] text-[color:color-mix(in_srgb,var(--text-strong)_78%,var(--accent)_22%)] shadow-sm";

export const SHELL_SEGMENT_INACTIVE_CLASSNAME =
  "border border-transparent bg-transparent text-muted-strong hover:border-border/60 hover:bg-bg-hover/80 hover:text-txt";

export const HEADER_BUTTON_STYLE = {
  clipPath: "none",
  WebkitClipPath: "none",
  touchAction: "manipulation",
} as const;
