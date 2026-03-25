import { dispatchAppEmoteEvent } from "@miladyai/app-core/events";
import { useApp } from "@miladyai/app-core/state";
import { PREMADE_VOICES } from "../../voice/types";
import { getElizaApiToken, resolveApiUrl } from "../../utils";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "../CharacterRoster";
import { resolvePreviewTtsEndpoints } from "./identity-preview-tts";

export function IdentityStep() {
  const { onboardingStyle, handleOnboardingNext, setState, t, uiLanguage } =
    useApp();

  const entries = useMemo(
    () => resolveRosterEntries(getStylePresets(uiLanguage)),
    [uiLanguage],
  );
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
    const firstEntry = entries[0];
    if (!onboardingStyle && firstEntry) {
      handleSelect(firstEntry, false);
    }
  }, [onboardingStyle, handleSelect]);

  useEffect(() => {
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
      // Dynamic import to avoid hard dependency on client when server is absent
      const { client } = await import("@miladyai/app-core/api");
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
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
        <div
          className="text-xs tracking-[0.3em] uppercase text-[var(--onboarding-text-muted)] font-semibold text-center mb-0"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.55)" }}
        >
          {t("settings.importAgent")}
        </div>
        <div className="flex items-center gap-[12px] my-[16px] before:content-[''] before:flex-1 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-[var(--onboarding-divider)] before:to-transparent after:content-[''] after:flex-1 after:h-[1px] after:bg-gradient-to-r after:from-transparent after:via-[var(--onboarding-divider)] after:to-transparent">
          <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
        </div>

        <p
          className="text-sm text-[var(--onboarding-text-muted)] text-center leading-relaxed mt-3 mb-1"
          style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
        >
          {t("onboarding.importDesc")}
        </p>

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
            style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
          >
            {importError}
          </p>
        )}
        {importSuccess && (
          <p
            className="text-sm text-[var(--ok)] text-center leading-relaxed mt-3 !mb-0"
            style={{ textShadow: "0 2px 10px rgba(3,5,10,0.45)" }}
          >
            {importSuccess}
          </p>
        )}

        <div className="flex gap-3 mt-2">
          <Button
            variant="ghost"
            className="text-[10px] text-[var(--onboarding-text-muted)] tracking-[0.15em] uppercase cursor-pointer no-underline bg-none border-none font-inherit transition-colors duration-300 p-0 hover:text-[var(--onboarding-text-strong)]"
            style={{ textShadow: "0 1px 8px rgba(3,5,10,0.45)" }}
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
            className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
            disabled={importBusy || !importFile}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const circle = document.createElement("span");
              const diameter = Math.max(rect.width, rect.height);
              circle.style.width = circle.style.height = `${diameter}px`;
              circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
              circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
              circle.className =
                "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
              e.currentTarget.appendChild(circle);
              setTimeout(() => circle.remove(), 600);
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
        className="text-center"
        style={{ animation: "onboarding-content-fade-in 0.5s ease 0.1s both" }}
      >
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
        className="flex flex-nowrap items-end justify-center gap-0 w-full max-w-[900px] px-2 max-md:px-1 max-md:max-w-full border-t border-[var(--onboarding-roster-border)] bg-[var(--onboarding-roster-bg)] p-4 pb-8 backdrop-blur-md"
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
          className="group relative inline-flex items-center justify-center gap-[8px] px-[32px] py-[12px] min-h-[44px] bg-[var(--onboarding-accent-bg)] border border-[var(--onboarding-accent-border)] rounded-[6px] text-[var(--onboarding-accent-foreground)] text-[11px] font-semibold tracking-[0.18em] uppercase cursor-pointer transition-all duration-300 font-inherit overflow-hidden hover:bg-[var(--onboarding-accent-bg-hover)] hover:border-[var(--onboarding-accent-border-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ textShadow: "0 1px 6px rgba(3,5,10,0.55)" }}
          onClick={(e) => {
            if (e?.currentTarget) {
              const rect = e.currentTarget.getBoundingClientRect();
              const circle = document.createElement("span");
              const diameter = Math.max(rect.width, rect.height);
              circle.style.width = circle.style.height = `${diameter}px`;
              circle.style.left = `${e.clientX - rect.left - diameter / 2}px`;
              circle.style.top = `${e.clientY - rect.top - diameter / 2}px`;
              circle.className =
                "absolute rounded-full bg-[var(--onboarding-ripple)] transform scale-0 animate-[onboarding-ripple-expand_0.6s_ease-out_forwards] pointer-events-none";
              e.currentTarget.appendChild(circle);
              setTimeout(() => circle.remove(), 600);
            }
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
          className="bg-transparent border-none text-[var(--onboarding-text-faint)] text-[11px] cursor-pointer underline font-inherit p-1 px-2 transition-colors duration-300 hover:text-[var(--onboarding-link)]"
        >
          {t("onboarding.restoreFromBackup")}
        </Button>
      </div>
    </div>
  );
}
