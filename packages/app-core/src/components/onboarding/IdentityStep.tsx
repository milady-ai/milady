import { dispatchAppEmoteEvent } from "@miladyai/app-core/events";
import { useApp } from "@miladyai/app-core/state";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWithTimeout,
  resolveCompatApiToken,
} from "../../utils/api-request";
import { resolveApiUrl } from "../../utils/asset-url";
import { getElizaApiToken } from "../../utils/eliza-globals";
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

export function IdentityStep() {
  const { onboardingStyle, handleOnboardingNext, setState, t, uiLanguage } =
    useApp();

  const entries = useMemo(
    () => resolveRosterEntries(getStylePresets(uiLanguage)),
    [uiLanguage],
  );
  const firstEntry = entries[0];
  const selectedId = onboardingStyle || entries[0]?.id || "";

  /* ── Import / restore state ─────────────────────────────────────── */
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
  const teleportPreviewTimerRef = useRef<number | null>(null);

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

      if (selectedPreset?.voiceId) {
        const apiToken = getElizaApiToken()?.trim() ?? "";
        const endpoints = resolvePreviewTtsEndpoints(selectedPreset.voiceId);

        for (const endpoint of endpoints) {
          if (!isCurrentRequest()) return;
          try {
            const response = await fetch(resolveApiUrl(endpoint), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
                ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
              },
              body: JSON.stringify({
                text: catchphrase,
                voiceId: selectedPreset.voiceId,
                modelId: "eleven_flash_v2_5",
                outputFormat: "mp3_44100_128",
              }),
            });
            if (!response.ok) continue;

            const blob = await response.blob();
            if (!isCurrentRequest()) return;
            const objectUrl = URL.createObjectURL(blob);
            previewObjectUrlRef.current = objectUrl;
            const played = await playPreviewFromUrl(objectUrl);
            if (played && isCurrentRequest()) return;
          } catch {
            // Try next endpoint.
          }
        }
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
        if (teleportPreviewTimerRef.current != null) {
          window.clearTimeout(teleportPreviewTimerRef.current);
          teleportPreviewTimerRef.current = null;
        }
        // Character swaps trigger a teleport dissolve; wait for completion before
        // greeting emote/voice or the emote can be swallowed during transition.
        const avatarChanged = previousAvatarIndex !== entry.avatarIndex;
        if (avatarChanged) {
          pendingPreviewEntryRef.current = entry;
        } else {
          pendingPreviewEntryRef.current = null;
          void playSelectionPreview(entry);
        }
      }
    },
    [entries, playSelectionPreview, selectedId, setState, stopPreviewAudio],
  );

  // Auto-select the first one if nothing is selected yet
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
      if (teleportPreviewTimerRef.current != null) {
        window.clearTimeout(teleportPreviewTimerRef.current);
      }
      teleportPreviewTimerRef.current = window.setTimeout(() => {
        teleportPreviewTimerRef.current = null;
        void playSelectionPreview(pending);
      }, 450);
    };
    window.addEventListener("eliza:vrm-teleport-complete", onTeleportComplete);
    return () => {
      window.removeEventListener(
        "eliza:vrm-teleport-complete",
        onTeleportComplete,
      );
    };
  }, [playSelectionPreview]);

  useEffect(() => {
    return () => {
      pendingPreviewEntryRef.current = null;
      previewRequestIdRef.current += 1;
      if (teleportPreviewTimerRef.current != null) {
        window.clearTimeout(teleportPreviewTimerRef.current);
        teleportPreviewTimerRef.current = null;
      }
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

  /* ── Import UI ──────────────────────────────────────────────────── */
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

        {importError && (
          <p
            className="text-sm text-[var(--danger)] text-center leading-relaxed mt-3 !mb-0"
            style={onboardingBodyTextShadowStyle}
          >
            {importError}
          </p>
        )}
        {importSuccess && (
          <p
            className="text-sm text-[var(--ok)] text-center leading-relaxed mt-3 !mb-0"
            style={onboardingBodyTextShadowStyle}
          >
            {importSuccess}
          </p>
        )}

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

  /* ── Overwatch-style character select — full-width bottom bar ──── */
  const selected = entries.find((e) => e.id === selectedId);

  return (
    <div
      className="flex flex-col items-center gap-3 w-full"
      style={{ animation: "onboarding-content-fade-in 0.6s ease both" }}
    >
      {/* Selected character info — floats above the roster */}
      <div
        className="w-full text-center"
        style={{ animation: "onboarding-content-fade-in 0.5s ease 0.1s both" }}
      >
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--onboarding-text-muted)]"
          style={onboardingBodyTextShadowStyle}
        >
          {t("onboarding.stepSub.identity")}
        </div>
        <div
          className="text-[28px] font-bold tracking-[0.12em] uppercase text-[var(--onboarding-text-strong)] transition-all duration-300 max-md:text-xl"
          style={{
            textShadow:
              "0 0 30px rgba(240,185,11,0.3), 0 2px 12px rgba(3,5,10,0.65)",
          }}
        >
          {selected?.name ?? ""}
        </div>
      </div>

      {/* ── Roster bar ── */}
      <div
        className="flex flex-nowrap items-end justify-center gap-0 w-full max-w-[900px] px-2 max-md:px-1 max-md:max-w-full rounded-[18px] border border-[var(--onboarding-panel-border)] bg-[linear-gradient(180deg,rgba(9,12,18,0.18),rgba(9,12,18,0.08)),var(--onboarding-panel-bg)] p-4 pb-8 backdrop-blur-[36px] backdrop-saturate-[1.24] shadow-[var(--onboarding-panel-shadow)]"
        style={{
          animation:
            "ob-roster-slide-up 0.5s cubic-bezier(0.25,0.46,0.45,0.94) 0.15s both",
        }}
      >
        <CharacterRoster
          entries={entries}
          selectedId={selectedId}
          onSelect={(entry) => handleSelect(entry, true)}
          variant="onboarding"
          testIdPrefix="onboarding"
        />
      </div>

      <div
        className="flex flex-col items-center gap-2 pb-6 max-md:pb-4"
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
        <Button
          variant="link"
          type="button"
          onClick={() => setShowImport(true)}
          className={onboardingLinkActionClass}
        >
          {t("onboarding.restoreFromBackup")}
        </Button>
      </div>
    </div>
  );
}
