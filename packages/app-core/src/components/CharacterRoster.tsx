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
    <div
      className="flex flex-nowrap items-end justify-center gap-0 w-full max-w-[min(100%,900px)] px-4 box-border max-[600px]:!grid max-[600px]:!grid-cols-4 max-[600px]:gap-y-6 max-[600px]:gap-x-0 max-[600px]:px-[2.35rem] max-[600px]:pb-6 max-[600px]:max-w-full max-[600px]:w-full"
      data-testid={`${testIdPrefix}-roster-grid`}
    >
      {entries.map((entry) => {
        const isSelected = selectedId === entry.id;

        return (
          <button
            key={entry.id}
            type="button"
            className={`relative flex-[1_1_0] max-w-36 min-w-0 text-center transition-all duration-300 ease-out cursor-pointer border-none bg-none p-0 mx-[-5rem] opacity-[0.85] hover:opacity-100 max-[600px]:!mx-[-0.85rem] max-[600px]:!max-w-none max-[600px]:opacity-[0.65]${isSelected ? " opacity-100 z-10 max-[600px]:opacity-100" : ""}`}
            onClick={() => onSelect(entry)}
            data-testid={`${testIdPrefix}-preset-${entry.id}`}
            aria-label={`${entry.name}${entry.catchphrase ? ` — ${entry.catchphrase}` : ""}`}
            aria-pressed={isSelected}
          >
            <div
              className="relative aspect-[14/15] w-full p-0.5 transition-all duration-300 bg-border"
              style={{
                clipPath: SLANT_CLIP,
                ...(isSelected
                  ? {
                      background:
                        "linear-gradient(135deg, var(--burnished-gold) 0%, var(--classic-gold) 58%, var(--highlight-gold) 100%)",
                      boxShadow: "0 0 20px var(--gold-glow)",
                    }
                  : {}),
              }}
            >
              <div
                className="relative h-full w-full overflow-hidden"
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
                  className={`h-full w-full object-cover transition-transform duration-300 ease-out${isSelected ? " scale-[1.04]" : ""}`}
                />
                <div className="absolute inset-x-0 bottom-0">
                  <div
                    className={`py-0.5 pr-9 pl-2.5 text-[clamp(8px,1.2vw,11px)] font-semibold text-white whitespace-nowrap overflow-hidden text-ellipsis text-right${isSelected ? " bg-black/[0.78]" : " bg-black/60"}`}
                    style={{
                      clipPath: INSET_CLIP,
                      ...(isSelected
                        ? {
                            boxShadow:
                              "inset 0 1px 0 rgba(255,255,255,0.08)",
                          }
                        : {}),
                    }}
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
