/**
 * Reusable avatar/character VRM selector.
 *
 * Shows a grid of the 8 built-in milady VRMs with preview images,
 * plus an upload option for custom VRM files.
 */

import { useRef } from "react";
import { VRM_COUNT, getVrmPreviewUrl } from "../AppContext";

const AVATAR_NAMES = [
  "", // 0 = custom
  "Remilia",
  "Nyx",
  "Kira",
  "Sable",
  "Ember",
  "Luna",
  "Rei",
  "Maren",
];

export interface AvatarSelectorProps {
  /** Currently selected index (1-8 for built-in, 0 for custom) */
  selected: number;
  /** Called when a built-in avatar is selected */
  onSelect: (index: number) => void;
  /** Called when a custom VRM is uploaded */
  onUpload?: (file: File) => void;
  /** Whether to show the upload option */
  showUpload?: boolean;
  /** Optional label override */
  label?: string;
}

export function AvatarSelector({
  selected,
  onSelect,
  onUpload,
  showUpload = true,
  label,
}: AvatarSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".vrm")) {
      alert("Please select a .vrm file");
      return;
    }
    onUpload?.(file);
    onSelect(0); // 0 = custom
  };

  const avatarIndices = Array.from({ length: VRM_COUNT }, (_, i) => i + 1);

  return (
    <div>
      {label && (
        <div className="text-[13px] font-bold text-txt-strong mb-3">{label}</div>
      )}

      {/* Selected avatar large preview */}
      {selected > 0 && (
        <div className="flex flex-col items-center mb-4">
          <div className="w-32 h-32 rounded-xl overflow-hidden border-2 border-accent shadow-lg bg-card">
            <img
              src={getVrmPreviewUrl(selected)}
              alt={AVATAR_NAMES[selected] || `Milady ${selected}`}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="mt-2 text-sm font-medium text-txt-strong">
            {AVATAR_NAMES[selected] || `Milady ${selected}`}
          </div>
        </div>
      )}

      {/* Avatar grid — 4 columns for visible thumbnails */}
      <div className="grid grid-cols-4 gap-2.5">
        {avatarIndices.map((i) => (
          <button
            key={i}
            className={`relative aspect-square border-2 cursor-pointer bg-card overflow-hidden transition-all rounded-lg ${
              selected === i
                ? "border-accent shadow-[0_0_0_3px_var(--accent-subtle)] scale-[1.03]"
                : "border-border hover:border-accent/50 hover:scale-[1.02]"
            }`}
            onClick={() => onSelect(i)}
            title={AVATAR_NAMES[i] || `Milady ${i}`}
          >
            <img
              src={getVrmPreviewUrl(i)}
              alt={AVATAR_NAMES[i] || `Milady ${i}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent && !parent.querySelector(".fallback")) {
                  const fallback = document.createElement("div");
                  fallback.className = "fallback absolute inset-0 flex items-center justify-center text-muted text-sm";
                  fallback.textContent = AVATAR_NAMES[i] || `${i}`;
                  parent.appendChild(fallback);
                }
              }}
            />
            {selected === i && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center shadow-sm">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            )}
            {/* Name label */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1">
              <div className="text-[10px] text-white text-center font-medium truncate">
                {AVATAR_NAMES[i] || `Milady ${i}`}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Upload custom VRM */}
      {showUpload && (
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            className={`w-full py-2.5 border-2 border-dashed cursor-pointer transition-all rounded-lg text-sm ${
              selected === 0
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border text-muted hover:border-accent/50 hover:text-txt"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            {selected === 0 ? "✓ Custom VRM uploaded" : "Upload custom .vrm file"}
          </button>
        </div>
      )}
    </div>
  );
}
