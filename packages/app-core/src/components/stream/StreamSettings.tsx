/**
 * StreamSettings — in-stream settings panel.
 *
 * Panels:
 *   1. Channel / destination picker
 *   2. Overlay widget manager (enable/disable + per-widget config)
 *   3. Stream source selector (stream-tab, game, custom-url)
 */

import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@miladyai/ui";
import { useState } from "react";
import type { StreamSourceType } from "./helpers";
import { isSupportedStreamUrl, STREAM_SOURCE_LABELS } from "./helpers";
import { getAllWidgets } from "./overlays/registry";
import type { WidgetConfigField, WidgetInstance } from "./overlays/types";
import type { UseOverlayLayout } from "./overlays/useOverlayLayout";

type Section = "channel" | "overlays" | "source";

interface StreamSettingsProps {
  destinations: Array<{ id: string; name: string }>;
  activeDestination: { id: string; name: string } | null;
  onDestinationChange: (id: string) => void;
  streamLive: boolean;
  streamSource: { type: StreamSourceType; url?: string };
  activeGameViewerUrl: string;
  onSourceChange: (sourceType: StreamSourceType, customUrl?: string) => void;
  overlayLayout: UseOverlayLayout;
  onClose: () => void;
}

const SECTION_HINT_CLASSNAME = "max-w-2xl text-[12px] leading-5 text-muted";
const FIELD_INPUT_CLASSNAME =
  "h-9 rounded-xl border border-border/50 bg-bg-hover/75 px-3 text-xs leading-5 text-txt shadow-sm focus-visible:ring-2 focus-visible:ring-accent/35";
const SURFACE_CARD_CLASSNAME =
  "rounded-2xl border border-border/55 bg-card/92 shadow-sm";
const OPTION_CARD_CLASSNAME =
  "w-full h-auto justify-start gap-3 rounded-2xl border border-border/55 bg-card/88 px-4 py-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-accent/35";
const ACTIVE_OPTION_CARD_CLASSNAME =
  "border-accent/45 bg-accent/12 shadow-md shadow-accent/5";

// ---------------------------------------------------------------------------
// Config field renderer
// ---------------------------------------------------------------------------

function ConfigField({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: WidgetConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <label
          key={fieldKey}
          htmlFor={`config-${fieldKey}`}
          className="flex items-center gap-2 text-[12px] text-txt cursor-pointer"
        >
          <Checkbox
            id={`config-${fieldKey}`}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(fieldKey, !!checked)}
          />
          {field.label}
        </label>
      );
    case "number":
      return (
        <label
          key={fieldKey}
          htmlFor={`config-${fieldKey}`}
          className="flex flex-col gap-0.5"
        >
          <span className="text-[11px] text-muted">{field.label}</span>
          <Input
            id={`config-${fieldKey}`}
            type="number"
            min={field.min}
            max={field.max}
            value={
              typeof value === "number" ? value : (field.default as number)
            }
            onChange={(e) => onChange(fieldKey, Number(e.target.value))}
            className={FIELD_INPUT_CLASSNAME}
          />
        </label>
      );
    case "select":
      return (
        <label
          key={fieldKey}
          htmlFor={`config-${fieldKey}`}
          className="flex flex-col gap-0.5"
        >
          <span className="text-[11px] text-muted">{field.label}</span>
          <Select
            value={typeof value === "string" ? value : String(field.default)}
            onValueChange={(val) => onChange(fieldKey, val)}
          >
            <SelectTrigger
              id={`config-${fieldKey}`}
              className={`${FIELD_INPUT_CLASSNAME} h-9 cursor-pointer`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options
                ?.filter((opt) => opt.value !== "")
                .map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
      );
    case "color":
      return (
        <label
          key={fieldKey}
          htmlFor={`config-${fieldKey}`}
          className="flex items-center gap-2"
        >
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            id={`config-${fieldKey}`}
            type="color"
            value={typeof value === "string" ? value : String(field.default)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="w-8 h-6 rounded border border-border cursor-pointer bg-transparent"
          />
        </label>
      );
    default:
      return (
        <label
          key={fieldKey}
          htmlFor={`config-${fieldKey}`}
          className="flex flex-col gap-0.5"
        >
          <span className="text-[11px] text-muted">{field.label}</span>
          <Input
            id={`config-${fieldKey}`}
            type="text"
            value={
              typeof value === "string" ? value : String(field.default ?? "")
            }
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className={FIELD_INPUT_CLASSNAME}
          />
        </label>
      );
  }
}

// ---------------------------------------------------------------------------
// Widget row
// ---------------------------------------------------------------------------

function WidgetRow({
  instance,
  onToggle,
  onUpdate,
}: {
  instance: WidgetInstance;
  onToggle: () => void;
  onUpdate: (patch: Partial<Pick<WidgetInstance, "config">>) => void;
}) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const def = getAllWidgets().find((d) => d.type === instance.type);
  const hasConfig = def && Object.keys(def.configSchema).length > 0;

  return (
    <div className={`${SURFACE_CARD_CLASSNAME} overflow-hidden`}>
      <div className="flex items-center gap-2 border-b border-border/40 bg-bg-hover/55 px-3 py-2.5">
        {/* Toggle */}
        <Switch
          checked={instance.enabled}
          onCheckedChange={onToggle}
          title={
            instance.enabled
              ? t("streamsettings.DisableWidget")
              : t("streamsettings.EnableWidget")
          }
        />

        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-txt break-words">
            {def?.name ?? instance.type}
          </div>
          {def?.description && (
            <div className="mt-0.5 text-[10px] leading-4 text-muted break-words">
              {def.description}
            </div>
          )}
        </div>

        {hasConfig && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((x) => !x)}
            className="h-9 rounded-xl border border-border/45 bg-card/92 px-2.5 text-[10px] font-medium text-muted-strong hover:border-border-strong hover:bg-bg-hover hover:text-txt"
          >
            {expanded
              ? t("streamsettings.ConfigExpanded")
              : t("streamsettings.ConfigCollapsed")}
          </Button>
        )}
      </div>

      {expanded && hasConfig && def && (
        <div className="flex flex-col gap-2 border-t border-border/40 bg-bg/35 px-3 py-3">
          {Object.entries(def.configSchema).map(([key, field]) => (
            <ConfigField
              key={key}
              fieldKey={key}
              field={field}
              value={instance.config[key] ?? field.default}
              onChange={(k, v) =>
                onUpdate({ config: { ...instance.config, [k]: v } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function StreamSettings({
  destinations,
  activeDestination,
  onDestinationChange,
  streamLive,
  streamSource,
  activeGameViewerUrl,
  onSourceChange,
  overlayLayout,
  onClose,
}: StreamSettingsProps) {
  const { t } = useApp();
  const [section, setSection] = useState<Section>("channel");
  const [customUrlInput, setCustomUrlInput] = useState(
    streamSource.type === "custom-url" ? (streamSource.url ?? "") : "",
  );
  const trimmedCustomUrl = customUrlInput.trim();
  const customUrlValid = isSupportedStreamUrl(trimmedCustomUrl);

  const { layout, toggleWidget, updateWidget, resetLayout } = overlayLayout;

  const navBtn = (id: Section, label: string) => (
    <Button
      variant={section === id ? "default" : "ghost"}
      size="sm"
      onClick={() => setSection(id)}
      className={`min-h-10 rounded-xl border px-3.5 py-2 text-[12px] font-medium transition-[border-color,background-color,color,box-shadow] ${
        section === id
          ? "border-accent/45 bg-accent/12 text-txt-strong shadow-sm"
          : "border-border/45 bg-card/82 text-muted-strong hover:border-border-strong hover:bg-bg-hover hover:text-txt"
      }`}
    >
      {label}
    </Button>
  );

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 backdrop-blur-md sm:items-center sm:p-5">
      <div
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/98 shadow-2xl"
        style={{ maxHeight: "min(88vh, 44rem)" }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
          <span className="text-[13px] font-semibold text-txt">
            {t("streamsettings.StreamSettings")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-border/40 bg-card/85 p-0 text-lg leading-none text-muted-strong hover:border-border-strong hover:bg-bg-hover hover:text-txt"
          >
            ×
          </Button>
        </div>

        {/* Nav */}
        <div className="flex flex-shrink-0 flex-wrap gap-2 border-b border-border/50 px-4 py-3">
          {navBtn("channel", t("streamsettings.NavChannel"))}
          {navBtn("overlays", t("streamsettings.NavOverlays"))}
          {navBtn("source", t("trajectoriesview.Source"))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* ── Channel / destination ─────────────────────────────── */}
          {section === "channel" && (
            <div className="flex flex-col gap-3">
              <p className={SECTION_HINT_CLASSNAME}>
                {t("streamsettings.SelectWhereToBroa")}
              </p>

              {destinations.length === 0 ? (
                <div
                  className={`${SURFACE_CARD_CLASSNAME} p-5 text-center text-[12px] leading-5 text-muted`}
                >
                  {t("streamsettings.NoStreamingDestina")}
                  <br />

                  {t("streamsettings.InstallAStreaming")}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {destinations.map((d) => {
                    const active = d.id === activeDestination?.id;
                    return (
                      <Button
                        key={d.id}
                        disabled={streamLive}
                        variant="outline"
                        title={
                          streamLive
                            ? t("streamsettings.StopStreamToChangeChannel")
                            : undefined
                        }
                        onClick={() => onDestinationChange(d.id)}
                        className={`${OPTION_CARD_CLASSNAME} disabled:opacity-50 ${
                          active
                            ? ACTIVE_OPTION_CARD_CLASSNAME
                            : "hover:border-border-strong hover:bg-bg-hover"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            active
                              ? "bg-accent shadow-[0_0_6px_theme(colors.accent.DEFAULT)]"
                              : "bg-muted/30"
                          }`}
                        />
                        <span className="min-w-0 break-words text-[13px] font-medium text-txt">
                          {d.name}
                        </span>
                        {active && (
                          <span className="ml-auto text-[10px] text-txt font-semibold uppercase tracking-wide">
                            {t("appsview.Active")}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}

              {streamLive && (
                <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-5 text-warn">
                  {t("streamsettings.StreamIsLiveSt")}
                </p>
              )}
            </div>
          )}

          {/* ── Overlay widgets ────────────────────────────────────── */}
          {section === "overlays" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className={SECTION_HINT_CLASSNAME}>
                  {t("streamsettings.ToggleAndConfigure")}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={resetLayout}
                  className="h-auto p-0 text-[11px] text-muted hover:text-danger"
                >
                  {t("streamsettings.ResetDefaults")}
                </Button>
              </div>

              {layout.widgets.length === 0 ? (
                <div
                  className={`${SURFACE_CARD_CLASSNAME} p-5 text-center text-[12px] leading-5 text-muted`}
                >
                  {t("streamsettings.NoWidgetsAvailable")}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {layout.widgets.map((instance) => (
                    <WidgetRow
                      key={instance.id}
                      instance={instance}
                      onToggle={() => toggleWidget(instance.id)}
                      onUpdate={(patch) => updateWidget(instance.id, patch)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Stream source ──────────────────────────────────────── */}
          {section === "source" && (
            <div className="flex flex-col gap-3">
              <p className={SECTION_HINT_CLASSNAME}>
                {t("streamsettings.ChooseWhatContent")}
              </p>

              {(["stream-tab", "game", "custom-url"] as StreamSourceType[]).map(
                (st) => {
                  const isGame = st === "game";
                  const disabled = isGame && !activeGameViewerUrl.trim();
                  const active = streamSource.type === st;

                  return (
                    <div key={st}>
                      <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() => {
                          if (st !== "custom-url") {
                            onSourceChange(
                              st,
                              isGame ? activeGameViewerUrl : undefined,
                            );
                          }
                        }}
                        className={`${OPTION_CARD_CLASSNAME} ${
                          active && st !== "custom-url"
                            ? ACTIVE_OPTION_CARD_CLASSNAME
                            : "hover:border-border-strong hover:bg-bg-hover"
                        }`}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            active && st !== "custom-url"
                              ? "bg-accent"
                              : "bg-muted/30"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-txt">
                            {STREAM_SOURCE_LABELS[st]}
                          </div>
                          <div className="mt-1.5 break-words text-[10px] leading-4 text-muted">
                            {st === "stream-tab" &&
                              t("streamsettings.CaptureStreamBrowserTab")}
                            {st === "game" &&
                              (activeGameViewerUrl.trim()
                                ? `${t("streamsettings.ActiveGame")} ${activeGameViewerUrl}`
                                : t("streamsettings.NoGameActive"))}
                            {st === "custom-url" &&
                              t("streamsettings.BroadcastFromCustomUrl")}
                          </div>
                        </div>
                      </Button>

                      {st === "custom-url" && (
                        <div
                          className={`mt-1 flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors ${
                            active
                              ? "border-accent/45 bg-accent/10"
                              : "border-border/55 bg-card/88"
                          }`}
                        >
                          <Input
                            placeholder={t("streamsettings.httpsYourUrlCom")}
                            value={customUrlInput}
                            onChange={(e) => setCustomUrlInput(e.target.value)}
                            aria-invalid={
                              trimmedCustomUrl ? !customUrlValid : undefined
                            }
                            className="h-9 flex-1 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted/40"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customUrlValid) {
                                onSourceChange("custom-url", trimmedCustomUrl);
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!customUrlValid}
                            onClick={() => {
                              if (customUrlValid) {
                                onSourceChange("custom-url", trimmedCustomUrl);
                              }
                            }}
                            className="h-9 rounded-xl border border-accent/35 bg-accent/12 px-2.5 text-[11px] font-semibold text-accent-fg hover:border-accent/55 hover:bg-accent/18"
                          >
                            {t("streamsettings.Use")}
                          </Button>
                        </div>
                      )}
                      {st === "custom-url" &&
                        trimmedCustomUrl &&
                        !customUrlValid && (
                          <p className="mt-1 px-1 text-[10px] text-danger">
                            {t("streamsettings.CustomURLsMustSta")}
                          </p>
                        )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
