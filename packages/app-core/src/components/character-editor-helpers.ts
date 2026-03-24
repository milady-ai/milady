/**
 * Pure helpers extracted from CharacterEditor and AppContext
 * for testability and reuse.
 */

/**
 * Replace un-substituted `{{name}}` / `{{agentName}}` tokens with the
 * actual character name. Handles legacy persisted templates from onboarding.
 */
export function replaceNameTokens(text: string, name: string): string {
  return text
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{agentName\}\}/g, name);
}

/**
 * Decide whether the character editor should apply preset defaults when
 * auto-selecting a roster entry.
 *
 * Returns `true` when:
 * - The saved character has no meaningful content (fresh state), OR
 * - The active roster entry name differs from the saved character name
 *   (user switched presets — e.g. selected Momo but Chen is saved).
 */
export function shouldApplyPresetDefaults(
  hasMeaningfulContent: boolean,
  savedCharacterName: string | null | undefined,
  rosterEntryName: string,
): boolean {
  if (!hasMeaningfulContent) return true;

  const savedNorm =
    typeof savedCharacterName === "string"
      ? savedCharacterName.trim().toLowerCase()
      : null;
  const entryNorm = rosterEntryName.trim().toLowerCase();

  // Name mismatch means the user navigated to a different preset
  return savedNorm === null || savedNorm !== entryNorm;
}
