/**
 * Onboarding state — consolidated via useReducer.
 *
 * Replaces 35+ individual useState hooks with structured reducers.
 * Connector tokens (telegram, discord, etc.) collapse into a single Record.
 * Remote connection state (connecting/connected/error) collapses into one object.
 */

import { useCallback, useReducer, useRef } from "react";
import type { OnboardingOptions } from "../api";
import { loadPersistedOnboardingStep, saveOnboardingStep } from "./persistence";
import type { AppState, OnboardingStep } from "./types";

// ── Connector token keys ───────────────────────────────────────────────

export type ConnectorTokenKey =
  | "telegramToken"
  | "discordToken"
  | "whatsAppSessionPath"
  | "twilioAccountSid"
  | "twilioAuthToken"
  | "twilioPhoneNumber"
  | "blooioApiKey"
  | "blooioPhoneNumber"
  | "githubToken";

// ── Remote connection state ────────────────────────────────────────────

export interface RemoteConnectionState {
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
}

// ── State shape ────────────────────────────────────────────────────────

export interface OnboardingState {
  step: OnboardingStep;
  mode: AppState["onboardingMode"];
  activeGuide: string | null;
  deferredTasks: string[];
  postChecklistDismissed: boolean;
  options: OnboardingOptions | null;

  // Identity
  name: string;
  ownerName: string;
  style: string;
  avatar: number;

  // Hosting
  runMode: "local" | "cloud" | "";
  cloudProvider: string;

  // Provider
  provider: string;
  apiKey: string;
  voiceProvider: string;
  voiceApiKey: string;
  smallModel: string;
  largeModel: string;
  openRouterModel: string;
  primaryModel: string;
  existingInstallDetected: boolean;
  detectedProviders: AppState["onboardingDetectedProviders"];

  // Connector tokens (consolidated)
  connectorTokens: Record<ConnectorTokenKey, string>;

  // Remote connection
  remote: RemoteConnectionState;
  remoteApiBase: string;
  remoteToken: string;

  // Tabs
  subscriptionTab: "token" | "oauth";
  elizaCloudTab: "login" | "apikey";

  // Chain / RPC
  selectedChains: Set<string>;
  rpcSelections: Record<string, string>;
  rpcKeys: Record<string, string>;

  // Misc
  restarting: boolean;
}

function loadSessionApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem("milady_api_base")?.trim() ?? "";
}

function isRemoteApiBase(baseUrl: string): boolean {
  if (!baseUrl || typeof window === "undefined") return false;
  try {
    const parsed = new URL(baseUrl);
    return (
      parsed.hostname !== window.location.hostname &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "::1"
    );
  } catch {
    return false;
  }
}

const EMPTY_TOKENS: Record<ConnectorTokenKey, string> = {
  telegramToken: "",
  discordToken: "",
  whatsAppSessionPath: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioPhoneNumber: "",
  blooioApiKey: "",
  blooioPhoneNumber: "",
  githubToken: "",
};

function createInitialState(cloudOnly?: boolean): OnboardingState {
  const savedApiBase = loadSessionApiBase();
  return {
    step: loadPersistedOnboardingStep() ?? "cloud_login",
    mode: "basic",
    activeGuide: null,
    deferredTasks: [],
    postChecklistDismissed: false,
    options: null,
    name: "Chen",
    ownerName: "anon",
    style: "chen",
    avatar: 1,
    runMode: cloudOnly ? "cloud" : "",
    cloudProvider: cloudOnly ? "elizacloud" : "",
    provider: "",
    apiKey: "",
    voiceProvider: "",
    voiceApiKey: "",
    smallModel: "moonshotai/kimi-k2-turbo",
    largeModel: "moonshotai/kimi-k2-0905",
    openRouterModel: "",
    primaryModel: "",
    existingInstallDetected: false,
    detectedProviders: [],
    connectorTokens: { ...EMPTY_TOKENS },
    remote: {
      status: isRemoteApiBase(savedApiBase) ? "connected" : "idle",
      error: null,
    },
    remoteApiBase: savedApiBase,
    remoteToken: "",
    subscriptionTab: "token",
    elizaCloudTab: "login",
    selectedChains: new Set(["evm", "solana"]),
    rpcSelections: {},
    rpcKeys: {},
    restarting: false,
  };
}

// ── Actions ────────────────────────────────────────────────────────────

type OnboardingAction =
  | { type: "SET_STEP"; step: OnboardingStep }
  | { type: "SET_MODE"; mode: AppState["onboardingMode"] }
  | { type: "SET_ACTIVE_GUIDE"; guide: string | null }
  | { type: "ADD_DEFERRED_TASK"; task: string }
  | { type: "SET_POST_CHECKLIST_DISMISSED"; value: boolean }
  | { type: "SET_OPTIONS"; options: OnboardingOptions | null }
  | { type: "SET_FIELD"; field: string; value: unknown }
  | { type: "SET_CONNECTOR_TOKEN"; key: ConnectorTokenKey; value: string }
  | {
      type: "SET_REMOTE_STATUS";
      status: RemoteConnectionState["status"];
      error?: string | null;
    }
  | { type: "SET_REMOTE_API_BASE"; value: string }
  | { type: "SET_REMOTE_TOKEN"; value: string }
  | {
      type: "SET_DETECTED_PROVIDERS";
      value: AppState["onboardingDetectedProviders"];
    }
  | { type: "RESET_FOR_NEW_ONBOARDING" };

function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_ACTIVE_GUIDE":
      return { ...state, activeGuide: action.guide };
    case "ADD_DEFERRED_TASK":
      if (state.deferredTasks.includes(action.task)) return state;
      return {
        ...state,
        deferredTasks: [...state.deferredTasks, action.task],
        postChecklistDismissed: false,
      };
    case "SET_POST_CHECKLIST_DISMISSED":
      return { ...state, postChecklistDismissed: action.value };
    case "SET_OPTIONS":
      return { ...state, options: action.options };
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_CONNECTOR_TOKEN":
      return {
        ...state,
        connectorTokens: {
          ...state.connectorTokens,
          [action.key]: action.value,
        },
      };
    case "SET_REMOTE_STATUS":
      return {
        ...state,
        remote: { status: action.status, error: action.error ?? null },
      };
    case "SET_REMOTE_API_BASE":
      return { ...state, remoteApiBase: action.value };
    case "SET_REMOTE_TOKEN":
      return { ...state, remoteToken: action.value };
    case "SET_DETECTED_PROVIDERS":
      return { ...state, detectedProviders: action.value };
    case "RESET_FOR_NEW_ONBOARDING":
      return createInitialState();
    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export interface OnboardingStateHook {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;

  setStep: (step: OnboardingStep) => void;
  setMode: (mode: AppState["onboardingMode"]) => void;
  setActiveGuide: (guide: string | null) => void;
  addDeferredTask: (task: string) => void;
  setOptions: (options: OnboardingOptions | null) => void;
  setField: (field: string, value: unknown) => void;
  setConnectorToken: (key: ConnectorTokenKey, value: string) => void;
  setRemoteStatus: (
    status: RemoteConnectionState["status"],
    error?: string | null,
  ) => void;
  setDetectedProviders: (
    value: AppState["onboardingDetectedProviders"],
  ) => void;

  /** Ref to guard against duplicate onboarding finish submits. */
  finishBusyRef: React.RefObject<boolean>;
  /** Ref for onboarding resume connection. */
  resumeConnectionRef: React.RefObject<
    import("@miladyai/shared/contracts/onboarding").OnboardingConnection | null
  >;
  /** Tracks whether onboarding completion has been committed this session. */
  completionCommittedRef: React.RefObject<boolean>;
  /** Force local bootstrap ref. */
  forceLocalBootstrapRef: React.RefObject<boolean>;
  /** Synchronous lock for onboarding finish saving. */
  finishSavingRef: React.RefObject<boolean>;
}

export function useOnboardingState(cloudOnly?: boolean): OnboardingStateHook {
  const [state, dispatch] = useReducer(onboardingReducer, cloudOnly, (co) =>
    createInitialState(co),
  );

  const finishBusyRef = useRef(false);
  const resumeConnectionRef = useRef<
    import("@miladyai/shared/contracts/onboarding").OnboardingConnection | null
  >(null);
  const completionCommittedRef = useRef(false);
  const forceLocalBootstrapRef = useRef(false);
  const finishSavingRef = useRef(false);

  const setStep = useCallback((step: OnboardingStep) => {
    dispatch({ type: "SET_STEP", step });
    saveOnboardingStep(step);
  }, []);

  const setMode = useCallback((mode: AppState["onboardingMode"]) => {
    dispatch({ type: "SET_MODE", mode });
  }, []);

  const setActiveGuide = useCallback((guide: string | null) => {
    dispatch({ type: "SET_ACTIVE_GUIDE", guide });
  }, []);

  const addDeferredTask = useCallback((task: string) => {
    dispatch({ type: "ADD_DEFERRED_TASK", task });
  }, []);

  const setOptions = useCallback((options: OnboardingOptions | null) => {
    dispatch({ type: "SET_OPTIONS", options });
  }, []);

  const setField = useCallback((field: string, value: unknown) => {
    dispatch({ type: "SET_FIELD", field, value });
  }, []);

  const setConnectorToken = useCallback(
    (key: ConnectorTokenKey, value: string) => {
      dispatch({ type: "SET_CONNECTOR_TOKEN", key, value });
    },
    [],
  );

  const setRemoteStatus = useCallback(
    (status: RemoteConnectionState["status"], error?: string | null) => {
      dispatch({ type: "SET_REMOTE_STATUS", status, error });
    },
    [],
  );

  const setDetectedProviders = useCallback(
    (value: AppState["onboardingDetectedProviders"]) => {
      dispatch({ type: "SET_DETECTED_PROVIDERS", value });
    },
    [],
  );

  return {
    state,
    dispatch,
    setStep,
    setMode,
    setActiveGuide,
    addDeferredTask,
    setOptions,
    setField,
    setConnectorToken,
    setRemoteStatus,
    setDetectedProviders,
    finishBusyRef,
    resumeConnectionRef,
    completionCommittedRef,
    forceLocalBootstrapRef,
    finishSavingRef,
  };
}

export type { OnboardingAction as OnboardingDispatchAction };
