/**
 * PolicyCard — individual policy toggle and config editor.
 */
import type { StewardPolicyRule } from "../../../lib/cloud-api";
import { PolicyConfigEditor } from "./ConfigEditors";
import { POLICY_TYPE_META } from "./types";

export function PolicyCard({
  policy,
  onToggle,
  onConfigChange,
  onRemove,
}: {
  policy: StewardPolicyRule;
  onToggle: () => void;
  onConfigChange: (key: string, value: unknown) => void;
  onRemove: () => void;
}) {
  const meta = POLICY_TYPE_META[policy.type] ?? {
    label: policy.type.toUpperCase(),
    description: "",
    icon: "📜",
  };

  return (
    <div
      className={`border overflow-hidden transition-colors ${
        policy.enabled
          ? "border-brand/20 bg-surface"
          : "border-border bg-surface opacity-60"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-secondary/30 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-base">{meta.icon}</span>
          <div>
            <span className="font-mono text-xs font-medium text-text-light">
              {meta.label}
            </span>
            <p className="font-mono text-[10px] text-text-subtle mt-0.5">
              {meta.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle */}
          <button
            type="button"
            onClick={onToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              policy.enabled
                ? "bg-brand"
                : "bg-surface-elevated border border-border"
            }`}
            title={policy.enabled ? "Disable policy" : "Enable policy"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                policy.enabled ? "left-5" : "left-0.5"
              }`}
            />
          </button>
          {/* Remove */}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-text-subtle hover:text-status-stopped transition-colors"
            title="Remove policy"
          >
            <svg
              aria-hidden="true"
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Config */}
      {policy.enabled && (
        <div className="p-4">
          <PolicyConfigEditor
            type={policy.type}
            config={policy.config}
            onChange={onConfigChange}
          />
        </div>
      )}
    </div>
  );
}
