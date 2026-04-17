export interface FilterChip<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "filter",
}: {
  options: FilterChip<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-black/20 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[11px] lowercase tracking-[0.06em] transition active:scale-[0.97] sm:py-1.5 ${
              active
                ? "bg-brand text-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                : "text-white/55 hover:text-white"
            }`}
          >
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span
                className={`text-[10px] ${
                  active ? "text-black/60" : "text-white/40"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
