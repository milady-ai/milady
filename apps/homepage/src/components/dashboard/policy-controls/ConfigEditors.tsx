/**
 * Policy config editors — specialized inputs for each policy type.
 */
import { useCallback, useState } from "react";
import type { StewardPolicyType } from "../../../lib/cloud-api";

// ── PolicyConfigEditor ─────────────────────────────────────────────────

export function PolicyConfigEditor({
  type,
  config,
  onChange,
}: {
  type: StewardPolicyType;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (type) {
    case "spending-limit":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ConfigInput
            label="MAX PER TX (ETH)"
            value={String(config.maxPerTx ?? "")}
            onChange={(v) => onChange("maxPerTx", v)}
            placeholder="0.1"
          />
          <ConfigInput
            label="MAX PER DAY (ETH)"
            value={String(config.maxPerDay ?? "")}
            onChange={(v) => onChange("maxPerDay", v)}
            placeholder="1.0"
          />
          <ConfigInput
            label="MAX PER WEEK (ETH)"
            value={String(config.maxPerWeek ?? "")}
            onChange={(v) => onChange("maxPerWeek", v)}
            placeholder="5.0"
          />
        </div>
      );

    case "auto-approve-threshold":
      return (
        <ConfigInput
          label="AUTO-APPROVE BELOW (ETH)"
          value={String(config.threshold ?? "")}
          onChange={(v) => onChange("threshold", v)}
          placeholder="0.01"
        />
      );

    case "rate-limit":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ConfigInput
            label="MAX TX / HOUR"
            value={String(config.maxTxPerHour ?? "")}
            onChange={(v) => onChange("maxTxPerHour", parseInt(v, 10) || 0)}
            placeholder="10"
            type="number"
          />
          <ConfigInput
            label="MAX TX / DAY"
            value={String(config.maxTxPerDay ?? "")}
            onChange={(v) => onChange("maxTxPerDay", parseInt(v, 10) || 0)}
            placeholder="50"
            type="number"
          />
        </div>
      );

    case "approved-addresses":
      return (
        <ApprovedAddressesEditor
          addresses={(config.addresses as string[]) ?? []}
          mode={(config.mode as string) ?? "whitelist"}
          onAddressesChange={(v) => onChange("addresses", v)}
          onModeChange={(v) => onChange("mode", v)}
        />
      );

    case "time-window":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ConfigInput
              label="START HOUR (0-23)"
              value={String(
                (
                  config.allowedHours as Array<{
                    start: number;
                    end: number;
                  }>
                )?.[0]?.start ?? "9",
              )}
              onChange={(v) =>
                onChange("allowedHours", [
                  {
                    start: parseInt(v, 10) || 0,
                    end:
                      (
                        config.allowedHours as Array<{
                          start: number;
                          end: number;
                        }>
                      )?.[0]?.end ?? 17,
                  },
                ])
              }
              placeholder="9"
              type="number"
            />
            <ConfigInput
              label="END HOUR (0-23)"
              value={String(
                (
                  config.allowedHours as Array<{
                    start: number;
                    end: number;
                  }>
                )?.[0]?.end ?? "17",
              )}
              onChange={(v) =>
                onChange("allowedHours", [
                  {
                    start:
                      (
                        config.allowedHours as Array<{
                          start: number;
                          end: number;
                        }>
                      )?.[0]?.start ?? 9,
                    end: parseInt(v, 10) || 0,
                  },
                ])
              }
              placeholder="17"
              type="number"
            />
          </div>
          <DaySelector
            selectedDays={(config.allowedDays as number[]) ?? [1, 2, 3, 4, 5]}
            onChange={(days) => onChange("allowedDays", days)}
          />
        </div>
      );

    default:
      return (
        <pre className="font-mono text-[10px] text-text-muted bg-dark-secondary p-2 overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      );
  }
}

// ── ConfigInput ─────────────────────────────────────────────────────────

function ConfigInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block font-mono text-[9px] tracking-wider text-text-subtle mb-1">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 font-mono text-xs text-text-light bg-dark-secondary
          border border-border focus:border-brand/50 focus:outline-none transition-colors"
      />
    </label>
  );
}

// ── ApprovedAddressesEditor ─────────────────────────────────────────────

function ApprovedAddressesEditor({
  addresses,
  mode,
  onAddressesChange,
  onModeChange,
}: {
  addresses: string[];
  mode: string;
  onAddressesChange: (addresses: string[]) => void;
  onModeChange: (mode: string) => void;
}) {
  const [newAddr, setNewAddr] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = newAddr.trim();
    if (trimmed && !addresses.includes(trimmed)) {
      onAddressesChange([...addresses, trimmed]);
      setNewAddr("");
    }
  }, [newAddr, addresses, onAddressesChange]);

  const handleRemove = useCallback(
    (addr: string) => {
      onAddressesChange(addresses.filter((a) => a !== addr));
    },
    [addresses, onAddressesChange],
  );

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-wider text-text-subtle">
          MODE:
        </span>
        {["whitelist", "blacklist"].map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => onModeChange(m)}
            className={`px-3 py-1 font-mono text-[10px] tracking-wide border transition-colors
              ${
                mode === m
                  ? m === "whitelist"
                    ? "text-status-running border-status-running/20 bg-status-running/5"
                    : "text-status-stopped border-status-stopped/20 bg-status-stopped/5"
                  : "text-text-muted border-border hover:text-text-light"
              }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Address list */}
      <div className="space-y-1">
        {addresses.map((addr) => (
          <div
            key={addr}
            className="flex items-center justify-between px-3 py-1.5 bg-dark-secondary border border-border-subtle"
          >
            <code className="font-mono text-[11px] text-text-light">
              {addr}
            </code>
            <button
              type="button"
              onClick={() => handleRemove(addr)}
              className="text-text-subtle hover:text-status-stopped transition-colors"
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add address */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="0x..."
          className="flex-1 px-3 py-2 font-mono text-xs text-text-light bg-dark-secondary
            border border-border focus:border-brand/50 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newAddr.trim()}
          className="px-3 py-2 font-mono text-[10px] text-brand border border-brand/20
            hover:bg-brand/10 transition-colors disabled:opacity-40"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

// ── DaySelector ─────────────────────────────────────────────────────────

function DaySelector({
  selectedDays,
  onChange,
}: {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}) {
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const toggleDay = useCallback(
    (day: number) => {
      if (selectedDays.includes(day)) {
        onChange(selectedDays.filter((d) => d !== day));
      } else {
        onChange([...selectedDays, day].sort());
      }
    },
    [selectedDays, onChange],
  );

  return (
    <div>
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1.5">
        ALLOWED DAYS
      </p>
      <div className="flex gap-1">
        {DAYS.map((label, i) => (
          <button
            type="button"
            key={label}
            onClick={() => toggleDay(i)}
            className={`px-2 py-1.5 font-mono text-[9px] tracking-wide border transition-colors
              ${
                selectedDays.includes(i)
                  ? "text-brand border-brand/30 bg-brand/8"
                  : "text-text-subtle border-border hover:text-text-light"
              }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
