/**
 * Shared character roster grid — slant-clipped card selector used by both
 * onboarding (selection-only) and the character editor (with customization).
 */

import type { MiladyStylePreset } from "@miladyai/app-core/onboarding-presets";
import { getVrmPreviewUrl } from "@miladyai/app-core/state";

/* ── Shared constants ─────────────────────────────────────────────────── */

export const SLANT_CLIP =
  "polygon(32px 0, 100% 0, calc(100% - 32px) 100%, 0 100%)";
export const INSET_CLIP =
  "polygon(0px 0, 100% 0, calc(100% - 4px) 100%, -8px 100%)";

/* ── Types ────────────────────────────────────────────────────────────── */

export type CharacterRosterEntry = {
  id: string;
  name: string;
  avatarIndex: number;
  voicePresetId?: string;
  catchphrase?: string;
  greetingAnimation?: string;
  preset: MiladyStylePreset;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

export function resolveRosterEntries(
  styles: readonly MiladyStylePreset[],
): CharacterRosterEntry[] {
  return styles.map((preset, index) => {
    const fallbackName = `Character ${index + 1}`;
    return {
      id: preset.catchphrase,
      name: preset.name ?? fallbackName,
      avatarIndex: preset.avatarIndex ?? (index % 4) + 1,
      voicePresetId: preset.voicePresetId,
      catchphrase: preset.catchphrase,
      greetingAnimation: preset.greetingAnimation,
      preset,
    };
  });
}

/* ── Component ────────────────────────────────────────────────────────── */

interface CharacterRosterProps {
  entries: CharacterRosterEntry[];
  selectedId: string | null;
  onSelect: (entry: CharacterRosterEntry) => void;
  /** "onboarding" always uses translucent white borders; "editor" uses theme-aware borders. */
  variant?: "onboarding" | "editor";
  testIdPrefix?: string;
}

export function CharacterRoster({
  entries,
  selectedId,
  onSelect,
  variant = "editor",
  testIdPrefix = "character",
}: CharacterRosterProps) {
  const useWhiteBorders = variant === "onboarding";

  if (entries.length === 0) {
    return (
      <div
        className={`rounded-2xl border p-4 text-sm ${
          useWhiteBorders
            ? "border-white/10 bg-black/10 text-white/50"
            : "border-border/40 bg-black/10 text-muted"
        }`}
      >
        Loading character presets...
      </div>
    );
  }

  return (
    <div className="ce-roster" data-testid={`${testIdPrefix}-roster-grid`}>
      {entries.map((entry) => {
        const isSelected = selectedId === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            className={`ce-roster-card ${isSelected ? "ce-roster-card--active" : ""}`}
            onClick={() => onSelect(entry)}
            data-testid={`${testIdPrefix}-preset-${entry.id}`}
            aria-label={`${entry.name}${entry.catchphrase ? ` — ${entry.catchphrase}` : ""}`}
            aria-pressed={isSelected}
          >
            <div
              className={`ce-roster-card-frame ${isSelected ? "ce-roster-card-frame--active" : ""}`}
              style={{ clipPath: SLANT_CLIP }}
            >
              <div
                className="ce-roster-card-inner"
                style={{ clipPath: SLANT_CLIP }}
              >
                {isSelected && (
                  <div
                    className="pointer-events-none absolute -inset-3 bg-yellow-300/15 blur-xl"
                    style={{ clipPath: SLANT_CLIP }}
                  />
                )}
                <img
                  src={getVrmPreviewUrl(entry.avatarIndex)}
                  alt={entry.name}
                  draggable={false}
                  className={`ce-roster-card-img ${isSelected ? "ce-roster-card-img--active" : ""}`}
                />
                <div className="ce-roster-card-label">
                  <div
                    className={`ce-roster-card-name ${isSelected ? "ce-roster-card-name--active" : ""}`}
                    style={{ clipPath: INSET_CLIP }}
                  >
                    {entry.name}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
