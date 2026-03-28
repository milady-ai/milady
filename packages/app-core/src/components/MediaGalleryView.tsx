/**
 * Media Gallery — browse photos, videos, and audio stored in agent databases.
 *
 * Queries known tables for records containing media URLs (image/video/audio
 * file extensions or data URIs). All data flows through the generic database
 * APIs (getDatabaseTables, executeDatabaseQuery).
 */

import { Button, Input } from "@miladyai/ui";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type QueryResult } from "../api";
import { useApp } from "../state";
import { resolveAppAssetUrl } from "../utils";
import {
  DESKTOP_INSET_PANEL_CLASSNAME,
  DesktopRailSummaryCard,
} from "./desktop-surface-primitives";
import {
  APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME,
  APP_DESKTOP_SPLIT_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_SCROLL_REGION_CLASSNAME,
  APP_SIDEBAR_SEARCH_INPUT_CLASSNAME,
} from "./sidebar-shell-styles";

type MediaType = "all" | "image" | "video" | "audio";

interface MediaItem {
  url: string;
  type: "image" | "video" | "audio";
  filename: string;
  source: string;
  createdAt: string;
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?|$)/i;
const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i;
const AUDIO_EXTS = /\.(mp3|wav|ogg|flac|aac|m4a|opus)(\?|$)/i;
const DATA_URI_IMG = /^data:image\//i;
const DATA_URI_VID = /^data:video\//i;
const DATA_URI_AUD = /^data:audio\//i;
const MEDIA_URL_PREFIX =
  /^(https?:|data:|blob:|file:|capacitor:|electrobun:|app:|\/|\.\/|\.\.\/)/i;

function classifyUrl(url: string): "image" | "video" | "audio" | null {
  if (IMAGE_EXTS.test(url) || DATA_URI_IMG.test(url)) return "image";
  if (VIDEO_EXTS.test(url) || DATA_URI_VID.test(url)) return "video";
  if (AUDIO_EXTS.test(url) || DATA_URI_AUD.test(url)) return "audio";
  return null;
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://placeholder").pathname;
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "media";
  } catch {
    return "media";
  }
}

function looksLikePotentialMediaUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (classifyUrl(candidate)) return true;
  return MEDIA_URL_PREFIX.test(candidate);
}

function normalizeMediaUrl(url: string): string {
  const candidate = url.trim();
  if (!candidate) return candidate;
  return MEDIA_URL_PREFIX.test(candidate)
    ? resolveAppAssetUrl(candidate)
    : candidate;
}

const FILTER_CHIPS: { id: MediaType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

/** Extract media URLs from arbitrary row data by scanning all string values. */
function extractMediaFromRows(
  rows: Record<string, unknown>[],
  tableName: string,
): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const createdAt = String(
      row.createdAt ?? row.created_at ?? row.timestamp ?? "",
    );
    for (const val of Object.values(row)) {
      if (typeof val !== "string") continue;

      // Try parsing as JSON content field (elizaOS memories store JSON in content)
      const urls = extractUrlsFromValue(val);
      for (const url of urls) {
        const mediaType = classifyUrl(url);
        if (mediaType && !seen.has(url)) {
          seen.add(url);
          items.push({
            url,
            type: mediaType,
            filename: filenameFromUrl(url),
            source: tableName,
            createdAt,
          });
        }
      }
    }
  }
  return items;
}

/** Pull URLs out of a string value — handles plain URLs and JSON blobs. */
function extractUrlsFromValue(val: string): string[] {
  const urls = new Set<string>();

  // If it looks like JSON, parse it and search recursively
  if (val.startsWith("{") || val.startsWith("[")) {
    try {
      const parsed = JSON.parse(val);
      collectStrings(parsed, urls);
      return Array.from(urls);
    } catch {
      // not JSON, fall through to regex
    }
  }

  // Absolute URL/scheme match
  const urlRegex =
    /(?:https?:\/\/|file:\/\/|blob:|capacitor:\/\/|electrobun:\/\/|app:\/\/)[^\s"'<>]+/gi;
  const matches = val.match(urlRegex);
  if (matches) {
    for (const match of matches) urls.add(match);
  }

  // Relative/path-like token match
  const tokens = val
    .split(/[\s"'<>]+/)
    .map((token) => token.replace(/^[([{]+/, "").replace(/[)\]},;.!?]+$/, ""));
  for (const token of tokens) {
    if (looksLikePotentialMediaUrl(token)) urls.add(token);
  }

  // Data URI match
  if (val.startsWith("data:")) urls.add(val);

  return Array.from(urls);
}

function collectStrings(obj: unknown, out: Set<string>) {
  if (typeof obj === "string") {
    if (looksLikePotentialMediaUrl(obj)) out.add(obj.trim());
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, out);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
}

export function MediaGalleryView({ leftNav }: { leftNav?: ReactNode }) {
  const { t } = useApp();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MediaType>("all");
  const [search, setSearch] = useState("");
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Discover tables
      const { tables } = await client.getDatabaseTables();
      const allMedia: MediaItem[] = [];

      // Scan tables likely to contain media: memories, messages, media, attachments, files
      const mediaTableNames = tables
        .map((t) => t.name)
        .filter((name) => {
          const n = name.toLowerCase();
          return (
            n.includes("memor") ||
            n.includes("message") ||
            n.includes("media") ||
            n.includes("attach") ||
            n.includes("file") ||
            n.includes("asset") ||
            n.includes("document")
          );
        });

      // If no likely tables found, scan all tables with modest limits
      const tablesToScan =
        mediaTableNames.length > 0
          ? mediaTableNames
          : tables.map((t) => t.name);
      const scanLimit = mediaTableNames.length > 0 ? 500 : 100;

      for (const tableName of tablesToScan.slice(0, 10)) {
        try {
          const result: QueryResult = await client.executeDatabaseQuery(
            `SELECT * FROM "${tableName}" LIMIT ${scanLimit}`,
          );
          const items = extractMediaFromRows(result.rows, tableName);
          allMedia.push(...items);
        } catch {
          // skip tables that fail
        }
      }

      // Sort by date descending
      allMedia.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });

      setMedia(allMedia);
    } catch (err) {
      setError(
        `Failed to load media: ${err instanceof Error ? err.message : "error"}`,
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const filtered = useMemo(
    () =>
      media.filter((m) => {
        if (filter !== "all" && m.type !== filter) return false;
        if (
          search &&
          !m.filename.toLowerCase().includes(search.toLowerCase()) &&
          !m.url.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [filter, media, search],
  );

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedMediaUrl(null);
      return;
    }
    if (
      !selectedMediaUrl ||
      !filtered.some((item) => item.url === selectedMediaUrl)
    ) {
      setSelectedMediaUrl(filtered[0].url);
    }
  }, [filtered, selectedMediaUrl]);

  const selectedItem =
    filtered.find((item) => item.url === selectedMediaUrl) ??
    filtered[0] ??
    null;

  return (
    <div className={APP_DESKTOP_SPLIT_SHELL_CLASSNAME}>
      <aside className={APP_DESKTOP_SIDEBAR_RAIL_STANDARD_CLASSNAME}>
        <div className={APP_SIDEBAR_INNER_CLASSNAME}>
          <div className="space-y-3 pt-4">
            {leftNav}
            <DesktopRailSummaryCard>
              <div className="text-sm font-semibold text-txt">
                {filtered.length} {t("mediagalleryview.item")}
                {filtered.length !== 1 ? "s" : ""}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/75">
                <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                  {filter === "all" ? "All media" : filter}
                </span>
                {search ? (
                  <span className="rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-accent">
                    Search active
                  </span>
                ) : null}
              </div>
            </DesktopRailSummaryCard>
          </div>

          <div className="space-y-3 pt-4">
            <Input
              type="search"
              placeholder={t("mediagalleryview.SearchMedia")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={APP_SIDEBAR_SEARCH_INPUT_CLASSNAME}
            />

            <div className="grid grid-cols-2 gap-1.5">
              {FILTER_CHIPS.map((chip) => {
                const isActive = filter === chip.id;
                return (
                  <Button
                    key={chip.id}
                    variant="ghost"
                    size="sm"
                    className={`h-auto min-h-[2.25rem] rounded-xl border px-3 py-2 text-left text-[11px] font-semibold transition-colors ${
                      isActive
                        ? "border-accent/35 bg-accent/14 text-txt-strong"
                        : "border-border/45 bg-bg/35 text-muted hover:border-border/60 hover:bg-bg-hover hover:text-txt"
                    }`}
                    onClick={() => setFilter(chip.id)}
                  >
                    {chip.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div
            className={`mt-3 space-y-1.5 ${APP_SIDEBAR_SCROLL_REGION_CLASSNAME}`}
          >
            {loading ? (
              <div className="rounded-xl border border-border/35 bg-bg/35 px-3 py-4 text-center text-xs text-muted">
                {t("mediagalleryview.ScanningForMedia")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-border/35 bg-bg/35 px-3 py-4 text-center text-xs text-muted">
                {t("mediagalleryview.NoMediaFound")}
              </div>
            ) : (
              filtered.map((item, index) => {
                const isActive = selectedItem?.url === item.url;
                return (
                  <Button
                    variant="ghost"
                    type="button"
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable url plus index tiebreaker
                    key={`${item.url}-${index}`}
                    className={`${APP_SIDEBAR_CARD_BASE_CLASSNAME} ${
                      isActive
                        ? APP_SIDEBAR_CARD_ACTIVE_CLASSNAME
                        : APP_SIDEBAR_CARD_INACTIVE_CLASSNAME
                    }`}
                    onClick={() => setSelectedMediaUrl(item.url)}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[11px] font-bold uppercase ${
                        isActive
                          ? "border-accent/30 bg-accent/18 text-txt-strong"
                          : "border-border/50 bg-bg-accent/80 text-muted"
                      }`}
                    >
                      {item.type.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold leading-snug text-inherit">
                        {item.filename}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted/85">
                        <span className="truncate">{item.source}</span>
                        <span className="rounded-full border border-border/45 px-2 py-0.5 uppercase tracking-[0.16em]">
                          {item.type}
                        </span>
                      </div>
                    </div>
                  </Button>
                );
              })
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col bg-bg/20">
        {error ? (
          <div className="m-5 rounded-2xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center px-6 py-12 text-sm italic text-muted">
            {t("mediagalleryview.ScanningForMedia")}
          </div>
        ) : !selectedItem ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="rounded-3xl border border-border/35 bg-bg/35 px-8 py-10 text-center shadow-inner">
              <div className="text-base font-semibold text-txt">
                {t("mediagalleryview.NoMediaFound")}
              </div>
              <div className="mt-2 max-w-sm text-sm text-muted">
                {media.length === 0
                  ? "No images, videos, or audio files were detected in the database."
                  : "No items match the current filter."}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border/40 px-6 py-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                Media
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-txt">
                  {selectedItem.filename}
                </h2>
                <span className="rounded-full border border-accent/30 bg-accent/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-fg">
                  {selectedItem.type}
                </span>
              </div>
              <div className="mt-2 text-sm text-muted">
                Source: {selectedItem.source}
                {selectedItem.createdAt ? ` · ${selectedItem.createdAt}` : ""}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
              <div
                className={`flex min-h-[22rem] flex-1 items-center justify-center p-6 ${DESKTOP_INSET_PANEL_CLASSNAME}`}
              >
                {selectedItem.type === "image" ? (
                  <img
                    src={normalizeMediaUrl(selectedItem.url)}
                    alt={selectedItem.filename}
                    className="max-h-[32rem] max-w-full rounded-2xl object-contain"
                  />
                ) : selectedItem.type === "video" ? (
                  <video
                    src={normalizeMediaUrl(selectedItem.url)}
                    controls
                    className="max-h-[32rem] max-w-full rounded-2xl"
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <div className="flex w-full max-w-xl flex-col items-center gap-5 rounded-3xl border border-border/35 bg-bg/35 px-8 py-10 text-center">
                    <div className="text-lg font-semibold text-txt">
                      Audio Preview
                    </div>
                    <audio
                      src={normalizeMediaUrl(selectedItem.url)}
                      controls
                      className="w-full"
                    >
                      <track kind="captions" />
                    </audio>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-border/40 bg-card/45 px-5 py-4 text-sm text-muted">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                  Media Details
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted/60">
                      Type
                    </div>
                    <div className="mt-1 text-sm text-txt">
                      {selectedItem.type}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted/60">
                      Source
                    </div>
                    <div className="mt-1 text-sm text-txt">
                      {selectedItem.source}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted/60">
                      URL
                    </div>
                    <div className="mt-1 break-all text-sm text-txt">
                      {selectedItem.url}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
