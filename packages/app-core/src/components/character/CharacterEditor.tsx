/**
 * Full-width character editor — replaces the narrow notebook-style CharacterView.
 *
 * Two-panel layout: left panel has roster + identity + bio + system prompt,
 * right panel has style rules + examples. Footer has voice + save + reset.
 */

import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button } from "@miladyai/ui";
import { client } from "../../api/client";
import {
  APP_EMOTE_EVENT,
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "../../events/index";
import { useChatAvatarVoiceBridge, useVoiceChat } from "../../hooks";
import { useApp } from "../../state/useApp";
import { normalizeCharacterMessageExamples } from "../../utils/character-message-examples";
import {
  EDGE_BACKUP_VOICES,
  hasConfiguredApiKey,
  PREMADE_VOICES,
  sanitizeApiKey,
} from "../../voice/types";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "./CharacterRoster";
import { resolveCharacterGreetingAnimation } from "./character-greeting";
import {
  buildCharacterDraftFromPreset,
  getOnboardingPresetStyles,
  type OnboardingPreset,
  shouldApplyPresetDefaults,
} from "./character-editor-helpers";
import {
  buildVoiceConfigForCharacterEntry,
  type CharacterEditorVoiceConfig,
  DEFAULT_ELEVEN_FAST_MODEL,
  EDGE_VOICE_GROUPS,
  ELEVENLABS_VOICE_GROUPS,
} from "./character-voice-config";
import {
  CharacterExamplesPanel,
  CharacterIdentityPanel,
  CharacterStylePanel,
  CHARACTER_EDITOR_SECTION_CLASSNAME,
} from "./CharacterEditorPanels";

/* Inline SVG icon helpers – avoids adding lucide-react as a dependency. */
const svgBase = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const Icon = ({ className, d }: { className?: string; d: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);

const RotateCcw = ({ className }: { className?: string }) => (
  <Icon className={className} d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
);

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* ── Shared accent styles ────────────────────────────────────────── */
const accentGradientStyle = {
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, white 8%) 0%, var(--accent) 100%)",
  color: "var(--accent-foreground, #1a1f26)",
  borderColor: "rgba(var(--accent-rgb, 240, 185, 11), 0.5)",
  boxShadow:
    "0 0 14px rgba(var(--accent-rgb, 240, 185, 11), 0.16), inset 0 1px 0 var(--soft-white-glow)",
} as const;

const idleSaveBtnStyle = {
  background:
    "linear-gradient(180deg, rgba(var(--accent-rgb,240,185,11),0.16) 0%, rgba(var(--accent-rgb,240,185,11),0.1) 100%)",
  color: "rgba(var(--accent-rgb, 240, 185, 11), 0.78)",
  borderColor: "rgba(var(--accent-rgb, 240, 185, 11), 0.22)",
  boxShadow: "none",
} as const;

const pageTabsBoxShadow =
  "0 10px 26px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)";

const CHARACTER_EDITOR_TABLIST_CLASSNAME =
  "flex shrink-0 items-center gap-1 rounded-lg border border-border bg-elevated p-1";
const CHARACTER_EDITOR_TAB_CLASSNAME =
  "flex-initial cursor-pointer rounded-md border border-transparent bg-transparent px-[0.6rem] py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-txt transition-[background,border-color,color,box-shadow] duration-150 hover:border-border hover:bg-bg-hover hover:text-txt-strong";
const CHARACTER_EDITOR_FOOTER_ACTION_CLASSNAME =
  "h-9 rounded-xl px-6 text-[13px] font-bold tracking-[0.05em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:opacity-50";

/* ── Constants ─────────────────────────────────────────────────────── */

const CHARACTER_EDITOR_PAGES = ["identity", "style", "examples"] as const;

/* ── Component ─────────────────────────────────────────────────────── */

export function CharacterEditor({
  sceneOverlay: _sceneOverlay = false,
  inModal: _inModal = false,
}: {
  sceneOverlay?: boolean;
  inModal?: boolean;
} = {}) {
  const {
    tab,
    setTab,
    characterData,
    characterDraft,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    chatAgentVoiceMuted: _chatAgentVoiceMuted,
    characterSaveError,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleSaveCharacter,
    loadCharacter,
    setState,
    onboardingOptions,
    selectedVrmIndex,
    customVrmUrl: _customVrmUrl,
    t,
    uiLanguage,
    registryStatus: _registryStatus,
    registryLoading: _registryLoading,
    registryRegistering: _registryRegistering,
    registryError: _registryError,
    dropStatus: _dropStatus,
    loadRegistryStatus,
    registerOnChain: _registerOnChain,
    syncRegistryProfile: _syncRegistryProfile,
    loadDropStatus,
    walletConfig: _walletConfig,
    elizaCloudConnected,
    elizaCloudVoiceProxyAvailable,
  } = useApp();

  /** ElevenLabs voices are available only when direct key or cloud voice routing is active. */
  const useElevenLabs = elizaCloudConnected || elizaCloudVoiceProxyAvailable;
  const elevenLabsVoiceGroups = ELEVENLABS_VOICE_GROUPS.map((group) => ({
    label: t(group.labelKey, { defaultValue: group.defaultLabel }),
    items: group.items,
  }));
  const edgeVoiceGroups = EDGE_VOICE_GROUPS.map((group) => ({
    label: t(group.labelKey, { defaultValue: group.defaultLabel }),
    items: group.items,
  }));

  useEffect(() => {
    void loadCharacter();
    void loadRegistryStatus();
    void loadDropStatus();
  }, [loadCharacter, loadRegistryStatus, loadDropStatus]);

  const handleFieldEdit = useCallback(
    (field: string, value: unknown) => {
      if (!suppressDirtyRef.current) setFieldsEdited(true);
      // biome-ignore lint/suspicious/noExplicitAny: typed field key interop
      handleCharacterFieldInput(field as any, value as any);
    },
    [handleCharacterFieldInput],
  );

  const handleStyleEdit = useCallback(
    (key: string, value: string) => {
      if (!suppressDirtyRef.current) setFieldsEdited(true);
      // biome-ignore lint/suspicious/noExplicitAny: typed field key interop
      handleCharacterStyleInput(key as any, value);
    },
    [handleCharacterStyleInput],
  );

  /* ── Generation ─────────────────────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<
    "identity" | "style" | "examples"
  >("identity");
  const [rightTab, setRightTab] = useState<"style" | "examples">("style");
  const [customizing, setCustomizing] = useState(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // Sync rightTab with activePage
  useEffect(() => {
    if (activePage === "style") setRightTab("style");
    else if (activePage === "examples") setRightTab("examples");
  }, [activePage]);

  useEffect(() => {
    if (!customizing) return;
    leftPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [customizing]);

  /* ── Style entry state ──────────────────────────────────────────── */
  const [pendingStyleEntries, setPendingStyleEntries] = useState<
    Record<string, string>
  >({ all: "", chat: "", post: "" });
  const [styleEntryDrafts, setStyleEntryDrafts] = useState<
    Record<string, string[]>
  >({ all: [], chat: [], post: [] });

  /* ── Roster state ───────────────────────────────────────────────── */
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );
  /** The character ID that was last saved or loaded from the server. */
  const [savedCharacterId, setSavedCharacterId] = useState<string | null>(null);
  /** Tracks whether character fields have been edited since last save/load. */
  const [fieldsEdited, setFieldsEdited] = useState(false);
  /** Ref to suppress dirty-tracking during programmatic field updates. */
  const suppressDirtyRef = useRef(false);
  /** Queued greeting to play after VRM teleport-in dissolve finishes. */
  const pendingGreetingRef = useRef<{
    characterId: string;
    catchphrase: string;
    animationPath: string | null;
  } | null>(null);
  const onboardingPresetStyles = useMemo(
    () => getOnboardingPresetStyles(onboardingOptions),
    [onboardingOptions],
  );
  const [rosterStyles, setRosterStyles] = useState<OnboardingPreset[]>([
    ...onboardingPresetStyles,
  ]);

  /* ── Voice config state ─────────────────────────────────────────── */
  const [voiceConfig, setVoiceConfig] = useState<CharacterEditorVoiceConfig>(
    {},
  );

  const handleChatAvatarSpeakingChange = useCallback(
    (isSpeaking: boolean) => {
      setState("chatAvatarSpeaking", isSpeaking);
    },
    [setState],
  );

  const voice = useVoiceChat({
    cloudConnected: useElevenLabs,
    interruptOnSpeech: false,
    lang: "en-US",
    // biome-ignore lint/suspicious/noExplicitAny: complex type
    voiceConfig: voiceConfig as any,
    onTranscript: () => {},
  });

  useChatAvatarVoiceBridge({
    mouthOpen: voice.mouthOpen,
    isSpeaking: voice.isSpeaking,
    usingAudioAnalysis: voice.usingAudioAnalysis,
    onSpeakingChange: handleChatAvatarSpeakingChange,
  });
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio, setVoiceTestAudio] = useState<HTMLAudioElement | null>(
    null,
  );
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState<
    string | null
  >(null);
  const [voiceSelectionLocked] = useState(false);
  const activeCharacterIdRef = useRef<string | null>(null);

  /* ── Load roster ────────────────────────────────────────────────── */
  // Use static STYLE_PRESETS shipped in the frontend bundle — no API call
  // needed. If the server provides styles via onboardingOptions, prefer those.
  useEffect(() => {
    const localizedPresets = getStylePresets(uiLanguage);
    if (onboardingPresetStyles.length) {
      const merged = onboardingPresetStyles.map((serverPreset) => {
        const localMeta = localizedPresets.find(
          (p) =>
            p.id === serverPreset.id ||
            p.name === serverPreset.name ||
            p.avatarIndex === serverPreset.avatarIndex,
        );
        return {
          ...serverPreset,
          id: localMeta?.id ?? serverPreset.id,
          name:
            localMeta?.name ??
            ("name" in serverPreset
              ? (serverPreset as unknown as { name: string }).name
              : undefined),
          avatarIndex: localMeta?.avatarIndex,
          voicePresetId: localMeta?.voicePresetId,
          greetingAnimation: localMeta?.greetingAnimation,
        } as unknown as OnboardingPreset;
      });
      setRosterStyles(merged);
    } else {
      setRosterStyles(localizedPresets);
    }
  }, [onboardingPresetStyles, uiLanguage]);

  const baseRosterEntries = useMemo(
    () => resolveRosterEntries(rosterStyles),
    [rosterStyles],
  );

  // If the user renamed the selected character, reflect it in the roster
  const characterRoster = useMemo(() => {
    const activeId = selectedCharacterId ?? savedCharacterId;
    const draftName =
      typeof characterDraft.name === "string" ? characterDraft.name.trim() : "";
    if (!activeId || !draftName) return baseRosterEntries;
    return baseRosterEntries.map((entry) =>
      entry.id === activeId ? { ...entry, name: draftName } : entry,
    );
  }, [
    baseRosterEntries,
    selectedCharacterId,
    savedCharacterId,
    characterDraft.name,
  ]);

  const d = characterDraft;
  const fallbackCharacterName =
    (typeof d.name === "string" && d.name.trim()) ||
    (typeof characterData?.name === "string" && characterData.name.trim()) ||
    "Agent";
  const normalizedMessageExamples = Array.isArray(d.messageExamples)
    ? normalizeCharacterMessageExamples(
        d.messageExamples,
        fallbackCharacterName,
      )
    : [];
  const bioText =
    typeof d.bio === "string"
      ? d.bio
      : Array.isArray(d.bio)
        ? (d.bio as string[]).join("\n")
        : "";

  const hasCharacterContent = (c: unknown) =>
    Boolean(c && Object.keys(c as Record<string, unknown>).length > 0);
  const currentCharacter = hasCharacterContent(characterDraft)
    ? characterDraft
    : characterData;

  /* ── Resolve active roster entry ────────────────────────────────── */
  const activeCharacterRosterEntry: CharacterRosterEntry | null =
    useMemo(() => {
      if (selectedCharacterId) {
        const found = characterRoster.find((e) => e.id === selectedCharacterId);
        if (found) return found;
      }
      const byVrm = characterRoster.find(
        (e) => e.avatarIndex === selectedVrmIndex,
      );
      if (byVrm) return byVrm;

      if (!currentCharacter) return null;
      const currentName =
        typeof currentCharacter.name === "string"
          ? currentCharacter.name.trim()
          : "";
      const byName = characterRoster.find((e) => e.name === currentName);
      if (byName) return byName;
      return null;
    }, [
      characterRoster,
      currentCharacter,
      selectedCharacterId,
      selectedVrmIndex,
    ]);

  /* ── Seed savedCharacterId from server data on first load ────────── */
  useEffect(() => {
    if (savedCharacterId) return; // already set
    if (!activeCharacterRosterEntry) return;
    // Only set when derived from server data (no user selection yet)
    if (!selectedCharacterId) {
      setSavedCharacterId(activeCharacterRosterEntry.id);
    }
  }, [activeCharacterRosterEntry, savedCharacterId, selectedCharacterId]);

  /** True when the user has made changes that haven't been saved yet. */
  const hasPendingChanges =
    fieldsEdited ||
    (selectedCharacterId !== null && selectedCharacterId !== savedCharacterId);

  useEffect(() => {
    if (!Array.isArray(d.messageExamples) || d.messageExamples.length === 0) {
      return;
    }

    const normalized = normalizeCharacterMessageExamples(
      d.messageExamples,
      fallbackCharacterName,
    );

    if (JSON.stringify(d.messageExamples) === JSON.stringify(normalized)) {
      return;
    }

    suppressDirtyRef.current = true;
    handleFieldEdit("messageExamples", normalized);
    queueMicrotask(() => {
      suppressDirtyRef.current = false;
    });
  }, [d.messageExamples, fallbackCharacterName, handleFieldEdit]);

  /* ── Load voice config on mount ─────────────────────────────────── */
  /* Load voice config from server — but don't overwrite a roster-derived
     voice preset that was already applied by auto-select. */
  const voicePresetAppliedRef = useRef(false);
  useEffect(() => {
    void (async () => {
      setVoiceLoading(true);
      try {
        const cfg = await client.getConfig();
        type MessagesConfig = { tts?: CharacterEditorVoiceConfig };
        const messages = cfg.messages as MessagesConfig | undefined;
        const tts = messages?.tts;
        if (tts) {
          const serverElevenlabsVoiceId =
            typeof tts.elevenlabs === "object" ? tts.elevenlabs.voiceId : null;
          setVoiceConfig((prev) => {
            if (!voicePresetAppliedRef.current) {
              return tts;
            }
            const serverElevenlabs =
              typeof tts.elevenlabs === "object" ? tts.elevenlabs : {};
            const currentElevenlabs =
              typeof prev.elevenlabs === "object" ? prev.elevenlabs : {};
            const serverEdge = typeof tts.edge === "object" ? tts.edge : {};
            const currentEdge = typeof prev.edge === "object" ? prev.edge : {};
            return {
              ...tts,
              ...prev,
              elevenlabs: {
                ...serverElevenlabs,
                ...currentElevenlabs,
              },
              edge: {
                ...serverEdge,
                ...currentEdge,
              },
            };
          });
          // Only set the voice preset from server if a roster entry hasn't
          // already set one (roster voice takes precedence).
          if (serverElevenlabsVoiceId && !voicePresetAppliedRef.current) {
            const preset = PREMADE_VOICES.find(
              (p) => p.voiceId === serverElevenlabsVoiceId,
            );
            setSelectedVoicePresetId(preset?.id ?? null);
          }
        }
      } catch (err) {
        console.warn("[CharacterEditor] Failed to load voice config:", err);
      }
      setVoiceLoading(false);
    })();
  }, []);

  /* ── Voice helpers ──────────────────────────────────────────────── */
  const handleSelectPreset = useCallback(
    (preset: (typeof PREMADE_VOICES)[0] | (typeof EDGE_BACKUP_VOICES)[0]) => {
      setSelectedVoicePresetId(preset.id);
      const isEdgeVoice = EDGE_BACKUP_VOICES.some((v) => v.id === preset.id);
      setVoiceConfig((prev) => {
        if (isEdgeVoice) {
          const existingEdge = (prev.edge ?? {}) as Record<
            string,
            string | undefined
          >;
          return {
            ...prev,
            provider: "edge" as const,
            edge: { ...existingEdge, voice: preset.voiceId },
          };
        }
        const existing =
          typeof prev.elevenlabs === "object" ? prev.elevenlabs : {};
        return {
          ...prev,
          provider: "elevenlabs" as const,
          elevenlabs: { ...existing, voiceId: preset.voiceId },
        };
      });
    },
    [],
  );

  const applyVoicePresetForEntry = useCallback(
    (entry: CharacterRosterEntry) => {
      setVoiceSaveError(null);
      const nextVoiceSelection = buildVoiceConfigForCharacterEntry({
        entry,
        useElevenLabs,
        voiceConfig,
      });
      if (!nextVoiceSelection) return null;
      setSelectedVoicePresetId(nextVoiceSelection.selectedVoicePresetId);
      setVoiceConfig(nextVoiceSelection.nextVoiceConfig);
      voicePresetAppliedRef.current = true;
      return nextVoiceSelection.persistedVoiceConfig;
    },
    [useElevenLabs, voiceConfig],
  );

  /* ── Character defaults ─────────────────────────────────────────── */
  const applyCharacterDefaults = useCallback(
    (entry: CharacterRosterEntry) => {
      const next = buildCharacterDraftFromPreset(entry);
      handleFieldEdit("name", next.name ?? "");
      handleFieldEdit("username", next.username ?? "");
      handleFieldEdit("bio", next.bio ?? "");
      handleFieldEdit("system", next.system ?? "");
      handleFieldEdit("adjectives", next.adjectives ?? []);
      handleFieldEdit("style", next.style ?? { all: [], chat: [], post: [] });
      handleFieldEdit("messageExamples", next.messageExamples ?? []);
      handleFieldEdit("postExamples", next.postExamples ?? []);
    },
    [handleFieldEdit],
  );

  const commitCharacterSelection = useCallback(
    (entry: CharacterRosterEntry, applyDefaults: boolean) => {
      const isNewCharacter = selectedCharacterId !== entry.id;
      setSelectedCharacterId(entry.id);
      setState("selectedVrmIndex", entry.avatarIndex);
      if (!voiceSelectionLocked && isNewCharacter) {
        const persistedVoiceConfig = applyVoicePresetForEntry(entry);
        if (persistedVoiceConfig) {
          dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, persistedVoiceConfig);
          // Persist the voice switch immediately so the next assistant line
          // uses the selected character's voice without waiting for Save.
          void client
            .updateConfig({
              messages: {
                tts: persistedVoiceConfig,
              },
            })
            .catch(() => {});
        }
      }
      if (applyDefaults) {
        applyCharacterDefaults(entry);
      }

      if (isNewCharacter && entry.catchphrase) {
        // Immediate cleanup of old character's speech
        voice.stopSpeaking();
        if (voiceTesting) {
          if (voiceTestAudio) {
            voiceTestAudio.pause();
            voiceTestAudio.currentTime = 0;
          }
          setVoiceTesting(false);
        }

        // Queue greeting animation to play after the VRM teleport-in dissolve finishes
        pendingGreetingRef.current = {
          characterId: entry.id,
          catchphrase: entry.catchphrase,
          animationPath: resolveCharacterGreetingAnimation({
            avatarIndex: entry.avatarIndex,
            greetingAnimation: entry.greetingAnimation,
          }),
        };
      }
      activeCharacterIdRef.current = entry.id;
    },
    [
      applyCharacterDefaults,
      applyVoicePresetForEntry,
      selectedCharacterId,
      setState,
      useElevenLabs,
      voiceSelectionLocked,
      voice,
      voiceTestAudio,
      voiceTesting,
    ],
  );

  /* ── Select character from roster ───────────────────────────────── */
  const handleSelectCharacter = useCallback(
    (entry: CharacterRosterEntry) => {
      if (entry.id === selectedCharacterId) return;
      commitCharacterSelection(entry, true);
    },
    [commitCharacterSelection, selectedCharacterId],
  );

  /* ── Auto-select on mount ───────────────────────────────────────── */
  useEffect(() => {
    if (
      characterLoading ||
      selectedCharacterId ||
      !characterRoster.length ||
      !currentCharacter
    )
      return;
    // Only apply defaults from the roster entry if this character is completely empty,
    // OR if the user has navigated to a different preset character than the one that's
    // saved (e.g. selected Momo in the roster but Chen is saved — show Momo's data).
    // Never wipe data for a custom/unnamed character that doesn't match any roster entry.
    const isNamed =
      typeof currentCharacter.name === "string" &&
      currentCharacter.name.trim().length > 0;
    const hasBioOrSystem = Boolean(
      currentCharacter.bio ||
        ("system" in currentCharacter &&
          typeof currentCharacter.system === "string" &&
          currentCharacter.system),
    );
    const hasMeaningfulContent = isNamed || hasBioOrSystem;

    const entry =
      activeCharacterRosterEntry ??
      (!hasMeaningfulContent ? characterRoster[0] : null);
    if (!entry) return;

    // Apply preset defaults if: no saved content, OR the active VRM character
    // differs from what's saved (name mismatch means user switched presets).
    const applyDefaults = shouldApplyPresetDefaults(
      hasMeaningfulContent,
      currentCharacter.name,
      entry.name,
    );

    // Suppress dirty-tracking during programmatic auto-select
    suppressDirtyRef.current = true;
    commitCharacterSelection(entry, applyDefaults);
    suppressDirtyRef.current = false;
    // Mark this auto-selection as the saved baseline (not a user change)
    setSavedCharacterId(entry.id);
  }, [
    characterLoading,
    characterRoster,
    commitCharacterSelection,
    currentCharacter,
    selectedCharacterId,
    activeCharacterRosterEntry,
  ]);

  /* ── Play greeting animation + catchphrase when VRM teleport-in dissolve finishes ── */
  const greetingTimerRef = useRef<number | null>(null);

  // Clear any stale greeting timer before queueing a new one on character change
  useEffect(() => {
    if (greetingTimerRef.current != null) {
      window.clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const greeting = pendingGreetingRef.current;
      if (!greeting) return;
      // Do not play a queued greeting if the user has already switched away
      if (greeting.characterId !== activeCharacterIdRef.current) return;

      pendingGreetingRef.current = null;
      // Delay the emote dispatch so the idle animation can fully settle
      // after the teleport dissolve before we cross-fade into the greeting.
      if (greetingTimerRef.current != null) {
        window.clearTimeout(greetingTimerRef.current);
      }
      greetingTimerRef.current = window.setTimeout(() => {
        greetingTimerRef.current = null;
        if (greeting.characterId !== activeCharacterIdRef.current) return;

        if (greeting.animationPath) {
          dispatchWindowEvent(APP_EMOTE_EVENT, {
            emoteId: "greeting",
            path: `/${greeting.animationPath}`,
            duration: 3,
            loop: false,
            showOverlay: false,
          });
        }
        voice.speak(greeting.catchphrase);
      }, 400);
    };
    const eventName = "eliza:vrm-teleport-complete";
    window.addEventListener(eventName, handler);
    return () => {
      window.removeEventListener(eventName, handler);
      if (greetingTimerRef.current != null) {
        window.clearTimeout(greetingTimerRef.current);
        greetingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.speak]);

  /* ── Sync customizing state with tab ─────────────────────────────── */
  /* Removed: previously auto-set customizing=true when tab==="character",
     which prevented the roster from being the default view. Now the user
     must explicitly click "Customize Character" to enter the editor. */

  /* ── Dispatch camera offset for editor panel ─────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const isEditorTab = tab === "character" || tab === "character-select";
    const dispatch = () => {
      const offset = customizing && isEditorTab && !mql.matches ? 0.85 : 0;
      window.dispatchEvent(
        new CustomEvent("eliza:editor-camera-offset", {
          detail: { offset },
        }),
      );
    };
    dispatch();
    const onChange = () => dispatch();
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      // Reset camera offset when leaving customize mode or switching tabs
      window.dispatchEvent(
        new CustomEvent("eliza:editor-camera-offset", {
          detail: { offset: 0 },
        }),
      );
    };
  }, [customizing, tab]);

  /* ── Sync style entry drafts ────────────────────────────────────── */
  useEffect(() => {
    setStyleEntryDrafts({
      all: [...(d.style?.all ?? [])],
      chat: [...(d.style?.chat ?? [])],
      post: [...(d.style?.post ?? [])],
    });
  }, [d.style]);

  /* ── Voice test ─────────────────────────────────────────────────── */

  const handleStopTest = useCallback(() => {
    if (voiceTestAudio) {
      voiceTestAudio.pause();
      voiceTestAudio.currentTime = 0;
    }
    setVoiceTesting(false);
  }, [voiceTestAudio]);

  /* ── Persist voice config ───────────────────────────────────────── */
  const persistVoiceConfig = useCallback(async () => {
    setVoiceSaveError(null);
    const provider =
      voiceConfig.provider ?? (useElevenLabs ? "elevenlabs" : "edge");
    let normalizedVoiceConfig: Record<string, unknown>;
    if (provider === "edge") {
      normalizedVoiceConfig = {
        ...voiceConfig,
        provider: "edge",
        edge: voiceConfig.edge ?? {},
      };
    } else {
      const hasElevenLabsApiKey = hasConfiguredApiKey(
        (voiceConfig.elevenlabs as Record<string, string> | undefined)?.apiKey,
      );
      const defaultVoiceMode =
        typeof voiceConfig.mode === "string"
          ? voiceConfig.mode
          : useElevenLabs && !hasElevenLabsApiKey
            ? "cloud"
            : "own-key";
      const normalized: Record<string, string> = {
        ...(voiceConfig.elevenlabs as Record<string, string> | undefined),
        modelId:
          (voiceConfig.elevenlabs as Record<string, string> | undefined)
            ?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
      };
      const sanitizedKey = sanitizeApiKey(normalized?.apiKey);
      if (sanitizedKey) normalized.apiKey = sanitizedKey;
      else delete normalized.apiKey;
      normalizedVoiceConfig = {
        ...voiceConfig,
        provider: "elevenlabs",
        mode: defaultVoiceMode,
        elevenlabs: normalized,
      };
    }
    await client.updateConfig({ messages: { tts: normalizedVoiceConfig } });
    dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalizedVoiceConfig);
  }, [voiceConfig, useElevenLabs]);

  /* ── Save all ───────────────────────────────────────────────────── */
  const handleSaveAll = useCallback(async () => {
    setVoiceSaving(true);
    setVoiceSaveError(null);
    try {
      await persistVoiceConfig();
    } catch (err) {
      setVoiceSaveError(
        err instanceof Error ? err.message : "Failed to save voice settings.",
      );
      setVoiceSaving(false);
      return;
    }
    setVoiceSaving(false);
    await handleSaveCharacter();
    // Mark the current selection as saved
    setSavedCharacterId(
      selectedCharacterId ?? activeCharacterRosterEntry?.id ?? null,
    );
    setFieldsEdited(false);
  }, [
    handleSaveCharacter,
    persistVoiceConfig,
    selectedCharacterId,
    activeCharacterRosterEntry,
  ]);

  /* ── Reset to defaults ──────────────────────────────────────────── */
  const handleResetToDefaults = useCallback(() => {
    if (!activeCharacterRosterEntry) return;
    applyCharacterDefaults(activeCharacterRosterEntry);
    applyVoicePresetForEntry(activeCharacterRosterEntry);
  }, [
    activeCharacterRosterEntry,
    applyCharacterDefaults,
    applyVoicePresetForEntry,
  ]);

  /* ── Generate field ─────────────────────────────────────────────── */
  const getCharContext = useCallback(
    () => ({
      name: d.name ?? "",
      system: d.system ?? "",
      bio: bioText,
      style: d.style ?? { all: [], chat: [], post: [] },
      postExamples: d.postExamples ?? [],
    }),
    [d, bioText],
  );

  const handleGenerate = useCallback(
    async (field: string, mode: "replace" | "append" = "replace") => {
      setGenerating(field);
      setGenerateError(null);
      try {
        const { generated } = await client.generateCharacterField(
          field,
          getCharContext(),
          mode,
        );
        if (field === "bio") {
          handleFieldEdit("bio", generated.trim());
        } else if (field === "system") {
          handleFieldEdit("system", generated.trim());
        } else if (field === "style") {
          try {
            const parsed = JSON.parse(generated);
            if (mode === "append") {
              handleStyleEdit(
                "all",
                [...(d.style?.all ?? []), ...(parsed.all ?? [])].join("\n"),
              );
              handleStyleEdit(
                "chat",
                [...(d.style?.chat ?? []), ...(parsed.chat ?? [])].join("\n"),
              );
              handleStyleEdit(
                "post",
                [...(d.style?.post ?? []), ...(parsed.post ?? [])].join("\n"),
              );
            } else {
              if (parsed.all) handleStyleEdit("all", parsed.all.join("\n"));
              if (parsed.chat) handleStyleEdit("chat", parsed.chat.join("\n"));
              if (parsed.post) handleStyleEdit("post", parsed.post.join("\n"));
            }
          } catch (err) {
            console.warn(
              "[CharacterEditor] Failed to parse AI-generated style JSON:",
              err,
            );
          }
        } else if (field === "chatExamples") {
          const formatted = normalizeCharacterMessageExamples(
            generated,
            fallbackCharacterName,
          );
          if (formatted.length > 0) {
            handleFieldEdit("messageExamples", formatted);
          }
        } else if (field === "postExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              if (mode === "append") {
                handleCharacterArrayInput(
                  "postExamples",
                  [...(d.postExamples ?? []), ...parsed].join("\n"),
                );
              } else {
                handleCharacterArrayInput("postExamples", parsed.join("\n"));
              }
            }
          } catch (err) {
            console.warn(
              "[CharacterEditor] Failed to parse AI-generated postExamples JSON:",
              err,
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed";
        setGenerateError(msg);
      }
      setGenerating(null);
    },
    [
      fallbackCharacterName,
      getCharContext,
      d,
      handleFieldEdit,
      handleStyleEdit,
      handleCharacterArrayInput,
    ],
  );

  /* ── Style entry handlers ───────────────────────────────────────── */
  const handlePendingStyleEntryChange = useCallback(
    (key: string, value: string) => {
      setPendingStyleEntries((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddStyleEntry = useCallback(
    (key: string) => {
      const value = pendingStyleEntries[key].trim();
      if (!value) return;
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      if (!nextItems.includes(value)) {
        nextItems.push(value);
        handleStyleEdit(key, nextItems.join("\n"));
      }
      setPendingStyleEntries((prev) => ({ ...prev, [key]: "" }));
    },
    [d.style, handleStyleEdit, pendingStyleEntries],
  );

  const handleRemoveStyleEntry = useCallback(
    (key: string, index: number) => {
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      nextItems.splice(index, 1);
      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit],
  );

  const handleStyleEntryDraftChange = useCallback(
    (key: string, index: number, value: string) => {
      setStyleEntryDrafts((prev) => {
        const nextItems = [...(prev[key] ?? [])];
        nextItems[index] = value;
        return { ...prev, [key]: nextItems };
      });
    },
    [],
  );

  const handleCommitStyleEntry = useCallback(
    (key: string, index: number) => {
      const nextValue = styleEntryDrafts[key]?.[index]?.trim() ?? "";
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      if (!nextValue) {
        nextItems.splice(index, 1);
      } else {
        nextItems[index] = nextValue;
      }
      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit, styleEntryDrafts],
  );

  /* ── Derived ────────────────────────────────────────────────────── */
  const activeVoicePreset =
    PREMADE_VOICES.find((p) => p.id === selectedVoicePresetId) ?? null;
  const voiceSelectValue = selectedVoicePresetId ?? null;
  const combinedSaveError = voiceSaveError ?? characterSaveError;

  /* ── Loading state ──────────────────────────────────────────────── */
  if (characterLoading && !characterData) {
    return (
      <div className="relative flex flex-col justify-end w-full flex-1 gap-2 overflow-hidden select-none transition-[width,margin-left] duration-[400ms] ease-in-out [-webkit-tap-highlight-color:transparent] max-[600px]:overflow-visible">
        <div className="flex items-center justify-center flex-1 text-muted text-[13px]">
          {t("charactereditor.LoadingCharacterData", {
            defaultValue: "Loading character data...",
          })}
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col pointer-events-none pt-[4.5rem] px-6 pb-3 max-md:px-3 max-md:pb-2 max-md:pt-[4.5rem] [&>*]:pointer-events-auto"
      data-no-camera-zoom="true"
      data-no-camera-drag="true"
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className={`relative flex flex-col justify-end w-full flex-1 gap-2 overflow-hidden select-none transition-[width,margin-left] duration-[400ms] ease-in-out [-webkit-tap-highlight-color:transparent] max-[600px]:overflow-visible [&_input]:select-text [&_textarea]:select-text [&_*:focus-visible:not(input):not(textarea)]:outline-none [&_*:focus-visible:not(input):not(textarea)]:shadow-none [&_button:focus-visible]:outline-none [&_button:focus-visible]:shadow-none${customizing ? " md:w-[40%] md:ml-auto" : ""}`}
      >
        {/* ── Character Roster (when NOT customizing) ────────────────── */}
        {!customizing && (
          <div className="shrink min-h-0 overflow-hidden flex flex-col items-center justify-end w-full relative max-[600px]:!overflow-visible pointer-events-auto">
            <CharacterRoster
              entries={characterRoster}
              selectedId={
                selectedCharacterId ?? activeCharacterRosterEntry?.id ?? null
              }
              onSelect={handleSelectCharacter}
            />
          </div>
        )}

        {customizing && (
          // biome-ignore lint/a11y/useSemanticElements: existing pattern
          <div
            className="flex flex-col flex-1 min-h-0 gap-2 overflow-hidden"
            role="region"
            aria-label={t("charactereditor.TabbedEditorGroupLabel", {
              defaultValue: "Character editor — tabbed sections",
            })}
          >
            <div className="flex items-center gap-3 shrink-0">
              <div
                className={CHARACTER_EDITOR_TABLIST_CLASSNAME}
                style={{ boxShadow: pageTabsBoxShadow }}
                role="tablist"
                aria-label={t("charactereditor.TabbedEditorGroupLabel", {
                  defaultValue: "Character editor sections",
                })}
              >
                {CHARACTER_EDITOR_PAGES.map((page) => (
                  <button
                    key={page}
                    type="button"
                    id={`character-editor-tab-${page}`}
                    role="tab"
                    aria-selected={activePage === page}
                    aria-controls={`character-editor-panel-${page}`}
                    tabIndex={activePage === page ? 0 : -1}
                    className={CHARACTER_EDITOR_TAB_CLASSNAME}
                    style={
                      activePage === page ? accentGradientStyle : undefined
                    }
                    onClick={() => {
                      setActivePage(page);
                      if (page === "style" || page === "examples")
                        setRightTab(page);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowRight" &&
                        event.key !== "ArrowLeft" &&
                        event.key !== "Home" &&
                        event.key !== "End"
                      ) {
                        return;
                      }
                      event.preventDefault();
                      const currentIndex =
                        CHARACTER_EDITOR_PAGES.indexOf(activePage);
                      const nextIndex =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? CHARACTER_EDITOR_PAGES.length - 1
                            : event.key === "ArrowRight"
                              ? (currentIndex + 1) %
                                CHARACTER_EDITOR_PAGES.length
                              : (currentIndex -
                                  1 +
                                  CHARACTER_EDITOR_PAGES.length) %
                                CHARACTER_EDITOR_PAGES.length;
                      const nextPage = CHARACTER_EDITOR_PAGES[nextIndex];
                      setActivePage(nextPage);
                      if (nextPage === "style" || nextPage === "examples") {
                        setRightTab(nextPage);
                      }
                      requestAnimationFrame(() => {
                        globalThis.document
                          ?.getElementById(`character-editor-tab-${nextPage}`)
                          ?.focus();
                      });
                    }}
                  >
                    {page === "identity"
                      ? t("charactereditor.TabCharacter", {
                          defaultValue: "Character",
                        })
                      : page === "style"
                        ? t("charactereditor.TabStyles", {
                            defaultValue: "Styles",
                          })
                        : t("charactereditor.TabExamples", {
                            defaultValue: "Examples",
                          })}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl px-2.5 text-[11px] font-semibold disabled:opacity-40"
                style={accentGradientStyle}
                onClick={handleResetToDefaults}
                disabled={!activeCharacterRosterEntry}
                title={t("charactereditor.ResetToDefaults", {
                  defaultValue: "Reset to Defaults",
                })}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                {t("charactereditor.Reset", { defaultValue: "Reset" })}
              </Button>
            </div>

            <div
              id={`character-editor-panel-${activePage}`}
              role="tabpanel"
              aria-labelledby={`character-editor-tab-${activePage}`}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              {/* ── LEFT PANEL (Character identity) ───────────────────────── */}
              <div
                ref={leftPanelRef}
                className={`custom-scrollbar flex flex-col flex-1 gap-3 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]${activePage !== "identity" ? " hidden" : ""}`}
              >
                <CharacterIdentityPanel
                  d={d}
                  bioText={bioText}
                  generating={generating}
                  voiceSelectValue={voiceSelectValue}
                  activeVoicePreset={activeVoicePreset}
                  voiceTesting={voiceTesting}
                  voiceLoading={voiceLoading}
                  useElevenLabs={useElevenLabs}
                  elevenLabsVoiceGroups={elevenLabsVoiceGroups}
                  edgeVoiceGroups={edgeVoiceGroups}
                  voiceTestAudio={voiceTestAudio}
                  handleFieldEdit={handleFieldEdit}
                  handleGenerate={handleGenerate}
                  handleSelectPreset={handleSelectPreset}
                  handleStopTest={handleStopTest}
                  setVoiceTesting={setVoiceTesting}
                  setVoiceTestAudio={setVoiceTestAudio}
                  t={t}
                />
              </div>

              {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
              <div
                ref={rightPanelRef}
                className={`custom-scrollbar flex flex-col flex-1 gap-3 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]${activePage === "identity" ? " hidden" : ""}`}
              >
                {/* Style Rules */}
                <div
                  style={{ display: rightTab === "style" ? undefined : "none" }}
                >
                  <CharacterStylePanel
                    d={d}
                    generating={generating}
                    pendingStyleEntries={pendingStyleEntries}
                    styleEntryDrafts={styleEntryDrafts}
                    handleGenerate={handleGenerate}
                    handlePendingStyleEntryChange={
                      handlePendingStyleEntryChange
                    }
                    handleAddStyleEntry={handleAddStyleEntry}
                    handleRemoveStyleEntry={handleRemoveStyleEntry}
                    handleStyleEntryDraftChange={handleStyleEntryDraftChange}
                    handleCommitStyleEntry={handleCommitStyleEntry}
                    t={t}
                  />
                </div>

                {/* Chat + Post Examples */}
                <div
                  style={{
                    display: rightTab === "examples" ? undefined : "none",
                  }}
                >
                  <CharacterExamplesPanel
                    d={d}
                    normalizedMessageExamples={normalizedMessageExamples}
                    generating={generating}
                    handleFieldEdit={handleFieldEdit}
                    handleGenerate={handleGenerate}
                    t={t}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 pt-2 shrink-0 pointer-events-auto">
        {/* Status messages */}
        {(characterSaveSuccess || combinedSaveError || generateError) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {characterSaveSuccess && (
              <span className="rounded-lg border border-status-success/20 bg-status-success-bg px-3 py-1 text-xs font-bold text-status-success">
                {characterSaveSuccess}
              </span>
            )}
            {combinedSaveError && (
              <span className="rounded-lg border border-status-danger/20 bg-status-danger-bg px-3 py-1 text-xs font-medium text-status-danger">
                {combinedSaveError}
              </span>
            )}
            {generateError && (
              <span className="rounded-lg border border-status-danger/20 bg-status-danger-bg px-3 py-1 text-xs font-medium text-status-danger">
                {generateError}
              </span>
            )}
          </div>
        )}

        <div className="relative flex items-center justify-center min-h-9 max-md:flex max-md:flex-wrap max-md:justify-center max-md:gap-2">
          <div className="absolute left-0 flex items-center gap-2">
            {customizing && (
              <>
                <input
                  type="file"
                  id="ce-vrm-upload"
                  accept=".vrm"
                  className="hidden"
                  style={{ display: "none" }}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setState("selectedVrmIndex", 0);
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={CHARACTER_EDITOR_FOOTER_ACTION_CLASSNAME}
                  style={idleSaveBtnStyle}
                  onClick={() =>
                    document.getElementById("ce-vrm-upload")?.click()
                  }
                  title={t("charactereditor.UploadVRM", {
                    defaultValue: "Upload",
                  })}
                >
                  {t("charactereditor.UploadVRM", {
                    defaultValue: "Upload",
                  })}
                </Button>
              </>
            )}
          </div>

          {/* Save Character — centered; transparent when nothing to save */}
          <Button
            size="sm"
            className={CHARACTER_EDITOR_FOOTER_ACTION_CLASSNAME}
            style={hasPendingChanges ? accentGradientStyle : idleSaveBtnStyle}
            disabled={characterSaving || voiceSaving || !hasPendingChanges}
            onClick={() => void handleSaveAll()}
          >
            {characterSaving || voiceSaving
              ? t("charactereditor.Saving", { defaultValue: "saving..." })
              : t("charactereditor.Save", { defaultValue: "Save" })}
          </Button>

          <div className="absolute right-0 flex items-center gap-2">
            {/* Toggle between Customize and Select — always present, just text changes */}
            <Button
              type="button"
              variant="default"
              size="sm"
              className={CHARACTER_EDITOR_FOOTER_ACTION_CLASSNAME}
              style={accentGradientStyle}
              onClick={() => {
                if (customizing) {
                  setCustomizing(false);
                  setTab("character-select");
                } else {
                  setCustomizing(true);
                  setTab("character");
                }
              }}
            >
              {customizing
                ? t("charactereditor.SelectBtn", { defaultValue: "Select" })
                : t("charactereditor.CustomizeBtn", {
                    defaultValue: "Customize",
                  })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Re-export as CharacterView so the upstream App.tsx import resolves here
 * when the Vite alias redirects ./CharacterView to this file.
 */
export { CharacterEditor as CharacterView };
