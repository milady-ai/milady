/**
 * MediaSettingsSection — provider selection + config for media generation.
 *
 * Follows the TTS pattern from CharacterView:
 *   - "cloud" vs "own-key" mode toggle
 *   - Provider button grid
 *   - Conditional API key inputs
 *   - Status badges (Configured / Needs Setup)
 */

import {
  Button,
  Input,
  SaveFooter,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import {
  type AudioGenProvider,
  client,
  type ImageProvider,
  type MediaConfig,
  type MediaMode,
  type VideoProvider,
  type VisionProvider,
} from "../api";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useTimeout } from "../hooks";
import { COMPANION_ENABLED } from "../navigation";
import { useApp } from "../state";
import type {
  CompanionHalfFramerateMode,
  CompanionVrmPowerMode,
} from "../state/types";
import type { DesktopClickAuditItem } from "../utils";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
} from "./CloudSourceControls";
import {
  SETTINGS_COMPACT_INPUT_CLASSNAME,
  SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME,
  SETTINGS_SEGMENTED_GROUP_CLASSNAME,
  SETTINGS_SOFT_SELECT_TRIGGER_CLASSNAME,
} from "./settings-control-primitives";
import { VoiceConfigView } from "./VoiceConfigView";

type MediaCategory = "image" | "video" | "audio" | "vision" | "voice";

const COMPANION_VRM_POWER_OPTIONS: readonly CompanionVrmPowerMode[] = [
  "quality",
  "balanced",
  "efficiency",
];

const COMPANION_HALF_FRAMERATE_OPTIONS: readonly CompanionHalfFramerateMode[] =
  ["off", "when_saving_power", "always"];

export const DESKTOP_MEDIA_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "media-refresh-native",
    entryPoint: "settings:media",
    label: "Refresh Native Media",
    expectedAction:
      "Refresh camera devices, permissions, screen sources, and recording state.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-preview",
    entryPoint: "settings:media",
    label: "Start/Stop Camera Preview",
    expectedAction: "Start or stop the native camera preview.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-capture",
    entryPoint: "settings:media",
    label: "Capture Photo",
    expectedAction: "Capture a still photo from the native camera surface.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-recording",
    entryPoint: "settings:media",
    label: "Start/Stop Camera Recording",
    expectedAction: "Start or stop native camera recording.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-screen-screenshot",
    entryPoint: "settings:media",
    label: "Take Screenshot",
    expectedAction:
      "Capture and save a screenshot using the native screen capture API.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-screen-recording",
    entryPoint: "settings:media",
    label: "Start/Stop Screen Recording",
    expectedAction: "Start or stop native screen recording.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
] as const;

interface ProviderOption {
  id: string;
  label: string;
  hint: string;
}

const IMAGE_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "fal",
    label: "FAL.ai",
    hint: "mediasettingssection.ProviderHintFalImage",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.DALLE3",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleImage",
  },
  {
    id: "xai",
    label: "xAI",
    hint: "mediasettingssection.ProviderHintXAIAurora",
  },
];

const VIDEO_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "fal",
    label: "FAL.ai",
    hint: "mediasettingssection.ProviderHintFalVideo",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.ProviderHintOpenAIVideo",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleVideo",
  },
];

const AUDIO_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  { id: "suno", label: "Suno", hint: "mediasettingssection.ProviderHintSuno" },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "mediasettingssection.ProviderHintElevenLabs",
  },
];

const VISION_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.ProviderHintOpenAIVision",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleVision",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "mediasettingssection.ProviderHintAnthropicVision",
  },
  {
    id: "xai",
    label: "xAI",
    hint: "mediasettingssection.ProviderHintXAIVision",
  },
];

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  image: "mediasettingssection.ImageGeneration",
  video: "mediasettingssection.VideoGeneration",
  audio: "mediasettingssection.AudioMusic",
  vision: "mediasettingssection.VisionAnalysis",
  voice: "settings.sections.voice.label",
};

const MEDIA_SEGMENT_BUTTON_CLASSNAME =
  "flex-1 basis-[calc(50%-0.125rem)] sm:basis-0 min-h-[44px] rounded-lg border px-2 py-1.5 text-[11px] font-semibold !whitespace-normal";
const MEDIA_SEGMENT_BUTTON_ACTIVE_CLASSNAME =
  "border-accent/45 bg-accent/16 text-txt-strong shadow-sm";
const MEDIA_SEGMENT_BUTTON_INACTIVE_CLASSNAME =
  "border-border/40 text-muted-strong hover:border-border-strong hover:bg-bg-hover hover:text-txt";

/** Short noun for “{category} API source” (not the longer tab titles). */
const MEDIA_API_SOURCE_CATEGORY_KEYS = {
  image: "mediasettingssection.MediaApiSourceCategory.image",
  video: "mediasettingssection.MediaApiSourceCategory.video",
  audio: "mediasettingssection.MediaApiSourceCategory.audio",
  vision: "mediasettingssection.MediaApiSourceCategory.vision",
} as const;

function getProvidersForCategory(category: MediaCategory): ProviderOption[] {
  switch (category) {
    case "image":
      return IMAGE_PROVIDERS;
    case "video":
      return VIDEO_PROVIDERS;
    case "audio":
      return AUDIO_PROVIDERS;
    case "vision":
      return VISION_PROVIDERS;
    case "voice":
      return [];
  }
}

function getApiKeyField(
  category: MediaCategory,
  provider: string,
): { path: string; labelKey: string } | null {
  if (provider === "cloud") return null;

  switch (category) {
    case "image":
    case "video":
      if (provider === "fal")
        return {
          path: `${category}.fal.apiKey`,
          labelKey: "mediasettingssection.FalApiKey",
        };
      if (provider === "openai")
        return {
          path: `${category}.openai.apiKey`,
          labelKey: "mediasettingssection.OpenAIApiKey",
        };
      if (provider === "google")
        return {
          path: `${category}.google.apiKey`,
          labelKey: "mediasettingssection.GoogleApiKey",
        };
      if (provider === "xai")
        return {
          path: `${category}.xai.apiKey`,
          labelKey: "mediasettingssection.XAIApiKey",
        };
      break;
    case "audio":
      if (provider === "suno")
        return {
          path: "audio.suno.apiKey",
          labelKey: "mediasettingssection.SunoApiKey",
        };
      if (provider === "elevenlabs")
        return {
          path: "audio.elevenlabs.apiKey",
          labelKey: "voiceconfigview.ElevenLabsAPIKey",
        };
      break;
    case "vision":
      if (provider === "openai")
        return {
          path: "vision.openai.apiKey",
          labelKey: "mediasettingssection.OpenAIApiKey",
        };
      if (provider === "google")
        return {
          path: "vision.google.apiKey",
          labelKey: "mediasettingssection.GoogleApiKey",
        };
      if (provider === "anthropic")
        return {
          path: "vision.anthropic.apiKey",
          labelKey: "mediasettingssection.AnthropicApiKey",
        };
      if (provider === "xai")
        return {
          path: "vision.xai.apiKey",
          labelKey: "mediasettingssection.XAIApiKey",
        };
      break;
  }
  return null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const result = structuredClone(obj);
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

export function DesktopMediaControlPanel() {
  const desktopRuntime = isElectrobunRuntime();
  const [loading, setLoading] = useState(desktopRuntime);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<
    Array<{ deviceId: string; label: string }>
  >([]);
  const [cameraPermission, setCameraPermission] = useState("unknown");
  const [cameraPreviewRunning, setCameraPreviewRunning] = useState(false);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraRecordingDuration, setCameraRecordingDuration] = useState(0);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [screenSources, setScreenSources] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [screenPermission, setScreenPermission] = useState("unknown");
  const [screenRecording, setScreenRecording] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);
  const [screenRecordingDuration, setScreenRecordingDuration] = useState(0);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [lastPhotoStatus, setLastPhotoStatus] = useState(
    "No photo captured yet.",
  );

  const refresh = useCallback(async () => {
    if (!desktopRuntime) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const [
      devicesResult,
      cameraPermissionResult,
      cameraRecordingState,
      sourcesResult,
      screenPermissionResult,
      screenRecordingState,
    ] = await Promise.all([
      invokeDesktopBridgeRequest<{
        devices: Array<{ deviceId: string; label: string }>;
        available: boolean;
      }>({
        rpcMethod: "cameraGetDevices",
        ipcChannel: "camera:getDevices",
      }),
      invokeDesktopBridgeRequest<{ status: string }>({
        rpcMethod: "cameraCheckPermissions",
        ipcChannel: "camera:checkPermissions",
      }),
      invokeDesktopBridgeRequest<{ recording: boolean; duration: number }>({
        rpcMethod: "cameraGetRecordingState",
        ipcChannel: "camera:getRecordingState",
      }),
      invokeDesktopBridgeRequest<{
        sources: Array<{ id: string; name: string }>;
        available: boolean;
      }>({
        rpcMethod: "screencaptureGetSources",
        ipcChannel: "screencapture:getSources",
      }),
      invokeDesktopBridgeRequest<{ status: string }>({
        rpcMethod: "permissionsCheck",
        ipcChannel: "permissions:check",
        params: { id: "screen-recording" },
      }),
      invokeDesktopBridgeRequest<{
        recording: boolean;
        duration: number;
        paused: boolean;
      }>({
        rpcMethod: "screencaptureGetRecordingState",
        ipcChannel: "screencapture:getRecordingState",
      }),
    ]);

    const nextDevices = devicesResult?.devices ?? [];
    const nextSources = sourcesResult?.sources ?? [];

    setCameraDevices(nextDevices);
    setSelectedCameraId((current) => current || nextDevices[0]?.deviceId || "");
    setCameraPermission(cameraPermissionResult?.status ?? "unknown");
    setCameraRecording(cameraRecordingState?.recording ?? false);
    setCameraRecordingDuration(cameraRecordingState?.duration ?? 0);
    setScreenSources(nextSources);
    setSelectedSourceId((current) => current || nextSources[0]?.id || "");
    setScreenPermission(screenPermissionResult?.status ?? "unknown");
    setScreenRecording(screenRecordingState?.recording ?? false);
    setScreenPaused(screenRecordingState?.paused ?? false);
    setScreenRecordingDuration(screenRecordingState?.duration ?? 0);
    setLoading(false);
  }, [desktopRuntime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      successMessage?: string,
      refreshAfter = true,
    ) => {
      setBusyAction(id);
      setError(null);
      setMessage(null);
      try {
        await action();
        if (refreshAfter) {
          await refresh();
        }
        if (successMessage) {
          setMessage(successMessage);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Native media action failed.",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refresh],
  );

  if (!desktopRuntime) {
    return (
      <div className="rounded-xl border border-border bg-bg-muted px-3 py-3 text-xs text-muted">
        Native camera and screen capture controls are only available inside the
        Electrobun runtime.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-muted px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-txt">
            Native Capture Controls
          </div>
          <div className="text-[10px] text-muted">
            Camera preview, capture, recording, and screencapture tools owned by
            the desktop runtime.
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void runAction(
              "media-refresh-native",
              async () => {},
              "Native media state refreshed.",
            )
          }
          disabled={loading || busyAction === "media-refresh-native"}
        >
          Refresh
        </Button>
      </div>

      {(error || message) && (
        <div
          className={`rounded-lg border px-2.5 py-2 text-[11px] ${
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
          <div className="text-xs font-semibold text-txt">Camera</div>
          <div className="text-[10px] text-muted">
            Permission: {cameraPermission} · Recording:{" "}
            {cameraRecording ? "on" : "off"} · Duration:{" "}
            {cameraRecordingDuration}s
          </div>
          <Select
            value={selectedCameraId}
            onValueChange={(value) => setSelectedCameraId(value)}
          >
            <SelectTrigger className={SETTINGS_SOFT_SELECT_TRIGGER_CLASSNAME}>
              <SelectValue placeholder="No camera devices" />
            </SelectTrigger>
            <SelectContent>
              {cameraDevices.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No camera devices
                </SelectItem>
              ) : (
                cameraDevices
                  .filter((device) => device.deviceId)
                  .map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label || device.deviceId}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-permission",
                  async () => {
                    await invokeDesktopBridgeRequest<{ status: string }>({
                      rpcMethod: "cameraRequestPermissions",
                      ipcChannel: "camera:requestPermissions",
                    });
                  },
                  "Camera permission request sent.",
                )
              }
              disabled={busyAction === "media-camera-permission"}
            >
              Request Camera Permission
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-preview",
                  async () => {
                    if (cameraPreviewRunning) {
                      await invokeDesktopBridgeRequest<void>({
                        rpcMethod: "cameraStopPreview",
                        ipcChannel: "camera:stopPreview",
                      });
                      setCameraPreviewRunning(false);
                      return;
                    }

                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      reason?: string;
                    }>({
                      rpcMethod: "cameraStartPreview",
                      ipcChannel: "camera:startPreview",
                      params: selectedCameraId
                        ? { deviceId: selectedCameraId }
                        : {},
                    });
                    if (result?.available === false) {
                      throw new Error(
                        result.reason || "Camera preview unavailable.",
                      );
                    }
                    setCameraPreviewRunning(true);
                  },
                  cameraPreviewRunning
                    ? "Camera preview stopped."
                    : "Camera preview started.",
                  false,
                )
              }
              disabled={busyAction === "media-camera-preview"}
            >
              {cameraPreviewRunning ? "Stop Preview" : "Start Preview"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-switch",
                  async () => {
                    if (!selectedCameraId) {
                      throw new Error("Select a camera device first.");
                    }
                    await invokeDesktopBridgeRequest<{ available: boolean }>({
                      rpcMethod: "cameraSwitchCamera",
                      ipcChannel: "camera:switchCamera",
                      params: { deviceId: selectedCameraId },
                    });
                  },
                  "Camera switched.",
                )
              }
              disabled={
                !selectedCameraId || busyAction === "media-camera-switch"
              }
            >
              Switch Camera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-capture",
                  async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      data?: string;
                    }>({
                      rpcMethod: "cameraCapturePhoto",
                      ipcChannel: "camera:capturePhoto",
                    });
                    if (result?.available === false) {
                      throw new Error("Photo capture unavailable.");
                    }
                    setLastPhotoStatus(
                      result?.data
                        ? "Photo captured in memory."
                        : "Photo capture completed.",
                    );
                  },
                  "Photo capture requested.",
                  false,
                )
              }
              disabled={busyAction === "media-camera-capture"}
            >
              Capture Photo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-recording",
                  async () => {
                    if (cameraRecording) {
                      const result = await invokeDesktopBridgeRequest<{
                        available: boolean;
                        path?: string;
                      }>({
                        rpcMethod: "cameraStopRecording",
                        ipcChannel: "camera:stopRecording",
                      });
                      setLastSavedPath(result?.path ?? null);
                      return;
                    }

                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                    }>({
                      rpcMethod: "cameraStartRecording",
                      ipcChannel: "camera:startRecording",
                    });
                    if (result?.available === false) {
                      throw new Error("Camera recording unavailable.");
                    }
                  },
                  cameraRecording
                    ? "Camera recording stopped."
                    : "Camera recording started.",
                )
              }
              disabled={busyAction === "media-camera-recording"}
            >
              {cameraRecording
                ? "Stop Camera Recording"
                : "Start Camera Recording"}
            </Button>
          </div>
          <div className="text-[11px] text-muted">{lastPhotoStatus}</div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
          <div className="text-xs font-semibold text-txt">Screen Capture</div>
          <div className="text-[10px] text-muted">
            Permission: {screenPermission} · Recording:{" "}
            {screenRecording ? "on" : "off"} · Duration:{" "}
            {screenRecordingDuration}s{screenPaused ? " · paused" : ""}
          </div>
          <Select
            value={selectedSourceId}
            onValueChange={(value) => setSelectedSourceId(value)}
          >
            <SelectTrigger className={SETTINGS_SOFT_SELECT_TRIGGER_CLASSNAME}>
              <SelectValue placeholder="No screen sources" />
            </SelectTrigger>
            <SelectContent>
              {screenSources.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No screen sources
                </SelectItem>
              ) : (
                screenSources
                  .filter((source) => source.id)
                  .map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-open-settings",
                  async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "permissionsOpenSettings",
                      ipcChannel: "permissions:openSettings",
                      params: { id: "screen-recording" },
                    });
                  },
                  "Opened screen recording settings.",
                  false,
                )
              }
              disabled={busyAction === "media-screen-open-settings"}
            >
              Open Screen Permission Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-switch-source",
                  async () => {
                    if (!selectedSourceId) {
                      throw new Error("Select a screen source first.");
                    }
                    await invokeDesktopBridgeRequest<{ available: boolean }>({
                      rpcMethod: "screencaptureSwitchSource",
                      ipcChannel: "screencapture:switchSource",
                      params: { sourceId: selectedSourceId },
                    });
                  },
                  "Screen source switched.",
                )
              }
              disabled={
                !selectedSourceId || busyAction === "media-screen-switch-source"
              }
            >
              Switch Source
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-screenshot",
                  async () => {
                    const screenshot = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      data?: string;
                    }>({
                      rpcMethod: "screencaptureTakeScreenshot",
                      ipcChannel: "screencapture:takeScreenshot",
                    });
                    if (screenshot?.available === false || !screenshot?.data) {
                      throw new Error("Screenshot unavailable.");
                    }
                    const saved = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      path?: string;
                    }>({
                      rpcMethod: "screencaptureSaveScreenshot",
                      ipcChannel: "screencapture:saveScreenshot",
                      params: {
                        data: screenshot.data,
                        filename: "milady-desktop-screenshot.png",
                      },
                    });
                    setLastSavedPath(saved?.path ?? null);
                  },
                  "Screenshot captured and saved.",
                  false,
                )
              }
              disabled={busyAction === "media-screen-screenshot"}
            >
              Take Screenshot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-recording",
                  async () => {
                    if (screenRecording) {
                      const stopped = await invokeDesktopBridgeRequest<{
                        available: boolean;
                        path?: string;
                      }>({
                        rpcMethod: "screencaptureStopRecording",
                        ipcChannel: "screencapture:stopRecording",
                      });
                      setLastSavedPath(stopped?.path ?? null);
                      return;
                    }

                    const started = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      reason?: string;
                    }>({
                      rpcMethod: "screencaptureStartRecording",
                      ipcChannel: "screencapture:startRecording",
                    });
                    if (started?.available === false) {
                      throw new Error(
                        started.reason || "Screen recording unavailable.",
                      );
                    }
                  },
                  screenRecording
                    ? "Screen recording stopped."
                    : "Screen recording started.",
                )
              }
              disabled={busyAction === "media-screen-recording"}
            >
              {screenRecording
                ? "Stop Screen Recording"
                : "Start Screen Recording"}
            </Button>
            {screenRecording && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void runAction(
                    "media-screen-pause-toggle",
                    async () => {
                      await invokeDesktopBridgeRequest<{ available: boolean }>({
                        rpcMethod: screenPaused
                          ? "screencaptureResumeRecording"
                          : "screencapturePauseRecording",
                        ipcChannel: screenPaused
                          ? "screencapture:resumeRecording"
                          : "screencapture:pauseRecording",
                      });
                    },
                    screenPaused
                      ? "Screen recording resumed."
                      : "Screen recording paused.",
                  )
                }
                disabled={busyAction === "media-screen-pause-toggle"}
              >
                {screenPaused ? "Resume Recording" : "Pause Recording"}
              </Button>
            )}
            {lastSavedPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void runAction(
                    "media-open-saved-path",
                    async () => {
                      await invokeDesktopBridgeRequest<void>({
                        rpcMethod: "desktopOpenPath",
                        ipcChannel: "desktop:openPath",
                        params: { path: lastSavedPath },
                      });
                    },
                    "Opened saved capture.",
                    false,
                  )
                }
                disabled={busyAction === "media-open-saved-path"}
              >
                Open Saved Capture
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted break-all">
            {lastSavedPath
              ? `Last saved path: ${lastSavedPath}`
              : "No saved capture path yet."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaSettingsSection() {
  const { setTimeout } = useTimeout();

  const {
    t,
    elizaCloudConnected,
    companionVrmPowerMode,
    setCompanionVrmPowerMode,
    companionAnimateWhenHidden,
    setCompanionAnimateWhenHidden,
    companionHalfFramerateMode,
    setCompanionHalfFramerateMode,
  } = useApp();
  const [mediaConfig, setMediaConfig] = useState<MediaConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MediaCategory>("image");
  const [dirty, setDirty] = useState(false);

  // Load config on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const cfg = await client.getConfig();
      setMediaConfig((cfg.media as MediaConfig) ?? {});
      setLoading(false);
    })();
  }, []);

  // Get current category config
  const getCategoryConfig = useCallback(
    (category: MediaCategory) => {
      return ((mediaConfig as Record<string, unknown>)[category] ??
        {}) as Record<string, unknown>;
    },
    [mediaConfig],
  );

  // Get mode for category
  const getMode = useCallback(
    (category: MediaCategory): MediaMode => {
      const cfg = getCategoryConfig(category);
      return (cfg.mode as MediaMode) ?? "cloud";
    },
    [getCategoryConfig],
  );

  // Get provider for category
  const getProvider = useCallback(
    (category: MediaCategory): string => {
      const cfg = getCategoryConfig(category);
      return (cfg.provider as string) ?? "cloud";
    },
    [getCategoryConfig],
  );

  // Update category config
  const updateCategoryConfig = useCallback(
    (category: MediaCategory, updates: Record<string, unknown>) => {
      setMediaConfig((prev) => ({
        ...prev,
        [category]: {
          ...(((prev as Record<string, unknown>)[category] as Record<
            string,
            unknown
          >) ?? {}),
          ...updates,
        },
      }));
      setDirty(true);
    },
    [],
  );

  // Update nested value in config
  const updateNestedValue = useCallback((path: string, value: unknown) => {
    setMediaConfig(
      (prev) =>
        setNestedValue(
          prev as Record<string, unknown>,
          path,
          value,
        ) as MediaConfig,
    );
    setDirty(true);
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    await client.updateConfig({ media: mediaConfig });
    setSaveSuccess(true);
    setDirty(false);
    setTimeout(() => setSaveSuccess(false), 2500);
    setSaving(false);
  }, [mediaConfig, setTimeout]);

  // Check if provider is configured
  const isProviderConfigured = useCallback(
    (category: MediaCategory): boolean => {
      if (category === "voice") return true;
      const mode = getMode(category);
      if (mode === "cloud") return elizaCloudConnected;

      const provider = getProvider(category);
      const apiKeyField = getApiKeyField(category, provider);
      if (!apiKeyField) return true;

      const value = getNestedValue(
        mediaConfig as Record<string, unknown>,
        apiKeyField.path,
      );
      return typeof value === "string" && value.length > 0;
    },
    [getMode, getProvider, mediaConfig, elizaCloudConnected],
  );

  if (loading) {
    return (
      <div className="py-8 text-center text-muted text-xs">
        {t("mediasettingssection.LoadingMediaConfig")}
      </div>
    );
  }

  const isVoiceTab = activeTab === "voice";
  const currentMode = isVoiceTab ? ("cloud" as MediaMode) : getMode(activeTab);
  const currentProvider = isVoiceTab ? "cloud" : getProvider(activeTab);
  const providers = isVoiceTab ? [] : getProvidersForCategory(activeTab);
  const apiKeyField = isVoiceTab
    ? null
    : getApiKeyField(activeTab, currentProvider);
  const configured = isProviderConfigured(activeTab);

  return (
    <div className="flex flex-col gap-4">
      {COMPANION_ENABLED && (
        <div
          className="rounded-xl border border-border bg-card/60 px-3 py-3 flex flex-col gap-3"
          data-testid="settings-companion-vrm-power"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold text-txt">
              {t("settings.companionVrmPower.label")}
            </div>
            <div className="text-[10px] text-muted mt-1 leading-snug">
              {t("settings.companionVrmPower.desc")}
            </div>
          </div>
          <div className={SETTINGS_SEGMENTED_GROUP_CLASSNAME}>
            {COMPANION_VRM_POWER_OPTIONS.map((mode) => {
              const active = companionVrmPowerMode === mode;
              return (
                <Button
                  key={mode}
                  type="button"
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className={`${MEDIA_SEGMENT_BUTTON_CLASSNAME} ${
                    active
                      ? MEDIA_SEGMENT_BUTTON_ACTIVE_CLASSNAME
                      : MEDIA_SEGMENT_BUTTON_INACTIVE_CLASSNAME
                  }`}
                  onClick={() => setCompanionVrmPowerMode(mode)}
                  aria-pressed={active}
                >
                  {t(`settings.companionVrmPower.${mode}`)}
                </Button>
              );
            })}
          </div>
          <div
            className="flex flex-col gap-2 border-t border-border pt-3"
            data-testid="settings-companion-half-framerate"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-txt">
                {t("settings.companionHalfFramerate.label")}
              </div>
              <div className="text-[10px] text-muted mt-1 leading-snug">
                {t("settings.companionHalfFramerate.desc")}
              </div>
            </div>
            <div className={SETTINGS_SEGMENTED_GROUP_CLASSNAME}>
              {COMPANION_HALF_FRAMERATE_OPTIONS.map((mode) => {
                const active = companionHalfFramerateMode === mode;
                return (
                  <Button
                    key={mode}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className={`${MEDIA_SEGMENT_BUTTON_CLASSNAME} ${
                      active
                        ? MEDIA_SEGMENT_BUTTON_ACTIVE_CLASSNAME
                        : MEDIA_SEGMENT_BUTTON_INACTIVE_CLASSNAME
                    }`}
                    onClick={() => setCompanionHalfFramerateMode(mode)}
                    aria-pressed={active}
                  >
                    {t(`settings.companionHalfFramerate.${mode}`)}
                  </Button>
                );
              })}
            </div>
          </div>
          <div
            className="flex flex-col gap-2 border-t border-border pt-3"
            data-testid="settings-companion-animate-when-hidden"
          >
            <div className="text-xs font-semibold text-txt">
              {t("settings.companionAnimateWhenHidden.title")}
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1 text-[10px] text-muted leading-snug pr-2">
                {t("settings.companionAnimateWhenHidden.desc")}
              </div>
              <Switch
                className="shrink-0"
                checked={companionAnimateWhenHidden}
                onCheckedChange={(v) => setCompanionAnimateWhenHidden(v)}
                aria-label={t("settings.companionAnimateWhenHidden.title")}
              />
            </div>
          </div>
        </div>
      )}

      {/* biome-ignore lint/a11y/useSemanticElements: existing pattern */}
      <div
        className="flex flex-col gap-4 rounded-xl border border-border/70 border-l-[3px] border-l-accent bg-card/85 px-3 py-3 shadow-sm"
        data-testid="settings-media-generate-group"
        role="region"
        aria-label={t("mediasettingssection.GenerateGroupRegionLabel", {
          defaultValue: "Media generation by category",
        })}
      >
        <header className="flex flex-col gap-0.5 pb-2 border-b border-border/80">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
            {t("mediasettingssection.GenerateGroupTitle", {
              defaultValue: "Generation",
            })}
          </p>
          <p className="text-[10px] text-muted leading-snug">
            {t("mediasettingssection.GenerateGroupHint", {
              defaultValue:
                "Use the tabs to switch category; settings below apply to the selected tab.",
            })}
          </p>
        </header>

        {/* Category tabs */}
        <div className={SETTINGS_SEGMENTED_GROUP_CLASSNAME}>
          {(
            ["image", "video", "audio", "vision", "voice"] as MediaCategory[]
          ).map((cat) => {
            const active = activeTab === cat;
            const catConfigured = isProviderConfigured(cat);
            return (
              <Button
                key={cat}
                variant={active ? "default" : "ghost"}
                size="sm"
                className={`flex-1 basis-[calc(50%-0.125rem)] sm:basis-0 min-h-[44px] rounded-lg border px-2 py-2 text-[10px] sm:text-xs font-semibold !whitespace-normal ${
                  active
                    ? MEDIA_SEGMENT_BUTTON_ACTIVE_CLASSNAME
                    : MEDIA_SEGMENT_BUTTON_INACTIVE_CLASSNAME
                }`}
                onClick={() => setActiveTab(cat)}
              >
                <span>{t(CATEGORY_LABELS[cat])}</span>
                <span
                  className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                    catConfigured ? "bg-ok" : "bg-border-strong"
                  }`}
                />
              </Button>
            );
          })}
        </div>

        {/* Voice tab — render VoiceConfigView instead of media config */}
        {activeTab === "voice" ? (
          <VoiceConfigView />
        ) : (
          <>
            {/* Mode toggle (cloud vs own-key) */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-xs font-semibold text-muted w-full sm:w-auto">
                {t("mediasettingssection.APISourceForCategory", {
                  category: t(
                    MEDIA_API_SOURCE_CATEGORY_KEYS[
                      activeTab as keyof typeof MEDIA_API_SOURCE_CATEGORY_KEYS
                    ],
                  ),
                })}
              </span>
              <CloudSourceModeToggle
                mode={currentMode}
                onChange={(mode) => {
                  if (mode === "cloud") {
                    updateCategoryConfig(activeTab, {
                      mode: "cloud",
                      provider: "cloud",
                    });
                    return;
                  }
                  updateCategoryConfig(activeTab, { mode: "own-key" });
                }}
              />

              {/* Status badge */}
              <span
                className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${
                  configured
                    ? "border-ok bg-ok/10 text-txt"
                    : "border-warn bg-warn-subtle text-txt"
                }`}
              >
                {configured
                  ? t("config-field.Configured")
                  : t("mediasettingssection.NeedsSetup")}
              </span>
            </div>

            {/* Cloud mode status */}
            {currentMode === "cloud" && (
              <CloudConnectionStatus
                connected={elizaCloudConnected}
                disconnectedText={t(
                  "elizaclouddashboard.ElizaCloudNotConnectedSettings",
                )}
              />
            )}

            {/* Own-key mode: provider selection */}
            {currentMode === "own-key" && (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-muted">
                  {t("mediasettingssection.Provider")}
                </div>
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${providers.length}, 1fr)`,
                  }}
                >
                  {providers
                    .filter((p) => p.id !== "cloud")
                    .map((p) => {
                      const active = currentProvider === p.id;
                      return (
                        <Button
                          key={p.id}
                          variant="outline"
                          size="sm"
                          className={`h-auto px-3 py-2 text-xs font-normal rounded-lg border border-border ${
                            active
                              ? "bg-accent/10 border-accent text-txt"
                              : "bg-card text-txt hover:bg-bg-hover"
                          }`}
                          onClick={() =>
                            updateCategoryConfig(activeTab, {
                              provider: p.id as
                                | ImageProvider
                                | VideoProvider
                                | AudioGenProvider
                                | VisionProvider,
                            })
                          }
                        >
                          <div className="font-semibold">
                            {p.id === "cloud"
                              ? t("providerswitcher.elizaCloud")
                              : p.label}
                          </div>
                          <div className="text-[10px] text-muted mt-0.5">
                            {p.id === "cloud"
                              ? t("elizaclouddashboard.NoSetupNeeded")
                              : t(p.hint)}
                          </div>
                        </Button>
                      );
                    })}
                </div>

                {/* API Key input */}
                {apiKeyField && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold">
                      {t(apiKeyField.labelKey)}
                    </span>
                    <Input
                      type="password"
                      className={SETTINGS_COMPACT_INPUT_CLASSNAME}
                      placeholder={
                        getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          apiKeyField.path,
                        )
                          ? t("mediasettingssection.ApiKeySetLeaveBlank")
                          : t("mediasettingssection.EnterApiKey")
                      }
                      onChange={(e) =>
                        updateNestedValue(
                          apiKeyField.path,
                          e.target.value || undefined,
                        )
                      }
                    />
                  </div>
                )}

                {/* Provider-specific model selection for image generation */}
                {activeTab === "image" && currentProvider === "fal" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "image.fal.model",
                        ) as string) ?? "fal-ai/flux-pro"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("image.fal.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {t("mediasettingssection.Flux")}
                          </SelectLabel>
                          <SelectItem value="fal-ai/flux-pro">
                            {t("mediasettingssection.FluxPro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/flux-pro/v1.1">
                            {t("mediasettingssection.FluxProV11")}
                          </SelectItem>
                          <SelectItem value="fal-ai/flux-pro/kontext">
                            {t("mediasettingssection.FluxKontextPro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/flux-2-flex">
                            {t("mediasettingssection.Flux2Flex")}
                          </SelectItem>
                          <SelectItem value="fal-ai/flux/dev">
                            {t("mediasettingssection.FluxDev")}
                          </SelectItem>
                          <SelectItem value="fal-ai/flux/schnell">
                            {t("mediasettingssection.FluxSchnell")}
                          </SelectItem>
                          <SelectItem value="fal-ai/fast-flux">
                            {t("mediasettingssection.FastFlux")}
                          </SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>
                            {t("mediasettingssection.OtherModels")}
                          </SelectLabel>
                          <SelectItem value="fal-ai/nano-banana-pro">
                            {t("mediasettingssection.NanoBananaProGoo")}
                          </SelectItem>
                          <SelectItem value="fal-ai/recraft/v3/text-to-image">
                            {t("mediasettingssection.RecraftV3")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-image/v3/text-to-image">
                            {t("mediasettingssection.KlingImageV3")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-image/o3/text-to-image">
                            {t("mediasettingssection.KlingImageO3")}
                          </SelectItem>
                          <SelectItem value="xai/grok-imagine-image">
                            {t("mediasettingssection.GrokImagineXAI")}
                          </SelectItem>
                          <SelectItem value="fal-ai/stable-diffusion-3">
                            {t("mediasettingssection.StableDiffusion3")}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeTab === "image" && currentProvider === "openai" && (
                  <div className="flex gap-3">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold">
                        {t("mediasettingssection.Model")}
                      </span>
                      <Select
                        value={
                          (getNestedValue(
                            mediaConfig as Record<string, unknown>,
                            "image.openai.model",
                          ) as string) ?? "dall-e-3"
                        }
                        onValueChange={(value) =>
                          updateNestedValue("image.openai.model", value)
                        }
                      >
                        <SelectTrigger
                          className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dall-e-3">
                            {t("mediasettingssection.DALLE3")}
                          </SelectItem>
                          <SelectItem value="dall-e-2">
                            {t("mediasettingssection.DALLE2")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold">
                        {t("mediasettingssection.Quality")}
                      </span>
                      <Select
                        value={
                          (getNestedValue(
                            mediaConfig as Record<string, unknown>,
                            "image.openai.quality",
                          ) as string) ?? "standard"
                        }
                        onValueChange={(value) =>
                          updateNestedValue("image.openai.quality", value)
                        }
                      >
                        <SelectTrigger
                          className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">
                            {t("mediasettingssection.Standard")}
                          </SelectItem>
                          <SelectItem value="hd">HD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Video FAL model selection */}
                {activeTab === "video" && currentProvider === "fal" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "video.fal.model",
                        ) as string) ??
                        "fal-ai/kling-video/v3/pro/text-to-video"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("video.fal.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {t("mediasettingssection.TextToVideo")}
                          </SelectLabel>
                          <SelectItem value="fal-ai/veo3.1">
                            {t("mediasettingssection.Veo31Google")}
                          </SelectItem>
                          <SelectItem value="fal-ai/veo3.1/fast">
                            {t("mediasettingssection.Veo31Fast")}
                          </SelectItem>
                          <SelectItem value="fal-ai/sora-2/text-to-video">
                            {t("mediasettingssection.Sora2")}
                          </SelectItem>
                          <SelectItem value="fal-ai/sora-2/text-to-video/pro">
                            {t("mediasettingssection.Sora2Pro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-video/v3/pro/text-to-video">
                            {t("mediasettingssection.Kling30Pro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-video/v3/standard/text-to-video">
                            {t("mediasettingssection.Kling30")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-video/o3/pro/text-to-video">
                            {t("mediasettingssection.KlingO3Pro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-video/o3/standard/text-to-video">
                            {t("mediasettingssection.KlingO3")}
                          </SelectItem>
                          <SelectItem value="xai/grok-imagine-video/text-to-video">
                            {t("mediasettingssection.GrokVideoXAI")}
                          </SelectItem>
                          <SelectItem value="fal-ai/minimax/video-01-live">
                            {t("mediasettingssection.MinimaxHailuo")}
                          </SelectItem>
                          <SelectItem value="fal-ai/hunyuan-video">
                            {t("mediasettingssection.HunyuanVideo")}
                          </SelectItem>
                          <SelectItem value="fal-ai/mochi-v1">
                            {t("mediasettingssection.Mochi1")}
                          </SelectItem>
                          <SelectItem value="fal-ai/wan/v2.2-a14b/text-to-video">
                            {t("mediasettingssection.Wan22")}
                          </SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>
                            {t("mediasettingssection.ImageToVideo")}
                          </SelectLabel>
                          <SelectItem value="fal-ai/kling-video/v3/pro/image-to-video">
                            {t("mediasettingssection.Kling30Pro")}
                          </SelectItem>
                          <SelectItem value="fal-ai/kling-video/o3/standard/image-to-video">
                            {t("mediasettingssection.KlingO3")}
                          </SelectItem>
                          <SelectItem value="fal-ai/veo3.1/image-to-video">
                            {t("mediasettingssection.Veo31")}
                          </SelectItem>
                          <SelectItem value="fal-ai/veo3.1/fast/image-to-video">
                            {t("mediasettingssection.Veo31Fast")}
                          </SelectItem>
                          <SelectItem value="fal-ai/sora-2/image-to-video">
                            {t("mediasettingssection.Sora2")}
                          </SelectItem>
                          <SelectItem value="fal-ai/sora-2/image-to-video/pro">
                            {t("mediasettingssection.Sora2Pro")}
                          </SelectItem>
                          <SelectItem value="xai/grok-imagine-video/image-to-video">
                            {t("mediasettingssection.GrokXAI")}
                          </SelectItem>
                          <SelectItem value="fal-ai/minimax/video-01-live/image-to-video">
                            {t("mediasettingssection.MinimaxHailuo")}
                          </SelectItem>
                          <SelectItem value="fal-ai/luma-dream-machine/image-to-video">
                            {t("mediasettingssection.LumaDreamMachine")}
                          </SelectItem>
                          <SelectItem value="fal-ai/pixverse/v4.5/image-to-video">
                            {t("mediasettingssection.PixverseV45")}
                          </SelectItem>
                          <SelectItem value="fal-ai/ltx-2-19b/image-to-video">
                            {t("mediasettingssection.LTX219B")}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Audio Suno model selection */}
                {activeTab === "audio" && currentProvider === "suno" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "audio.suno.model",
                        ) as string) ?? "chirp-v3.5"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("audio.suno.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chirp-v3.5">
                          {t("mediasettingssection.ChirpV35")}
                        </SelectItem>
                        <SelectItem value="chirp-v3">
                          {t("mediasettingssection.ChirpV3")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Audio ElevenLabs duration */}
                {activeTab === "audio" && currentProvider === "elevenlabs" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.MaxDurationSecond")}
                    </span>
                    <Input
                      type="number"
                      min={0.5}
                      max={22}
                      step={0.5}
                      className={`${SETTINGS_COMPACT_INPUT_CLASSNAME} w-24`}
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "audio.elevenlabs.duration",
                        ) as number) ?? 5
                      }
                      onChange={(e) =>
                        updateNestedValue(
                          "audio.elevenlabs.duration",
                          parseFloat(e.target.value),
                        )
                      }
                    />
                  </div>
                )}

                {/* Vision model selection */}
                {activeTab === "vision" && currentProvider === "openai" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "vision.openai.model",
                        ) as string) ?? "gpt-4o"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("vision.openai.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">
                          {t("mediasettingssection.GPT4o")}
                        </SelectItem>
                        <SelectItem value="gpt-4o-mini">
                          {t("mediasettingssection.GPT4oMini")}
                        </SelectItem>
                        <SelectItem value="gpt-4-turbo">
                          {t("mediasettingssection.GPT4Turbo")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeTab === "vision" && currentProvider === "google" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "vision.google.model",
                        ) as string) ?? "gemini-2.0-flash"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("vision.google.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-2.0-flash">
                          {t("mediasettingssection.Gemini20Flash")}
                        </SelectItem>
                        <SelectItem value="gemini-1.5-pro">
                          {t("mediasettingssection.Gemini15Pro")}
                        </SelectItem>
                        <SelectItem value="gemini-1.5-flash">
                          {t("mediasettingssection.Gemini15Flash")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeTab === "vision" && currentProvider === "anthropic" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold">
                      {t("mediasettingssection.Model")}
                    </span>
                    <Select
                      value={
                        (getNestedValue(
                          mediaConfig as Record<string, unknown>,
                          "vision.anthropic.model",
                        ) as string) ?? "claude-sonnet-4-20250514"
                      }
                      onValueChange={(value) =>
                        updateNestedValue("vision.anthropic.model", value)
                      }
                    >
                      <SelectTrigger
                        className={SETTINGS_COMPACT_SELECT_TRIGGER_CLASSNAME}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-sonnet-4-20250514">
                          {t("mediasettingssection.ClaudeSonnet4")}
                        </SelectItem>
                        <SelectItem value="claude-3-5-sonnet-20241022">
                          {t("mediasettingssection.Claude35Sonnet")}
                        </SelectItem>
                        <SelectItem value="claude-3-haiku-20240307">
                          {t("mediasettingssection.Claude3Haiku")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <SaveFooter
              dirty={dirty}
              saving={saving}
              saveError={saveError}
              saveSuccess={saveSuccess}
              onSave={() => void handleSave()}
            />
          </>
        )}
      </div>
    </div>
  );
}
