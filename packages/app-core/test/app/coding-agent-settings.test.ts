/**
 * Tests for CodingAgentSettingsSection save logic.
 *
 * Covers:
 * - Persistence round-trip (prefs → envPatch)
 * - Empty-string handling (clearing coding directory)
 * - Default retention value not polluting save payload
 */
import { describe, expect, it } from "vitest";

/**
 * Replicate the envPatch builder from handleSave so we can test it in
 * isolation without rendering the full component tree.
 */
function buildEnvPatch(prefs: Record<string, string>): Record<string, string> {
  const envPatch: Record<string, string> = {};
  for (const [key, value] of Object.entries(prefs)) {
    if (value != null) {
      envPatch[key] = value;
    }
  }
  return envPatch;
}

/**
 * Replicate the retention onValueChange guard from the Select component.
 */
function shouldSetRetentionPref(
  currentPref: string | undefined,
  newValue: string,
): boolean {
  if (!currentPref && newValue === "pending_decision") return false;
  return true;
}

describe("CodingAgentSettingsSection save logic", () => {
  describe("buildEnvPatch", () => {
    it("includes non-empty string values", () => {
      const prefs = {
        PARALLAX_APPROVAL_MODE: "standard",
        PARALLAX_CODING_DIRECTORY: "~/Projects",
      };
      const patch = buildEnvPatch(prefs);
      expect(patch).toEqual({
        PARALLAX_APPROVAL_MODE: "standard",
        PARALLAX_CODING_DIRECTORY: "~/Projects",
      });
    });

    it("includes empty strings (allows clearing coding directory)", () => {
      const prefs = {
        PARALLAX_APPROVAL_MODE: "standard",
        PARALLAX_CODING_DIRECTORY: "",
      };
      const patch = buildEnvPatch(prefs);
      expect(patch).toHaveProperty("PARALLAX_CODING_DIRECTORY", "");
    });

    it("round-trips: loaded prefs survive save without mutation", () => {
      const loaded = {
        PARALLAX_APPROVAL_MODE: "permissive",
        PARALLAX_DEFAULT_AGENT_TYPE: "claude",
        PARALLAX_CODING_DIRECTORY: "~/dev",
        PARALLAX_SCRATCH_RETENTION: "persistent",
      };
      const patch = buildEnvPatch(loaded);
      expect(patch).toEqual(loaded);
    });
  });

  describe("retention default pollution guard", () => {
    it("blocks setting pending_decision when pref was never stored", () => {
      expect(shouldSetRetentionPref(undefined, "pending_decision")).toBe(false);
    });

    it("allows setting pending_decision when pref was explicitly stored", () => {
      expect(shouldSetRetentionPref("ephemeral", "pending_decision")).toBe(
        true,
      );
    });

    it("allows setting non-default values when pref was never stored", () => {
      expect(shouldSetRetentionPref(undefined, "ephemeral")).toBe(true);
      expect(shouldSetRetentionPref(undefined, "persistent")).toBe(true);
    });

    it("does not write retention to payload when user never touched dropdown", () => {
      // Simulate: config has no retention, user only changes coding dir
      const prefs: Record<string, string> = {
        PARALLAX_APPROVAL_MODE: "standard",
        PARALLAX_CODING_DIRECTORY: "~/Projects",
      };
      // PARALLAX_SCRATCH_RETENTION is absent from prefs
      const patch = buildEnvPatch(prefs);
      expect(patch).not.toHaveProperty("PARALLAX_SCRATCH_RETENTION");
    });
  });

  describe("clear-directory edge case", () => {
    it("clearing coding directory results in empty string in payload", () => {
      const prefs = {
        PARALLAX_APPROVAL_MODE: "standard",
        PARALLAX_CODING_DIRECTORY: "", // user cleared the input
      };
      const patch = buildEnvPatch(prefs);
      expect(patch.PARALLAX_CODING_DIRECTORY).toBe("");
    });

    it("absent coding directory is not included in payload", () => {
      const prefs = {
        PARALLAX_APPROVAL_MODE: "standard",
      };
      const patch = buildEnvPatch(prefs);
      expect(patch).not.toHaveProperty("PARALLAX_CODING_DIRECTORY");
    });
  });
});
