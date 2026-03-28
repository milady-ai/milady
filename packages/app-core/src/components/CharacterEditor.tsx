/**
 * Full-width character editor — replaces the narrow notebook-style CharacterView.
 *
 * Two-panel layout: left panel has roster + identity + bio + system prompt,
 * right panel has style rules + examples. Footer has voice + save + reset.
 */

import type { StylePreset } from "@miladyai/shared/contracts/onboarding";
import { getStylePresets } from "@miladyai/shared/onboarding-presets";
import { Button, Input, Textarea, ThemedSelect } from "@miladyai/ui";
import { client } from "../api/client";
import {
  APP_EMOTE_EVENT,
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "../events/index";
import { useChatAvatarVoiceBridge, useVoiceChat } from "../hooks";
import { useApp } from "../state/useApp";
import { normalizeCharacterMessageExamples } from "../utils/character-message-examples";
import {
  EDGE_BACKUP_VOICES,
  hasConfiguredApiKey,
  PREMADE_VOICES,
  sanitizeApiKey,
} from "../voice/types";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "./CharacterRoster";
import { shouldApplyPresetDefaults } from "./character-editor-helpers";

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
const Volume2 = ({ className }: { className?: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
const VolumeX = ({ className }: { className?: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

import {
  type ChangeEvent,
  type KeyboardEvent,
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
const CHARACTER_EDITOR_SECTION_CLASSNAME =
  "flex flex-col gap-2 rounded-xl border border-border bg-card p-3";
const CHARACTER_EDITOR_TEXTAREA_CLASSNAME =
  "flex-1 min-h-12 resize-none overflow-y-auto rounded-lg border-border bg-white/[0.04] px-3 py-2 font-mono text-xs leading-relaxed text-txt";
const CHARACTER_EDITOR_INLINE_RULE_CLASSNAME =
  "group flex items-start gap-2 rounded-md border border-border bg-white/[0.02] px-2.5 py-1.5";
const CHARACTER_EDITOR_INLINE_FIELD_CLASSNAME =
  "h-7 flex-1 rounded-md border border-border bg-white/[0.03] px-2 font-mono text-[11px] text-txt outline-none focus:border-accent";
const CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME =
  "h-6 px-2 text-[10px] font-bold text-accent";
const CHARACTER_EDITOR_ICON_GHOST_CLASSNAME =
  "mt-0.5 h-auto w-auto shrink-0 p-0 text-muted opacity-0 transition-[opacity,color,box-shadow] duration-150 hover:text-red-500 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-danger/40";
const CHARACTER_EDITOR_FOOTER_ACTION_CLASSNAME =
  "h-9 rounded-xl px-6 text-[13px] font-bold tracking-[0.05em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 disabled:opacity-50";
/* ── Constants ─────────────────────────────────────────────────────── */

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";
const CHARACTER_EDITOR_PAGES = ["identity", "style", "examples"] as const;
const STYLE_SECTION_KEYS = ["all"] as const;
const STYLE_SECTION_PLACEHOLDERS: Record<string, string> = {
  all: "Add a style rule",
};
const STYLE_SECTION_EMPTY_STATES: Record<string, string> = {
  all: "No style rules yet.",
};

const ELEVENLABS_VOICE_GROUPS = [
  {
    label: "Female",
    items: PREMADE_VOICES.filter((p) => p.gender === "female").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
  {
    label: "Male",
    items: PREMADE_VOICES.filter((p) => p.gender === "male").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
  {
    label: "Character",
    items: PREMADE_VOICES.filter((p) => p.gender === "character").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
];

const EDGE_VOICE_GROUPS = [
  {
    label: "Backup Voices",
    items: EDGE_BACKUP_VOICES.map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

type OnboardingPreset = StylePreset;

function getOnboardingPresetStyles(
  options: unknown,
): readonly OnboardingPreset[] {
  if (!options || typeof options !== "object") return [];
  const styles = (options as { styles?: unknown }).styles;
  return Array.isArray(styles) ? (styles as OnboardingPreset[]) : [];
}

function replaceCharacterToken(value: string, name: string) {
  return value.replaceAll("{{name}}", name).replaceAll("{{agentName}}", name);
}

function buildCharacterDraftFromPreset(entry: CharacterRosterEntry) {
  const p: OnboardingPreset = entry.preset;
  const name = entry.name;
  return {
    name,
    username: name,
    bio: p.bio.map((l: string) => replaceCharacterToken(l, name)).join("\n"),
    system: replaceCharacterToken(p.system, name),
    adjectives: [...p.adjectives],
    style: {
      all: [...p.style.all],
      chat: [...p.style.chat],
      post: [...p.style.post],
    },
    messageExamples: p.messageExamples.map(
      (convo: Array<{ user: string; content: { text: string } }>) => ({
        examples: convo.map(
          (msg: { user: string; content: { text: string } }) => ({
            name:
              msg.user === "{{agentName}}"
                ? name
                : replaceCharacterToken(msg.user, name),
            content: { text: replaceCharacterToken(msg.content.text, name) },
          }),
        ),
      }),
    ),
    postExamples: p.postExamples.map((ex: string) =>
      replaceCharacterToken(ex, name),
    ),
  };
}

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
    elizaCloudEnabled,
  } = useApp();

  /** ElevenLabs voices are available when cloud is connected/enabled (provides API key). */
  const useElevenLabs = elizaCloudConnected || elizaCloudEnabled;

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
    animationPath: string;
  } | null>(null);
  const onboardingPresetStyles = useMemo(
    () => getOnboardingPresetStyles(onboardingOptions),
    [onboardingOptions],
  );
  const [rosterStyles, setRosterStyles] = useState<OnboardingPreset[]>([
    ...onboardingPresetStyles,
  ]);

  /* ── Voice config state ─────────────────────────────────────────── */
  type VoiceConfig = Record<
    string,
    Record<string, string> | string | undefined
  >;
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});

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
        } as unknown as StylePreset;
      });
      setRosterStyles(merged);
    } else {
      setRosterStyles(localizedPresets);
    }
  }, [onboardingPresetStyles, uiLanguage]);

  const characterRoster = useMemo(
    () => resolveRosterEntries(rosterStyles),
    [rosterStyles],
  );

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
        type TtsConfig = Record<string, Record<string, string> | undefined>;
        type MessagesConfig = { tts?: TtsConfig };
        const messages = cfg.messages as MessagesConfig | undefined;
        const tts = messages?.tts;
        if (tts) {
          setVoiceConfig(tts);
          // Only set the voice preset from server if a roster entry hasn't
          // already set one (roster voice takes precedence).
          if (tts.elevenlabs?.voiceId && !voicePresetAppliedRef.current) {
            const preset = PREMADE_VOICES.find(
              (p) => p.voiceId === tts.elevenlabs?.voiceId,
            );
            setSelectedVoicePresetId(preset?.id ?? null);
          }
        }
      } catch {}
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
      if (!entry.voicePresetId) return;
      // When cloud provides ElevenLabs, use the ElevenLabs preset voice.
      // Otherwise fall back to matching edge backup voice by gender.
      if (useElevenLabs) {
        const voicePreset = PREMADE_VOICES.find(
          (p) => p.id === entry.voicePresetId,
        );
        if (voicePreset) {
          handleSelectPreset(voicePreset);
          voicePresetAppliedRef.current = true;
        }
      } else {
        // Pick male/female edge voice based on the ElevenLabs preset gender
        const elPreset = PREMADE_VOICES.find(
          (p) => p.id === entry.voicePresetId,
        );
        const edgeGender =
          elPreset?.gender === "male" ? "edge-male" : "edge-female";
        const edgeVoice = EDGE_BACKUP_VOICES.find((v) => v.id === edgeGender);
        if (edgeVoice) {
          handleSelectPreset(edgeVoice);
          voicePresetAppliedRef.current = true;
        }
      }
    },
    [handleSelectPreset, useElevenLabs],
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
        applyVoicePresetForEntry(entry);
        // Persist voice config immediately so the server has the right TTS
        // provider when streamVoiceSpeak is called for the catchphrase.
        // We build a minimal payload inline to avoid referencing persistVoiceConfig
        // (which is defined after this callback in the file).
        const presetVoice = PREMADE_VOICES.find(
          (p) => p.id === entry.voicePresetId,
        );
        if (presetVoice && useElevenLabs) {
          void client
            .updateConfig({
              messages: {
                tts: {
                  provider: "elevenlabs",
                  elevenlabs: { voiceId: presetVoice.voiceId },
                },
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
          animationPath:
            entry.greetingAnimation ?? "animations/emotes/greeting.fbx",
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

        dispatchWindowEvent(APP_EMOTE_EVENT, {
          emoteId: "greeting",
          path: `/${greeting.animationPath}`,
          duration: 3,
          loop: false,
          showOverlay: false,
        });
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
          } catch {}
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
          } catch {}
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

            <div key={activePage} aria-live="polite">
              <div className="text-sm font-semibold text-txt">
                {activePage === "identity"
                  ? t("charactereditor.PageContextTitle.identity", {
                      defaultValue: "Profile & directions",
                    })
                  : activePage === "style"
                    ? t("charactereditor.PageContextTitle.style", {
                        defaultValue: "Speaking style",
                      })
                    : t("charactereditor.PageContextTitle.examples", {
                        defaultValue: "Sample chats & posts",
                      })}
              </div>
              <p className="text-xs text-muted mt-0.5">
                {activePage === "identity"
                  ? t("charactereditor.PageContextDesc.identity", {
                      defaultValue:
                        "Name, voice, bio, and system prompt — who the agent is and how it should behave.",
                    })
                  : activePage === "style"
                    ? t("charactereditor.PageContextDesc.style", {
                        defaultValue:
                          "Short rules that steer tone and wording in chat and posts.",
                      })
                    : t("charactereditor.PageContextDesc.examples", {
                        defaultValue:
                          "Example conversations and posts the model can imitate.",
                      })}
              </p>
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
                {/* Name + Voice (50/50 split) */}
                <section className={CHARACTER_EDITOR_SECTION_CLASSNAME}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          id="character-editor-name-label"
                          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                        >
                          {t("charactereditor.Name", { defaultValue: "Name" })}
                        </span>
                      </div>
                      <Input
                        type="text"
                        value={d.name ?? ""}
                        placeholder={t("charactereditor.AgentNamePlaceholder", {
                          defaultValue: "Agent name",
                        })}
                        aria-labelledby="character-editor-name-label"
                        onChange={(
                          e: ChangeEvent<
                            HTMLInputElement | HTMLTextAreaElement
                          >,
                        ) => handleFieldEdit("name", e.target.value)}
                        className="h-8 rounded-lg border-border bg-white/[0.04] text-[13px] text-txt"
                      />
                    </div>
                    <div className="flex flex-col gap-2 min-w-0">
                      <div className="flex items-center justify-between">
                        <span
                          id="character-editor-voice-label"
                          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                        >
                          {t("charactereditor.Voice", {
                            defaultValue: "Voice",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ThemedSelect
                          value={voiceSelectValue}
                          groups={
                            useElevenLabs
                              ? ELEVENLABS_VOICE_GROUPS
                              : EDGE_VOICE_GROUPS
                          }
                          onChange={(id: string) => {
                            const allVoices = useElevenLabs
                              ? PREMADE_VOICES
                              : EDGE_BACKUP_VOICES;
                            const preset = allVoices.find((p) => p.id === id);
                            if (preset) handleSelectPreset(preset);
                          }}
                          placeholder={t("charactereditor.SelectAVoice", {
                            defaultValue: "Select a voice",
                          })}
                          ariaLabelledBy="character-editor-voice-label"
                          menuPlacement="bottom"
                          className="flex-1 min-w-0"
                          triggerClassName="h-8 rounded-md border-border/50 bg-bg/65 px-3 py-0 text-[11px] shadow-inner backdrop-blur-sm"
                          menuClassName="border-border/60 bg-bg/92 shadow-2xl backdrop-blur-md"
                        />
                        <Button
                          type="button"
                          variant={voiceTesting ? "destructive" : "outline"}
                          size="icon"
                          className="h-8 w-8 rounded-full border-transparent bg-transparent p-0 shadow-none text-muted shrink-0 hover:text-txt hover:bg-white/10"
                          onClick={() => {
                            if (voiceTesting) {
                              handleStopTest();
                            } else if (activeVoicePreset?.previewUrl) {
                              setVoiceTesting(true);
                              const audio = new Audio(
                                activeVoicePreset.previewUrl,
                              );
                              audio.onended = () => {
                                setVoiceTesting(false);
                                setVoiceTestAudio(null);
                              };
                              audio.onerror = () => {
                                setVoiceTesting(false);
                                setVoiceTestAudio(null);
                              };
                              setVoiceTestAudio(audio);
                              audio.play().catch(() => {
                                setVoiceTesting(false);
                                setVoiceTestAudio(null);
                              });
                            }
                          }}
                          aria-label={
                            voiceTesting
                              ? "Stop voice preview"
                              : "Preview voice"
                          }
                          disabled={!activeVoicePreset || voiceLoading}
                        >
                          {voiceTesting ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Bio / About Me */}
                <section
                  className={`${CHARACTER_EDITOR_SECTION_CLASSNAME} flex-1 min-h-0`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {t("charactereditor.AboutMe", {
                        defaultValue: "About Me",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME}
                      onClick={() => void handleGenerate("bio")}
                      disabled={generating === "bio"}
                    >
                      {generating === "bio"
                        ? t("charactereditor.Generating", {
                            defaultValue: "generating...",
                          })
                        : t("charactereditor.Regenerate", {
                            defaultValue: "regenerate",
                          })}
                    </Button>
                  </div>
                  <Textarea
                    value={bioText}
                    rows={4}
                    placeholder={t("charactereditor.AboutMePlaceholder", {
                      defaultValue: "Describe who your agent is...",
                    })}
                    onChange={(
                      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                    ) => handleFieldEdit("bio", e.target.value)}
                    className={CHARACTER_EDITOR_TEXTAREA_CLASSNAME}
                  />
                </section>

                {/* System Prompt / Directions */}
                <section
                  className={`${CHARACTER_EDITOR_SECTION_CLASSNAME} flex-1 min-h-0`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {t("charactereditor.SystemPrompt", {
                        defaultValue: "System Prompt",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME}
                      onClick={() => void handleGenerate("system")}
                      disabled={generating === "system"}
                    >
                      {generating === "system"
                        ? t("charactereditor.Generating")
                        : t("charactereditor.Regenerate")}
                    </Button>
                  </div>
                  <Textarea
                    value={d.system ?? ""}
                    rows={4}
                    maxLength={10000}
                    placeholder={t("charactereditor.SystemPromptPlaceholder", {
                      defaultValue: "Write in first person...",
                    })}
                    onChange={(
                      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                    ) => handleFieldEdit("system", e.target.value)}
                    className={CHARACTER_EDITOR_TEXTAREA_CLASSNAME}
                  />
                </section>
              </div>

              {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
              <div
                ref={rightPanelRef}
                className={`custom-scrollbar flex flex-col flex-1 gap-3 min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]${activePage === "identity" ? " hidden" : ""}`}
              >
                {/* Style Rules */}
                <section
                  className={`${CHARACTER_EDITOR_SECTION_CLASSNAME} flex-1 min-h-0`}
                  style={{ display: rightTab === "style" ? undefined : "none" }}
                >
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME}
                      onClick={() => void handleGenerate("style", "replace")}
                      disabled={generating === "style"}
                    >
                      {generating === "style"
                        ? t("charactereditor.Generating")
                        : t("charactereditor.Regenerate")}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3 min-h-0">
                    {STYLE_SECTION_KEYS.map((key) => {
                      const items = d.style?.[key] ?? [];
                      return (
                        <div
                          key={key}
                          className="flex flex-col gap-1.5"
                          data-testid={`style-section-${key}`}
                        >
                          <div className="flex flex-col gap-1">
                            {items.length > 0 ? (
                              items.map((item, index) => (
                                <div
                                  key={`${key}:${item}`}
                                  className={
                                    CHARACTER_EDITOR_INLINE_RULE_CLASSNAME
                                  }
                                >
                                  <span className="mt-0.5 shrink-0 text-[10px] font-bold text-accent">
                                    {index + 1}
                                  </span>
                                  <Textarea
                                    value={
                                      styleEntryDrafts[key]?.[index] ?? item
                                    }
                                    rows={1}
                                    onChange={(
                                      e: ChangeEvent<
                                        HTMLInputElement | HTMLTextAreaElement
                                      >,
                                    ) =>
                                      handleStyleEntryDraftChange(
                                        key,
                                        index,
                                        e.target.value,
                                      )
                                    }
                                    onBlur={() =>
                                      handleCommitStyleEntry(key, index)
                                    }
                                    aria-label={`${t(
                                      `charactereditor.StyleRules.${key}`,
                                      {
                                        defaultValue: "Style rule",
                                      },
                                    )} ${index + 1}`}
                                    className="min-w-0 flex-1 resize-none border-none bg-transparent p-0 font-mono text-xs leading-normal text-txt [field-sizing:content] min-h-[1.5em] focus-visible:outline-none focus-visible:shadow-none"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={
                                      CHARACTER_EDITOR_ICON_GHOST_CLASSNAME
                                    }
                                    onClick={() =>
                                      handleRemoveStyleEntry(key, index)
                                    }
                                    title={t("common.remove")}
                                    aria-label={`${t("common.remove")} ${t(
                                      `charactereditor.StyleRules.${key}`,
                                      {
                                        defaultValue: "style rule",
                                      },
                                    )} ${index + 1}`}
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 10 10"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      aria-hidden="true"
                                    >
                                      <path d="M2 2l6 6M8 2l-6 6" />
                                    </svg>
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted">
                                {STYLE_SECTION_EMPTY_STATES[key]}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              value={pendingStyleEntries[key]}
                              placeholder={STYLE_SECTION_PLACEHOLDERS[key]}
                              onChange={(
                                e: ChangeEvent<
                                  HTMLInputElement | HTMLTextAreaElement
                                >,
                              ) =>
                                handlePendingStyleEntryChange(
                                  key,
                                  e.target.value,
                                )
                              }
                              onKeyDown={(
                                e: KeyboardEvent<HTMLInputElement>,
                              ) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddStyleEntry(key);
                                }
                              }}
                              className={`min-w-0 text-xs ${CHARACTER_EDITOR_INLINE_FIELD_CLASSNAME}`}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className={
                                CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME
                              }
                              onClick={() => handleAddStyleEntry(key)}
                              disabled={!pendingStyleEntries[key].trim()}
                            >
                              + add
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Chat Examples */}
                <section
                  className={`${CHARACTER_EDITOR_SECTION_CLASSNAME} flex-1 min-h-0`}
                  style={{
                    display: rightTab === "examples" ? undefined : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {t("charactereditor.ChatExamples", {
                        defaultValue: "Chat Examples",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME}
                      onClick={() =>
                        void handleGenerate("chatExamples", "replace")
                      }
                      disabled={generating === "chatExamples"}
                    >
                      {generating === "chatExamples"
                        ? t("charactereditor.Generating")
                        : t("charactereditor.Generate", {
                            defaultValue: "generate",
                          })}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5 overflow-y-auto min-h-0">
                    {normalizedMessageExamples.map((convo, ci) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: items lack stable keys
                        key={`convo-${ci}`}
                        className="rounded-lg border border-border p-2.5"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                            {t("charactereditor.ConversationN", {
                              defaultValue: `Conversation ${ci + 1}`,
                            }).replace("{n}", String(ci + 1))}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity duration-150 p-0 h-auto w-auto hover:text-red-500 group-hover:opacity-100"
                            onClick={() => {
                              const updated = [...normalizedMessageExamples];
                              updated.splice(ci, 1);
                              handleFieldEdit("messageExamples", updated);
                            }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <path d="M2 2l6 6M8 2l-6 6" />
                            </svg>
                          </Button>
                        </div>
                        <div className="flex flex-col gap-1">
                          {convo.examples.map((msg, mi) => (
                            <div
                              // biome-ignore lint/suspicious/noArrayIndexKey: items lack stable keys
                              key={`msg-${ci}-${mi}`}
                              className="flex items-center gap-2"
                            >
                              <span
                                className={`w-10 shrink-0 text-right text-[9px] font-bold uppercase tracking-[0.1em] text-muted${msg.name === "{{user1}}" ? "" : " text-accent"}`}
                              >
                                {msg.name === "{{user1}}" ? "user" : "agent"}
                              </span>
                              <Input
                                value={msg.content?.text ?? ""}
                                onChange={(e) => {
                                  const updated = [
                                    ...normalizedMessageExamples,
                                  ];
                                  const convoClone = {
                                    examples: [...updated[ci].examples],
                                  };
                                  convoClone.examples[mi] = {
                                    ...convoClone.examples[mi],
                                    content: { text: e.target.value },
                                  };
                                  updated[ci] = convoClone;
                                  handleFieldEdit("messageExamples", updated);
                                }}
                                className={
                                  CHARACTER_EDITOR_INLINE_FIELD_CLASSNAME
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {normalizedMessageExamples.length === 0 && (
                      <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted">
                        {t("charactereditor.NoChatExamples", {
                          defaultValue: "No chat examples yet.",
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* Post Examples */}
                <section
                  className={`${CHARACTER_EDITOR_SECTION_CLASSNAME} flex-1 min-h-0`}
                  style={{
                    display: rightTab === "examples" ? undefined : "none",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {t("charactereditor.PostExamples", {
                        defaultValue: "Post Examples",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={CHARACTER_EDITOR_SMALL_GOLD_ACTION_CLASSNAME}
                      onClick={() =>
                        void handleGenerate("postExamples", "replace")
                      }
                      disabled={generating === "postExamples"}
                    >
                      {generating === "postExamples"
                        ? t("charactereditor.Generating")
                        : t("charactereditor.Generate")}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5 overflow-y-auto min-h-0">
                    {(d.postExamples ?? []).map((post, pi) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: items lack stable keys
                        key={`post-${pi}`}
                        className="flex items-center gap-1.5"
                      >
                        <Input
                          value={post}
                          onChange={(e) => {
                            const updated = [...(d.postExamples ?? [])];
                            updated[pi] = e.target.value;
                            handleFieldEdit("postExamples", updated);
                          }}
                          className={CHARACTER_EDITOR_INLINE_FIELD_CLASSNAME}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className={CHARACTER_EDITOR_ICON_GHOST_CLASSNAME}
                          onClick={() => {
                            const updated = [...(d.postExamples ?? [])];
                            updated.splice(pi, 1);
                            handleFieldEdit("postExamples", updated);
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <path d="M2 2l6 6M8 2l-6 6" />
                          </svg>
                        </Button>
                      </div>
                    ))}
                    {(d.postExamples ?? []).length === 0 && (
                      <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted">
                        {t("charactereditor.NoPostExamples", {
                          defaultValue: "No post examples yet.",
                        })}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      className="text-[10px] font-bold text-accent p-0 h-auto py-1 text-left hover:underline"
                      onClick={() => {
                        const updated = [...(d.postExamples ?? []), ""];
                        handleFieldEdit("postExamples", updated);
                      }}
                    >
                      +{" "}
                      {t("charactereditor.AddPost", {
                        defaultValue: "Add Post",
                      })}
                    </Button>
                  </div>
                </section>
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
              <span className="rounded-lg border border-green-400/20 bg-green-400/10 px-3 py-1 text-xs font-bold text-green-400">
                {characterSaveSuccess}
              </span>
            )}
            {combinedSaveError && (
              <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
                {combinedSaveError}
              </span>
            )}
            {generateError && (
              <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
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
