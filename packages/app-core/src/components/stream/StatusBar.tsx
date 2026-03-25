import { isElectrobunRuntime } from "@miladyai/app-core/bridge";
import { getBootConfig } from "@miladyai/app-core/config";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
} from "@miladyai/ui";
import {
  ChevronDown,
  ExternalLink,
  PictureInPicture,
  Pin,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type AgentMode,
  IS_POPOUT,
  isSupportedStreamUrl,
  STREAM_SOURCE_LABELS,
  type StreamSourceType,
  toggleAlwaysOnTop,
} from "./helpers";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_PILL_CLASSNAME =
  "inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/45 bg-card/92 px-2.5 py-1.5 text-[11px] text-muted-strong shadow-sm";
const CONTROL_BUTTON_CLASSNAME =
  "inline-flex min-h-9 items-center justify-center rounded-xl border border-border/45 bg-card/92 px-2.5 py-1.5 text-[11px] text-muted-strong shadow-sm transition-[border-color,background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/35 hover:border-border-strong hover:bg-bg-hover hover:text-txt hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border/45 disabled:hover:bg-card/92 disabled:hover:text-muted-strong";
const ICON_BUTTON_CLASSNAME = `${CONTROL_BUTTON_CLASSNAME} h-9 w-9 px-0`;
const ACCENT_ICON_BUTTON_CLASSNAME = `${ICON_BUTTON_CLASSNAME} border-accent/40 bg-accent/12 text-accent-fg hover:border-accent/55 hover:bg-accent/18 hover:text-accent-fg`;
const LIVE_ACTION_BUTTON_CLASSNAME =
  "inline-flex h-9 min-h-9 items-center justify-center rounded-xl border px-3 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-sm transition-[border-color,background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-wait disabled:opacity-50";

export function StatusBar({
  agentName,
  mode,
  viewerCount,
  isPip,
  onTogglePip,
  streamAvailable,
  streamLive,
  streamLoading,
  onToggleStream,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  destinations,
  activeDestination,
  onDestinationChange,
  uptime,
  frameCount,
  audioSource,
  streamSource,
  activeGameViewerUrl,
  onSourceChange,
  onOpenSettings,
}: {
  agentName: string;
  mode: AgentMode;
  viewerCount: number | null;
  isPip: boolean;
  onTogglePip: () => void;
  streamAvailable: boolean;
  streamLive: boolean;
  streamLoading: boolean;
  onToggleStream: () => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  destinations: Array<{ id: string; name: string }>;
  activeDestination: { id: string; name: string } | null;
  onDestinationChange: (id: string) => void;
  uptime: number;
  frameCount: number;
  audioSource: string;
  streamSource: { type: StreamSourceType; url?: string };
  activeGameViewerUrl: string;
  onSourceChange: (sourceType: StreamSourceType, customUrl?: string) => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useApp();
  const isElectrobun = isElectrobunRuntime();
  const isLive = streamLive;
  const [pinned, setPinned] = useState(IS_POPOUT); // popout starts pinned
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceDropdownRef = useRef<HTMLSpanElement>(null);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const trimmedCustomUrl = customUrlInput.trim();
  const customUrlValid = isSupportedStreamUrl(trimmedCustomUrl);

  // Close source picker on click outside
  useEffect(() => {
    if (!sourceOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        sourceDropdownRef.current &&
        !sourceDropdownRef.current.contains(e.target as Node)
      ) {
        setSourceOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sourceOpen]);
  const popoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup popout polling interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (popoutPollRef.current) {
        clearInterval(popoutPollRef.current);
        popoutPollRef.current = null;
      }
    };
  }, []);

  const modeLabel =
    mode === "gaming"
      ? "gaming"
      : mode === "terminal"
        ? "terminal"
        : mode === "chatting"
          ? "chatting"
          : "idle";
  return (
    <div
      className={`flex items-center justify-between border-b border-border/60 bg-card/80 shadow-sm backdrop-blur-xl shrink-0 ${isPip ? "px-2 py-1.5" : "px-3 py-2 lg:px-4"}`}
      style={
        IS_POPOUT ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined
      }
    >
      <div className="flex items-center gap-2">
        <span
          className={`${isPip ? "w-2 h-2" : "w-2.5 h-2.5"} rounded-full ${
            isLive
              ? "bg-danger ring-2 ring-danger/25 animate-pulse"
              : "bg-muted"
          }`}
        />
        {!isPip && (
          <>
            <span className="text-xs font-bold uppercase tracking-wider text-txt">
              {isLive ? "LIVE" : "OFFLINE"}
            </span>
            <span className="text-sm font-semibold text-txt-strong">
              {agentName}
            </span>
          </>
        )}
      </div>
      <div
        className={`flex items-center ${isPip ? "gap-1" : "gap-2 lg:gap-3"} text-xs text-muted`}
        style={
          IS_POPOUT
            ? ({ WebkitAppRegion: "no-drag" } as CSSProperties)
            : undefined
        }
      >
        {!isPip && viewerCount !== null && viewerCount > 0 && (
          <span className={STATUS_PILL_CLASSNAME}>
            <span className="w-1.5 h-1.5 rounded-full bg-ok" />
            <span className="text-txt-strong">{viewerCount}</span>
          </span>
        )}
        {!isPip && (
          <span className={`${STATUS_PILL_CLASSNAME} capitalize`}>
            <span className="text-txt-strong">{modeLabel}</span>
          </span>
        )}

        {/* Stream source picker — always visible */}
        {!isPip && (
          <span ref={sourceDropdownRef} className="relative flex items-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={!streamAvailable}
              className={`${CONTROL_BUTTON_CLASSNAME} max-w-44 gap-1.5 px-2.5`}
              onClick={() => setSourceOpen((o) => !o)}
              title={
                streamAvailable
                  ? "Select a stream source"
                  : "Install and enable the streaming plugin to change sources"
              }
            >
              <span className="shrink-0 text-muted">{t("statusbar.Src")}</span>
              <span className="truncate text-txt-strong font-medium">
                {STREAM_SOURCE_LABELS[streamSource.type]}
              </span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </Button>
            {sourceOpen && (
              <div className="absolute top-full left-0 z-50 mt-1.5 min-w-[220px] max-w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border/60 bg-card/98 shadow-xl backdrop-blur-xl">
                {(
                  ["stream-tab", "game", "custom-url"] as StreamSourceType[]
                ).map((st) => {
                  const isGame = st === "game";
                  const disabled =
                    !streamAvailable || (isGame && !activeGameViewerUrl.trim());
                  return (
                    <Button
                      key={st}
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      className={`min-h-9 h-auto w-full justify-start whitespace-normal rounded-none px-3 py-2 text-left text-xs transition-colors ${
                        streamSource.type === st
                          ? "bg-accent/12 text-txt-strong hover:bg-accent/18"
                          : disabled
                            ? "text-muted/40 opacity-50"
                            : "text-txt hover:bg-bg-hover"
                      }`}
                      onClick={() => {
                        if (st === "custom-url") return; // handled by input below
                        onSourceChange(
                          st,
                          isGame ? activeGameViewerUrl : undefined,
                        );
                        setSourceOpen(false);
                      }}
                    >
                      {STREAM_SOURCE_LABELS[st]}
                      {isGame && activeGameViewerUrl.trim() && (
                        <span className="ml-1 text-muted text-[10px]">
                          {t("statusbar.Active")}
                        </span>
                      )}
                    </Button>
                  );
                })}
                {/* Custom URL input */}
                <div className="flex items-center gap-2 border-t border-border/60 bg-bg/60 px-2.5 py-2">
                  <Input
                    placeholder={t("statusbar.https")}
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    disabled={!streamAvailable}
                    aria-invalid={
                      trimmedCustomUrl ? !customUrlValid : undefined
                    }
                    className={`min-w-0 flex-1 h-9 rounded-xl border bg-bg-hover/80 px-2.5 text-[11px] text-txt shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50 ${
                      trimmedCustomUrl && !customUrlValid
                        ? "border-danger"
                        : "border-border/50"
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customUrlValid) {
                        onSourceChange("custom-url", trimmedCustomUrl);
                        setSourceOpen(false);
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!streamAvailable || !customUrlValid}
                    className="h-9 rounded-xl border border-accent/35 bg-accent/12 px-2.5 text-[10px] font-semibold text-accent-fg hover:border-accent/55 hover:bg-accent/18 disabled:opacity-40"
                    onClick={() => {
                      if (customUrlValid) {
                        onSourceChange("custom-url", trimmedCustomUrl);
                        setSourceOpen(false);
                      }
                    }}
                    title={
                      streamAvailable
                        ? "Custom URLs must start with http:// or https://"
                        : "Install and enable the streaming plugin to use custom URLs"
                    }
                  >
                    Go
                  </Button>
                </div>
              </div>
            )}
          </span>
        )}

        {/* Health stats — live only */}
        {!isPip && isLive && (
          <span
            className={`${STATUS_PILL_CLASSNAME} max-w-[28rem] gap-1.5 overflow-hidden font-mono text-[10px]`}
          >
            <span className="truncate text-txt">{formatUptime(uptime)}</span>
            <span className="text-border">|</span>
            <span className="text-txt">{frameCount.toLocaleString()}f</span>
            {audioSource && (
              <>
                <span className="text-border">|</span>
                <span className="truncate text-txt">{audioSource}</span>
              </>
            )}
          </span>
        )}

        {/* Volume controls */}
        {!isPip && (
          <span className={`${STATUS_PILL_CLASSNAME} gap-2 pr-2`}>
            <Button
              variant="ghost"
              size="sm"
              disabled={!streamAvailable}
              className={ICON_BUTTON_CLASSNAME}
              title={muted ? "Unmute" : "Mute"}
              onClick={onToggleMute}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </Button>
            <div className="w-20 sm:w-24">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[muted ? 0 : volume]}
                disabled={!streamAvailable}
                onValueChange={([vol]) => onVolumeChange(vol)}
                title={`Volume: ${muted ? 0 : volume}%`}
                className="cursor-pointer"
              />
            </div>
          </span>
        )}

        {/* Destination selector — always visible when destinations exist */}
        {!isPip && destinations.length > 0 && (
          <Select
            value={activeDestination?.id ?? ""}
            disabled={isLive || !streamAvailable}
            onValueChange={(value) => onDestinationChange(value)}
          >
            <SelectTrigger
              className="h-9 w-[min(12rem,28vw)] rounded-xl border border-border/45 bg-card/92 px-2.5 py-1.5 text-[11px] text-txt shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              title={
                !streamAvailable
                  ? "Install and enable the streaming plugin to change destinations"
                  : isLive
                    ? "Stop stream to change destination"
                    : "Select destination"
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {destinations.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Settings gear */}
        {!isPip && onOpenSettings && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!streamAvailable}
            className={ICON_BUTTON_CLASSNAME}
            title={
              streamAvailable
                ? "Stream settings"
                : "Install and enable the streaming plugin to configure streaming"
            }
            onClick={onOpenSettings}
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        )}

        {!isPip && (
          <Button
            size="sm"
            disabled={!streamAvailable || streamLoading}
            className={`${LIVE_ACTION_BUTTON_CLASSNAME} ${
              isLive
                ? "border-danger/35 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/16"
                : "border-ok/35 bg-ok/10 text-ok hover:border-ok/50 hover:bg-ok/16"
            }`}
            onClick={onToggleStream}
            title={
              streamAvailable
                ? undefined
                : "Install and enable the streaming plugin to go live"
            }
          >
            {streamLoading ? "..." : isLive ? "Stop Stream" : "Go Live"}
          </Button>
        )}
        {IS_POPOUT ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className={
                isPip ? ACCENT_ICON_BUTTON_CLASSNAME : ICON_BUTTON_CLASSNAME
              }
              title={
                isPip
                  ? "Exit picture-in-picture"
                  : "Picture-in-picture (small overlay)"
              }
              onClick={onTogglePip}
            >
              <PictureInPicture className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={
                pinned ? ACCENT_ICON_BUTTON_CLASSNAME : ICON_BUTTON_CLASSNAME
              }
              title={pinned ? "Unpin from top" : "Pin to top (always on top)"}
              onClick={() => {
                const next = !pinned;
                toggleAlwaysOnTop(next).then((result) => {
                  if (result !== undefined) setPinned(next);
                });
              }}
            >
              <Pin className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : !isElectrobun ? (
          <Button
            variant="ghost"
            size="sm"
            className={ICON_BUTTON_CLASSNAME}
            title={t("statusbar.PopOutStreamView")}
            onClick={() => {
              const apiBase = getBootConfig().apiBase;
              const base = window.location.origin || "";
              const sep =
                window.location.protocol === "file:" ||
                window.location.protocol === "electrobun:"
                  ? "#"
                  : "";
              const qs = apiBase
                ? `popout&apiBase=${encodeURIComponent(apiBase)}`
                : "popout";
              const popoutWin = window.open(
                `${base}${sep}/?${qs}`,
                "milady-stream",
                "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no",
              );
              // Notify the main window to navigate away from stream tab
              if (popoutWin) {
                window.dispatchEvent(
                  new CustomEvent("stream-popout", { detail: "opened" }),
                );
                // Clear any existing poll before creating a new one
                if (popoutPollRef.current) {
                  clearInterval(popoutPollRef.current);
                }
                // Poll for popout close and notify to switch back
                popoutPollRef.current = setInterval(() => {
                  if (popoutWin.closed) {
                    if (popoutPollRef.current) {
                      clearInterval(popoutPollRef.current);
                      popoutPollRef.current = null;
                    }
                    window.dispatchEvent(
                      new CustomEvent("stream-popout", { detail: "closed" }),
                    );
                  }
                }, 500);
              }
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
