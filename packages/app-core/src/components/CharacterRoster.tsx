/**
 * Shared character roster grid — slant-clipped card selector used by both
 * onboarding (selection-only) and the character editor (with customization).
 */

import { getVrmPreviewUrl } from "@miladyai/app-core/state";
import type { StylePreset } from "@miladyai/shared/contracts/onboarding";
import { Button } from "@miladyai/ui";
import { useApp } from "../state";

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
  preset: StylePreset;
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

export function resolveRosterEntries(
  styles: readonly StylePreset[],
): CharacterRosterEntry[] {
  return styles.map((preset, index) => {
    const fallbackName = `Character ${index + 1}`;
    return {
      id: preset.id,
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
  const { t } = useApp();
  const useWhiteBorders = variant === "onboarding";

  if (entries.length === 0) {
    return (
      <div
        className={`rounded-2xl border p-4 text-sm ${
          useWhiteBorders
            ? "border-[var(--onboarding-card-border)] bg-[var(--onboarding-card-bg)] text-[var(--onboarding-text-faint)]"
            : "border-border/40 bg-black/10 text-muted"
        }`}
      >
        {t("characterroster.LoadingPresets", {
          defaultValue: "Loading character presets...",
        })}
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
          <Button
            key={entry.id}
            variant="ghost"
            className={`relative max-w-36 min-w-0 text-center transition-all duration-300 ease-out cursor-pointer appearance-none opacity-[0.85] hover:opacity-100 max-[600px]:!max-w-none max-[600px]:opacity-[0.65] h-auto rounded-none p-0${isSelected ? " opacity-100 z-10 max-[600px]:opacity-100" : ""}`}
            style={{
              flex: "1 1 0",
              border: "none",
              background: "none",
              padding: 0,
              margin: "0 -0.75rem",
            }}
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
                        "linear-gradient(180deg, color-mix(in srgb, var(--accent) 90%, white 10%) 0%, var(--accent) 100%)",
                      boxShadow:
                        "0 0 16px rgba(var(--accent-rgb, 240, 185, 11), 0.16)",
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
                    className="pointer-events-none absolute -inset-3 bg-[rgba(var(--accent-rgb,240,185,11),0.15)] blur-xl"
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
                    className={`py-1 pr-9 pl-2.5 text-[clamp(9px,1.22vw,12px)] font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-right tracking-[0.01em] ${
                      useWhiteBorders
                        ? "text-[var(--onboarding-text-strong)]"
                        : "text-white"
                    }${isSelected ? (useWhiteBorders ? " bg-[rgba(7,11,15,0.9)]" : " bg-black/[0.82]") : useWhiteBorders ? " bg-[rgba(7,11,15,0.8)]" : " bg-black/[0.72]"}`}
                    style={{
                      clipPath: INSET_CLIP,
                      textShadow: "0 2px 10px rgba(3,5,10,0.72)",
                      ...(isSelected
                        ? {
                            boxShadow: useWhiteBorders
                              ? "inset 0 1px 0 rgba(255,255,255,0.22)"
                              : "inset 0 1px 0 rgba(255,255,255,0.1)",
                          }
                        : {}),
                    }}
                  >
                    {entry.name}
                  </div>
                </div>
              </div>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
