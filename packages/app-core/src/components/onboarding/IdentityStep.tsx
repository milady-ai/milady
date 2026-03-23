import { STYLE_PRESETS } from "@miladyai/app-core/onboarding-presets";
import { getVrmPreviewUrl, useApp } from "@miladyai/app-core/state";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "../CharacterRoster";

/* ── Hardcoded frontend presets — no server needed ─────────────── */

const FRONTEND_PRESETS = resolveRosterEntries(STYLE_PRESETS);

export function IdentityStep() {
  const { onboardingStyle, handleOnboardingNext, setState, t } = useApp();

  const entries = FRONTEND_PRESETS;
  const selectedId = onboardingStyle || entries[0]?.catchphrase || "";

  /* ── Import / restore state ─────────────────────────────────────── */
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importBusyRef = useRef(false);

  const handleSelect = useCallback(
    (entry: CharacterRosterEntry) => {
      setState("onboardingStyle", entry.catchphrase ?? entry.id);
      setState("onboardingName", entry.name);
      setState("selectedVrmIndex", entry.avatarIndex);
    },
    [setState],
  );

  // Auto-select the first one if nothing is selected yet
  useEffect(() => {
    const firstEntry = entries[0];
    if (!onboardingStyle && firstEntry) {
      handleSelect(firstEntry);
    }
  }, [onboardingStyle, entries, handleSelect]);

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
        <div className="text-xs tracking-[0.3em] uppercase text-[rgba(240,238,250,0.62)] font-semibold text-center mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.55)' }}>
          {t("settings.importAgent")}
        </div>
        <div className="onboarding-divider">
          <div className="w-1.5 h-1.5 bg-[rgba(240,185,11,0.4)] rotate-45 shrink-0" />
        </div>

        <p className="text-sm text-[rgba(240,238,250,0.62)] text-center leading-relaxed mt-3 mb-1" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>{t("onboarding.importDesc")}</p>

        <input
          type="file"
          accept=".eliza-agent"
          onChange={(e) => {
            setImportFile(e.target.files?.[0] ?? null);
            setImportError(null);
          }}
          className="onboarding-input text-[13px] text-left"
        />

        <input
          type="password"
          placeholder={t("onboarding.decryptionPasswordPlaceholder")}
          value={importPassword}
          onChange={(e) => {
            setImportPassword(e.target.value);
            setImportError(null);
          }}
          className="onboarding-input"
        />

        {importError && (
          <p className="text-sm text-[var(--danger)] text-center leading-relaxed mt-3 !mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="text-sm text-[var(--ok)] text-center leading-relaxed mt-3 !mb-0" style={{ textShadow: '0 2px 10px rgba(3,5,10,0.45)' }}>
            {importSuccess}
          </p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            className="onboarding-back-link"
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
          </button>
          <button
            className="onboarding-confirm-btn"
            disabled={importBusy || !importFile}
            onClick={() => void handleImportAgent()}
            type="button"
          >
            {importBusy ? t("onboarding.importing") : t("onboarding.restore")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Overwatch-style character select — full-width bottom bar ──── */
  const selected = entries.find((e) => e.catchphrase === selectedId);

  return (
    <div className="flex flex-col items-center gap-3 w-full" style={{ animation: 'onboarding-content-fade-in 0.6s ease both' }}>
      {/* Selected character info — floats above the roster */}
      <div className="text-center" style={{ animation: 'onboarding-content-fade-in 0.5s ease 0.1s both' }}>
        <div className="text-[28px] font-bold tracking-[0.12em] uppercase text-[rgba(240,238,250,0.95)] transition-all duration-300 max-md:text-xl" style={{ textShadow: '0 0 30px rgba(240,185,11,0.3), 0 2px 12px rgba(3,5,10,0.65)' }}>{selected?.name ?? ""}</div>
      </div>

      {/* ── Roster bar ── */}
      <div className="flex flex-nowrap items-end justify-center gap-0 w-full max-w-[900px] px-2 max-md:px-1 max-md:max-w-full border-t border-white/5 bg-black/50 p-4 pb-8 backdrop-blur-md" style={{ animation: 'ob-roster-slide-up 0.5s cubic-bezier(0.25,0.46,0.45,0.94) 0.15s both' }}>
        <CharacterRoster
          entries={entries}
          selectedId={selectedId}
          onSelect={handleSelect}
          variant="onboarding"
          testIdPrefix="onboarding"
        />
      </div>

      {/* ── Actions row ── */}
      <div className="flex flex-col items-center gap-2 pb-6 max-md:pb-4" style={{ animation: 'onboarding-content-fade-in 0.5s ease 0.3s both' }}>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="bg-transparent border-none text-[rgba(240,238,250,0.35)] text-[11px] cursor-pointer underline font-inherit p-1 px-2 transition-colors duration-300 hover:text-[rgba(240,238,250,0.65)]"
        >
          {t("onboarding.restoreFromBackup")}
        </button>
      </div>
    </div>
  );
}
