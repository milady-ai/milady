import { describe, expect, it } from "vitest";
import { resolveCharacterVoiceConfigFromAppConfig } from "./character-voice-config";

describe("resolveCharacterVoiceConfigFromAppConfig", () => {
  it("upgrades missing playback voice config to the selected character voice", () => {
    expect(
      resolveCharacterVoiceConfigFromAppConfig({
        config: {
          ui: {
            presetId: "momo",
            avatarIndex: 4,
          },
        },
        uiLanguage: "en",
      }),
    ).toEqual({
      voiceConfig: {
        provider: "elevenlabs",
        elevenlabs: {
          voiceId: "n7Wi4g1bhpw4Bs8HK5ph",
          modelId: "eleven_flash_v2_5",
        },
      },
      shouldPersist: true,
    });
  });

  it("migrates legacy generic preset voices to the dedicated character voice", () => {
    expect(
      resolveCharacterVoiceConfigFromAppConfig({
        config: {
          ui: {
            presetId: "jin",
            avatarIndex: 2,
          },
          messages: {
            tts: {
              provider: "elevenlabs",
              mode: "cloud",
              elevenlabs: {
                voiceId: "pNInz6obpgDQGcFmaJgB",
                modelId: "eleven_flash_v2_5",
              },
            },
          },
        },
        uiLanguage: "en",
      }),
    ).toEqual({
      voiceConfig: {
        provider: "elevenlabs",
        mode: "cloud",
        elevenlabs: {
          voiceId: "6IwYbsNENZgAB1dtBZDp",
          modelId: "eleven_flash_v2_5",
        },
      },
      shouldPersist: true,
    });
  });

  it("preserves explicit manual voice overrides", () => {
    expect(
      resolveCharacterVoiceConfigFromAppConfig({
        config: {
          ui: {
            presetId: "momo",
            avatarIndex: 4,
          },
          messages: {
            tts: {
              provider: "elevenlabs",
              elevenlabs: {
                voiceId: "21m00Tcm4TlvDq8ikWAM",
                modelId: "eleven_flash_v2_5",
              },
            },
          },
        },
        uiLanguage: "en",
      }),
    ).toEqual({
      voiceConfig: {
        provider: "elevenlabs",
        elevenlabs: {
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          modelId: "eleven_flash_v2_5",
        },
      },
      shouldPersist: false,
    });
  });
});
