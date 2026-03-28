import {
  dispatchAppEmoteEvent,
  dispatchWindowEvent,
  ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT,
  VRM_TELEPORT_COMPLETE_EVENT,
} from "@miladyai/app-core/events";
import { useApp } from "@miladyai/app-core/state";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getElizaApiToken, resolveAppAssetUrl } from "../../utils";
import {
  fetchWithTimeout,
  resolveCompatApiToken,
} from "../../utils/api-request";
import { resolveApiUrl } from "../../utils/asset-url";
import { PREMADE_VOICES } from "../../voice/types";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "../CharacterRoster";
import { resolvePreviewTtsEndpoints } from "./identity-preview-tts";

import {
  OnboardingStepHeader,
  onboardingBodyTextShadowStyle,
  onboardingFooterClass,
  onboardingLinkActionClass,
  onboardingPrimaryActionClass,
  onboardingPrimaryActionTextShadowStyle,
  onboardingSecondaryActionClass,
  onboardingSecondaryActionTextShadowStyle,
  spawnOnboardingRipple,
} from "./onboarding-step-chrome";

const IMPORT_AGENT_FETCH_TIMEOUT_MS = 60_000;

export interface IdentityStepProps {
  /**
   * When the onboarding VRM stage is off (`disableVrm`), `eliza:vrm-teleport-complete`
   * never fires — play the voice preview immediately on character swap instead of
   * waiting on an event that will not arrive.
   */
  gateVoicePreviewOnTeleport?: boolean;
}

export function IdentityStep({
  gateVoicePreviewOnTeleport = true,
}: IdentityStepProps) {
  const { onboardingStyle, handleOnboardingNext, setState, t, uiLanguage } =
    useApp();

  const entries = useMemo(
    () => resolveRosterEntries(getStylePresets(uiLanguage)),
    [uiLanguage],
  );
  const firstEntry = entries[0];
  const selectedId = onboardingStyle || entries[0]?.id || "";
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importBusyRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const pendingPreviewEntryRef = useRef<CharacterRosterEntry | null>(null);

  const stopPreviewAudio = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  }, []);

  const playPreviewFromUrl = useCallback(
    async (url: string) => {
      stopPreviewAudio();
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      try {
        await audio.play();
        return true;
      } catch {
        return false;
      }
    },
    [stopPreviewAudio],
  );

  const playSelectionPreview = useCallback(
    async (entry: CharacterRosterEntry) => {
      const requestId = ++previewRequestIdRef.current;
      const isCurrentRequest = () => previewRequestIdRef.current === requestId;

      const animationPath =
        entry.greetingAnimation?.trim() || "animations/emotes/greeting.fbx";
      dispatchAppEmoteEvent({
        emoteId: "greeting",
        path: `/${animationPath.replace(/^\/+/, "")}`,
        duration: 2.5,
        loop: false,
        showOverlay: false,
      });

      const catchphrase = entry.catchphrase?.trim();
      if (!catchphrase || typeof window === "undefined") return;

      const selectedPreset = entry.voicePresetId
        ? PREMADE_VOICES.find((voice) => voice.id === entry.voicePresetId)
        : undefined;

      if (selectedPreset?.previewUrl) {
        const played = await playPreviewFromUrl(selectedPreset.previewUrl);
        if (played && isCurrentRequest()) return;
      }

      if (entry.id) {
        // Use offline preset MP3s for onboarding
        const offlineUrl = resolveAppAssetUrl(`audio/previews/${entry.id}.mp3`);
        const played = await playPreviewFromUrl(offlineUrl);
        if (played && isCurrentRequest()) return;
      }

      // Intentionally do not fall back to generic system/browser TTS voices for
      // onboarding previews. If preset sample + ElevenLabs are unavailable, stay
      // silent instead of degrading character identity quality.
    },
    [playPreviewFromUrl],
  );

  const handleSelect = useCallback(
    (entry: CharacterRosterEntry, preview = false) => {
      const previousAvatarIndex = selectedId
        ? entries.find((candidate) => candidate.id === selectedId)?.avatarIndex
        : undefined;
      setState("onboardingStyle", entry.id);
      setState("onboardingName", entry.name);
      setState("selectedVrmIndex", entry.avatarIndex);
      if (preview) {
        previewRequestIdRef.current += 1;
        stopPreviewAudio();
        pendingPreviewEntryRef.current = null;
        // Avatar swaps use a teleport dissolve when VrmStage is mounted; defer preview until
        // `VRM_TELEPORT_COMPLETE_EVENT`. When onboarding skips VRM, OnboardingWizard listens
        // for `ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT` and echoes teleport-complete.
        const avatarChanged = previousAvatarIndex !== entry.avatarIndex;
        if (avatarChanged && gateVoicePreviewOnTeleport) {
          pendingPreviewEntryRef.current = entry;
          dispatchWindowEvent(ONBOARDING_VOICE_PREVIEW_AWAIT_TELEPORT_EVENT);
        } else {
          void playSelectionPreview(entry);
        }
      }
    },
    [
      entries,
      gateVoicePreviewOnTeleport,
      playSelectionPreview,
      selectedId,
      setState,
      stopPreviewAudio,
    ],
  );
  useEffect(() => {
    if (!onboardingStyle && firstEntry) {
      handleSelect(firstEntry, false);
    }
  }, [onboardingStyle, handleSelect, firstEntry]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onTeleportComplete = () => {
      const pending = pendingPreviewEntryRef.current;
      if (!pending) return;
      pendingPreviewEntryRef.current = null;
      void playSelectionPreview(pending);
    };
    window.addEventListener(VRM_TELEPORT_COMPLETE_EVENT, onTeleportComplete);
    return () => {
      window.removeEventListener(
        VRM_TELEPORT_COMPLETE_EVENT,
        onTeleportComplete,
      );
    };
  }, [playSelectionPreview]);

  useEffect(() => {
    return () => {
      pendingPreviewEntryRef.current = null;
      previewRequestIdRef.current += 1;
      stopPreviewAudio();
    };
  }, [stopPreviewAudio]);

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError(t("onboarding.selectFileError"));
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError(t("onboarding.passwordMinError"));
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const passwordBytes = new TextEncoder().encode(importPassword);
      const envelope = new Uint8Array(
        4 + passwordBytes.length + fileBuffer.byteLength,
      );
      const view = new DataView(envelope.buffer);
      view.setUint32(0, passwordBytes.length, false);
      envelope.set(passwordBytes, 4);
      envelope.set(new Uint8Array(fileBuffer), 4 + passwordBytes.length);

      const apiToken = resolveCompatApiToken();
      const response = await fetchWithTimeout(
        resolveApiUrl("/api/agent/import"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
          },
          body: envelope,
        },
        IMPORT_AGENT_FETCH_TIMEOUT_MS,
      );

      const responseText = await response.text();
      let result = {} as {
        error?: string;
        success?: boolean;
        agentId?: string;
        agentName?: string;
        counts?: Record<string, number>;
      };

      if (responseText) {
        try {
          result = JSON.parse(responseText) as typeof result;
        } catch {
          if (!response.ok) {
            throw new Error(`Import failed (${response.status})`);
          }
          throw new Error("Import failed (invalid server response)");
        }
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? `Import failed (${response.status})`);
      }
      const counts = result.counts ?? {};
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully${summary ? `: ${summary}` : ""}. Restarting...`,
      );
      setImportPassword("");
      setImportFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword, t]);
  if (showImport) {
    return (
      <div className="flex flex-col items-center gap-3 w-full max-w-[400px]">
        <OnboardingStepHeader
          eyebrow={t("settings.importAgent")}
          description={t("onboarding.importDesc")}
          descriptionClassName="mt-1 mb-1"
        />

        <input
          type="file"
          accept=".eliza-agent"
          onChange={(e) => {
            setImportFile(e.target.files?.[0] ?? null);
            setImportError(null);
          }}
          className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)] text-[13px] text-left"
        />

        <Input
          type="password"
          placeholder={t("onboarding.decryptionPasswordPlaceholder")}
          value={importPassword}
          onChange={(e) => {
            setImportPassword(e.target.value);
            setImportError(null);
          }}
          className="w-full px-[20px] py-[16px] bg-[var(--onboarding-card-bg)] border border-[var(--onboarding-card-border)] rounded-[6px] text-[var(--onboarding-text-primary)] font-inherit outline-none tracking-[0.03em] text-center transition-all duration-300 focus:border-[var(--onboarding-field-focus-border)] focus:shadow-[var(--onboarding-field-focus-shadow)] placeholder:text-[var(--onboarding-text-faint)]"
        />

        <div className={`${onboardingFooterClass} mt-2 w-full border-t-0 pt-0`}>
          <Button
            variant="ghost"
            className={onboardingSecondaryActionClass}
            style={onboardingSecondaryActionTextShadowStyle}
            onClick={() => {
              setShowImport(false);
              setImportError(null);
              setImportSuccess(null);
              setImportFile(null);
              setImportPassword("");
            }}
            type="button"
          >
            {t("common.cancel")}
          </Button>
          <Button
            className={onboardingPrimaryActionClass}
            style={onboardingPrimaryActionTextShadowStyle}
            disabled={importBusy || !importFile}
            onClick={(e) => {
              spawnOnboardingRipple(e.currentTarget, {
                x: e.clientX,
                y: e.clientY,
              });
              void handleImportAgent();
            }}
            type="button"
          >
            {importBusy ? t("onboarding.importing") : t("onboarding.restore")}
          </Button>
        </div>
      </div>
    );
  }
  const selected = entries.find((e) => e.id === selectedId);

  return (
    <div
      className="flex w-full flex-col items-center gap-3 max-md:max-h-[calc(100dvh-6.5rem)] max-md:overflow-y-auto max-md:px-4 max-md:pb-2"
      style={{ animation: "onboarding-content-fade-in 0.6s ease both" }}
    >
      <CharacterRoster
        entries={entries}
        selectedId={selectedId}
        onSelect={(entry) => handleSelect(entry, true)}
        variant="onboarding"
        testIdPrefix="onboarding"
      />

      <div
        className="flex flex-col items-center gap-2 pb-6 max-md:pb-2"
        style={{ animation: "onboarding-content-fade-in 0.5s ease 0.3s both" }}
      >
        <Button
          className={onboardingPrimaryActionClass}
          style={onboardingPrimaryActionTextShadowStyle}
          onClick={(event?: React.MouseEvent<HTMLButtonElement>) => {
            spawnOnboardingRipple(
              event?.currentTarget ?? null,
              event
                ? {
                    x: event.clientX,
                    y: event.clientY,
                  }
                : undefined,
            );
            handleOnboardingNext();
          }}
          type="button"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
