export interface VoicePillProps {
  ariaLabel?: string;
}

export function VoicePill({ ariaLabel = "Eliza" }: VoicePillProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      data-milady-voice-pill-fallback=""
    >
      {ariaLabel}
    </div>
  );
}
