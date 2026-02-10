/**
 * Reusable avatar/character VRM selector.
 *
 * Shows a single row of the 8 built-in milady VRMs as thumbnail images.
 * The selected avatar gets a highlight ring. No text labels.
 */

import { useRef } from "react";
import { VRM_COUNT, getVrmPreviewUrl } from "../AppContext";

export interface AvatarSelectorProps {
  /** Currently selected index (1-8 for built-in, 0 for custom) */
  selected: number;
  /** Called when a built-in avatar is selected */
  onSelect: (index: number) => void;
  /** Called when a custom VRM is uploaded */
  onUpload?: (file: File) => void;
  /** Whether to show the upload option */
  showUpload?: boolean;
}

export function AvatarSelector({
  selected,
  onSelect,
  onUpload,
  showUpload = true,
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
      <div className="flex flex-wrap gap-3 justify-start">
        {avatarIndices.map((i) => (
          <button
            key={i}
            className={`relative w-24 h-24 shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all ${
              selected === i
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                : "opacity-60 hover:opacity-100 hover:scale-105"
            }`}
            onClick={() => onSelect(i)}
            type="button"
          >
            <img
              src={getVrmPreviewUrl(i)}
              alt={`Avatar ${i}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}

        {/* Upload custom VRM */}
        {showUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className={`w-24 h-24 shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all ${
                selected === 0
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                  : "border-[var(--border)] text-[var(--muted)] opacity-60 hover:opacity-100 hover:border-[var(--accent)] hover:scale-105"
              }`}
              onClick={() => fileInputRef.current?.click()}
              title="Upload custom .vrm"
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
