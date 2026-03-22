import type { ButtonHTMLAttributes } from "react";

type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "onChange" | "onClick" | "role" | "aria-checked"
> & {
  checked: boolean;
  onChange: (next: boolean) => void;
};

export function Switch({
  checked,
  onChange,
  disabled,
  className = "",
  ...buttonProps
}: SwitchProps) {
  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${disabled ? "opacity-40 cursor-default" : "cursor-pointer"} ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 51,
        height: 31,
        borderRadius: 9999,
        border: "none",
        padding: 0,
        background: checked ? "var(--accent, #4cd964)" : "#787880",
        transition: "background 0.2s ease",
        outline: "none",
        flexShrink: 0,
      }}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 22 : 2,
          width: 27,
          height: 27,
          borderRadius: 9999,
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}
