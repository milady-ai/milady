/**
 * Knowledge management view — upload, search, and manage knowledge documents.
 *
 * Features:
 * - Stats display (document count, fragment count)
 * - Document upload (file picker + drag-and-drop)
 * - URL upload (with YouTube auto-transcription)
 * - Search across knowledge base
 * - Document list with delete functionality
 * - Document detail view with fragments
 */

import type {
  KnowledgeDocument,
  KnowledgeFragment,
  KnowledgeSearchResult,
} from "@miladyai/app-core/api";
import { client } from "@miladyai/app-core/api";
import {
  ConfirmDeleteControl,
  formatByteSize,
  formatShortDate,
} from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DESKTOP_INSET_EMPTY_PANEL_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_SURFACE_PANEL_CLASSNAME,
  DesktopEmptyStatePanel,
  DesktopInsetEmptyStatePanel,
  DesktopPageFrame,
} from "./desktop-surface-primitives";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
} from "./sidebar-shell-styles";

const KNOWLEDGE_SHELL_CLASS = APP_PANEL_SHELL_CLASSNAME;
const KNOWLEDGE_SIDEBAR_CLASS = `lg:w-[22rem] lg:max-w-[360px] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const KNOWLEDGE_PANEL_CLASS = DESKTOP_SURFACE_PANEL_CLASSNAME;
const KNOWLEDGE_INSET_PANEL_CLASS = DESKTOP_INSET_PANEL_CLASSNAME;
const KNOWLEDGE_SIDEBAR_ITEM_BASE_CLASS = APP_SIDEBAR_CARD_BASE_CLASSNAME;
const KNOWLEDGE_SIDEBAR_ITEM_ACTIVE_CLASS = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const KNOWLEDGE_SIDEBAR_ITEM_INACTIVE_CLASS =
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;

export type KnowledgeUploadFile = File & {
  webkitRelativePath?: string;
};

export function getKnowledgeUploadFilename(file: KnowledgeUploadFile): string {
  return file.webkitRelativePath?.trim() || file.name;
}

export function shouldReadKnowledgeFileAsText(
  file: Pick<File, "type" | "name">,
): boolean {
  const textTypes = [
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
  ];

  return (
    textTypes.some((t) => file.type.includes(t)) ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".mdx")
  );
}

function getKnowledgeTypeLabel(contentType?: string): string {
  return contentType?.split("/").pop()?.toUpperCase() || "DOC";
}

function getKnowledgeSourceLabel(
  source: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (source === "youtube") {
    return t("knowledgeview.YouTube", { defaultValue: "YouTube" });
  }
  if (source === "url") {
    return t("knowledgeview.FromUrl", { defaultValue: "From URL" });
  }
  return t("knowledgeview.Upload", { defaultValue: "Upload" });
}

/* ── Search Result Item ─────────────────────────────────────────────── */

function SearchResultListItem({
  result,
  active,
  onSelect,
}: {
  result: KnowledgeSearchResult;
  active: boolean;
  onSelect: (documentId: string) => void;
}) {
  const { t } = useApp();

  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      onClick={() => onSelect(result.documentId || result.id)}
      aria-current={active ? "page" : undefined}
      className={`${KNOWLEDGE_SIDEBAR_ITEM_BASE_CLASS} h-auto w-full ${
        active
          ? KNOWLEDGE_SIDEBAR_ITEM_ACTIVE_CLASS
          : KNOWLEDGE_SIDEBAR_ITEM_INACTIVE_CLASS
      }`}
    >
      <span
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-semibold ${
          active
            ? "border-accent/30 bg-accent/18 text-txt-strong"
            : "border-border/50 bg-bg-accent/80 text-muted"
        }`}
      >
        {(result.similarity * 100).toFixed(0)}%
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-txt">
          {result.documentTitle ||
            t("knowledgeview.UnknownDocument", {
              defaultValue: "Unknown Document",
            })}
        </span>
        <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-muted/85">
          {result.text}
        </span>
        <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg/85">
          {(result.similarity * 100).toFixed(0)}% {t("knowledgeview.Match")}
        </span>
      </span>
    </Button>
  );
}

/* ── Document Card ──────────────────────────────────────────────────── */

function DocumentListItem({
  doc,
  active,
  onSelect,
  onDelete,
  deleting,
}: {
  doc: KnowledgeDocument;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const { t } = useApp();
  return (
    <button
      type="button"
      className={`${KNOWLEDGE_SIDEBAR_ITEM_BASE_CLASS} relative cursor-pointer ${
        active
          ? KNOWLEDGE_SIDEBAR_ITEM_ACTIVE_CLASS
          : KNOWLEDGE_SIDEBAR_ITEM_INACTIVE_CLASS
      }`}
      onClick={() => onSelect(doc.id)}
      aria-label={t("knowledgeview.OpenDocument", {
        defaultValue: "Open {{filename}}",
        filename: doc.filename,
      })}
      aria-current={active ? "page" : undefined}
    >
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold leading-snug text-txt">
          {doc.filename}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider ${
              active
                ? "border-accent/30 bg-accent/18 text-txt-strong"
                : "border-border/45 bg-bg/30 text-muted/80"
            }`}
          >
            {getKnowledgeTypeLabel(doc.contentType)}
          </span>
          <span className="inline-flex items-center rounded-md border border-border/45 bg-bg/30 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wider text-muted/80">
            {getKnowledgeSourceLabel(doc.source, t)}
          </span>
          <span className="text-[10px] text-muted/50 opacity-0 transition-opacity group-hover:opacity-100">
            {formatShortDate(doc.createdAt, { fallback: "—" })}
          </span>
        </span>
      </span>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: stopPropagation wrapper for nested interactive */}
      <span
        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <ConfirmDeleteControl
          triggerClassName="h-7 rounded-lg border border-transparent px-2 text-[10px] font-bold !bg-transparent text-danger/70 transition-all hover:!bg-danger/12 hover:border-danger/25 hover:text-danger"
          confirmClassName="h-7 rounded-lg border border-danger/25 bg-danger/14 px-2 text-[10px] font-bold text-danger transition-all hover:bg-danger/20"
          cancelClassName="h-7 rounded-lg border border-border/35 px-2 text-[10px] font-bold text-muted-strong transition-all hover:border-border-strong hover:text-txt"
          disabled={deleting}
          busyLabel="..."
          onConfirm={() => onDelete(doc.id)}
        />
      </span>
    </button>
  );
}

/* ── Document Viewer ────────────────────────────────────────────────── */

function DocumentViewer({ documentId }: { documentId: string | null }) {
  const { t } = useApp();
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = documentId ?? "";
    if (!id) {
      setDoc(null);
      setFragments([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [docRes, fragRes] = await Promise.all([
        client.getKnowledgeDocument(id),
        client.getKnowledgeFragments(id),
      ]);

      if (cancelled) return;

      setDoc(docRes.document);
      setFragments(fragRes.fragments);
      setLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setError(
          err instanceof Error
            ? err.message
            : t("knowledgeview.FailedToLoadDocument", {
                defaultValue: "Failed to load document",
              }),
        );
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentId, t]);

  const previewText = doc?.content?.text?.trim();

  return (
    <section
      className={`${KNOWLEDGE_PANEL_CLASS} min-h-[62vh] overflow-hidden`}
    >
      {doc && (
        <div className="flex flex-wrap items-center gap-2 px-5 pt-5 sm:px-6 lg:justify-end">
          <span className="rounded-full border border-border/45 bg-bg/25 px-3 py-1.5 text-[11px] font-semibold text-muted">
            {getKnowledgeTypeLabel(doc.contentType)}
          </span>
          <span className="rounded-full border border-accent/25 bg-accent/8 px-3 py-1.5 text-[11px] font-semibold text-txt-strong">
            {getKnowledgeSourceLabel(doc.source, t)}
          </span>
        </div>
      )}
      <div className="space-y-4 px-5 py-5 sm:px-6">
        {loading && (
          <div className="py-12 text-center font-bold tracking-wide text-muted animate-pulse">
            <span className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent align-middle" />
            {t("databaseview.Loading")}
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-lg rounded-[18px] border border-danger/25 bg-danger/10 py-10 text-center font-medium text-danger">
            {error}
          </div>
        )}

        {!loading && !error && !doc && (
          <DesktopInsetEmptyStatePanel
            className="px-6 py-16"
            description={t("knowledgeview.NoDocumentSelectedDesc", {
              defaultValue:
                "Upload a file or choose an item from the sidebar to start viewing fragments and metadata.",
            })}
            title={t("knowledgeview.NoDocumentSelected", {
              defaultValue: "No document selected",
            })}
          />
        )}

        {!loading && !error && doc && (
          <>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
              <div className={`${KNOWLEDGE_INSET_PANEL_CLASS} p-5`}>
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/25 pb-3">
                  <div className="text-sm font-semibold text-txt">
                    {t("knowledgeview.Preview", { defaultValue: "Preview" })}
                  </div>
                  <span className="rounded-full border border-border/35 bg-bg/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">
                    {formatByteSize(doc.fileSize)}
                  </span>
                </div>
                {previewText ? (
                  <pre className="max-h-[12rem] overflow-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-txt/88 custom-scrollbar">
                    {previewText.slice(0, 1200)}
                  </pre>
                ) : (
                  <DesktopInsetEmptyStatePanel
                    className="min-h-[10rem] px-4 py-10 text-sm"
                    description={t("knowledgeview.NoPreviewDesc", {
                      defaultValue:
                        "Indexed fragments are still available below for this document type.",
                    })}
                    title={t("knowledgeview.NoPreview", {
                      defaultValue: "Full text preview is not available",
                    })}
                  />
                )}
              </div>

              <div className={`${KNOWLEDGE_INSET_PANEL_CLASS} p-5`}>
                <div className="text-sm font-semibold text-txt">
                  {t("knowledgeview.Details", { defaultValue: "Details" })}
                </div>
                <div className="mt-4 grid gap-3 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {t("knowledgeview.Type")}
                    </span>
                    <span className="inline-block w-fit rounded-md border border-border/25 bg-bg-hover px-2 py-1 font-medium text-txt">
                      {doc.contentType}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {t("knowledgeview.Source")}
                    </span>
                    <span className="inline-block w-fit rounded-md border border-border/25 bg-bg-hover px-2 py-1 font-medium text-txt">
                      {doc.source}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {t("knowledgeview.Uploaded", {
                        defaultValue: "Uploaded",
                      })}
                    </span>
                    <span className="inline-block w-fit rounded-md border border-border/25 bg-bg-hover px-2 py-1 font-medium text-txt">
                      {formatShortDate(doc.createdAt, { fallback: "—" })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      {t("knowledgeview.FragmentsLabel", {
                        defaultValue: "Fragments",
                      })}
                    </span>
                    <span className="inline-block w-fit rounded-md border border-border/25 bg-bg-hover px-2 py-1 font-medium text-txt">
                      {fragments.length}
                    </span>
                  </div>
                  {doc.url && (
                    <div className="mt-1 flex flex-col gap-1.5 border-t border-border/20 pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                        {t("appsview.URL")}
                      </span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm font-medium text-txt underline decoration-accent/30 underline-offset-4 transition-colors hover:text-txt/80"
                      >
                        {doc.url}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`${KNOWLEDGE_INSET_PANEL_CLASS} p-5`}>
              <div className="mb-4 flex items-center justify-between border-b border-border/30 pb-3">
                <h3 className="text-sm font-bold tracking-wide text-txt">
                  {t("knowledgeview.Fragments1")}
                  <span className="ml-2 rounded-full border border-border/30 bg-bg-hover px-2 py-0.5 font-mono text-xs text-muted-strong">
                    {fragments.length}
                  </span>
                </h3>
              </div>
              <div className="space-y-4">
                {fragments.map((fragment, index) => (
                  <div
                    key={fragment.id}
                    className="rounded-xl border border-border/30 bg-card/86 p-4 shadow-sm transition-colors hover:border-accent/30"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
                        {t("knowledgeview.Fragment")} {index + 1}
                      </span>
                      {fragment.position !== undefined && (
                        <span className="rounded-md border border-border/25 bg-bg-hover px-2 py-0.5 font-mono text-[10px] text-muted-strong">
                          {t("knowledgeview.Position")} {fragment.position}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-txt/90 line-clamp-6">
                      {fragment.text}
                    </p>
                  </div>
                ))}
                {fragments.length === 0 && (
                  <DesktopInsetEmptyStatePanel
                    className="min-h-[10rem] py-12"
                    title={t("knowledgeview.NoFragmentsFound")}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Main KnowledgeView Component ───────────────────────────────────── */

export function KnowledgeView({ inModal }: { inModal?: boolean } = {}) {
  const { t } = useApp();
  const { setActionNotice } = useApp();
  const setActionNoticeRef = useRef(setActionNotice);
  setActionNoticeRef.current = setActionNotice;
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchResults, setSearchResults] = useState<
    KnowledgeSearchResult[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isServiceLoading, setIsServiceLoading] = useState(false);
  const serviceRetryRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const docsRes = await client.listKnowledgeDocuments({ limit: 100 });
      setDocuments(docsRes.documents);
      setIsServiceLoading(false);
      serviceRetryRef.current = 0;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 503) {
        setIsServiceLoading(true);
      } else {
        setIsServiceLoading(false);
        const msg =
          err instanceof Error
            ? err.message
            : t("knowledgeview.FailedToLoadKnowledgeData", {
                defaultValue: "Failed to load knowledge data",
              });
        setLoadError(msg);
        setActionNoticeRef.current(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("[KnowledgeView] Failed to load data:", err);
      setLoading(false);
    });
  }, [loadData]);
  useEffect(() => {
    if (!isServiceLoading) {
      serviceRetryRef.current = 0;
      return;
    }
    const attempt = serviceRetryRef.current;
    if (attempt >= 5) {
      setIsServiceLoading(false);
      setLoadError(
        t("knowledgeview.ServiceDidNotBecomeAvailable", {
          defaultValue:
            "Knowledge service did not become available. Please reload the page.",
        }),
      );
      return;
    }
    const delayMs = 2000 * 1.5 ** attempt; // 2s, 3s, 4.5s, 6.75s, ~10s
    const timer = setTimeout(() => {
      serviceRetryRef.current = attempt + 1;
      loadData();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [isServiceLoading, loadData, t]);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearching(true);
      try {
        const result = await client.searchKnowledge(query, {
          threshold: 0.3,
          limit: 20,
        });
        setSearchResults(result.results);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("knowledgeview.UnknownSearchError", {
                defaultValue: "Unknown search error",
              });
        setActionNotice(
          t("knowledgeview.SearchFailed", {
            defaultValue: "Search failed: {{message}}",
            message,
          }),
          "error",
          4000,
        );
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [setActionNotice, t],
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeleting(documentId);

      try {
        const result = await client.deleteKnowledgeDocument(documentId);

        if (result.ok) {
          setActionNotice(
            t("knowledgeview.DeletedDocument", {
              defaultValue: "Deleted document ({{count}} fragments removed)",
              count: result.deletedFragments,
            }),
            "success",
            3000,
          );
          await loadData();
        } else {
          setActionNotice(
            t("knowledgeview.FailedToDeleteDocument", {
              defaultValue: "Failed to delete document",
            }),
            "error",
            4000,
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("knowledgeview.UnknownDeleteError", {
                defaultValue: "Unknown delete error",
              });
        setActionNotice(
          t("knowledgeview.FailedToDeleteDocumentWithMessage", {
            defaultValue: "Failed to delete document: {{message}}",
            message,
          }),
          "error",
          5000,
        );
      } finally {
        setDeleting(null);
      }
    },
    [loadData, setActionNotice, t],
  );

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      const query = searchQuery.trim();
      if (!query) return;
      void handleSearch(query);
    },
    [handleSearch, searchQuery],
  );

  const isShowingSearchResults = searchResults !== null;
  const visibleSearchResults = searchResults ?? [];

  // Local filename filter — filters document list as user types (before submitting semantic search)
  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || isShowingSearchResults) return documents;
    return documents.filter(
      (doc) =>
        doc.filename.toLowerCase().includes(q) ||
        doc.contentType?.toLowerCase().includes(q),
    );
  }, [documents, searchQuery, isShowingSearchResults]);

  useEffect(() => {
    if (documents.length === 0) {
      if (selectedDocId !== null) {
        setSelectedDocId(null);
      }
      return;
    }

    const hasSelectedDocument = documents.some(
      (doc) => doc.id === selectedDocId,
    );
    if (!hasSelectedDocument) {
      setSelectedDocId(documents[0]?.id ?? null);
    }
  }, [documents, selectedDocId]);

  return (
    <DesktopPageFrame className={inModal ? "p-0 lg:p-0" : undefined}>
      <div className={KNOWLEDGE_SHELL_CLASS}>
        <aside className={KNOWLEDGE_SIDEBAR_CLASS}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className="mt-4 border-b border-border/25 pb-4">
              <form
                className="mt-3 w-full max-w-[500px] flex-[1_1_500px]"
                onSubmit={handleSearchSubmit}
              >
                <div className="flex items-stretch gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      placeholder={t("knowledge.ui.searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        // Clear semantic results when user edits the query — fall back to local filter
                        if (isShowingSearchResults) setSearchResults(null);
                      }}
                      disabled={searching}
                      className="h-10 border-border/55 bg-bg/82 pr-8 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted/60 transition-colors hover:text-txt"
                        onClick={() => {
                          setSearchQuery("");
                          setSearchResults(null);
                        }}
                        aria-label={t("common.clear", {
                          defaultValue: "Clear",
                        })}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <title>Clear</title>
                          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    className="h-10 px-4 text-txt shadow-sm"
                    disabled={!searchQuery.trim() || searching}
                  >
                    {searching
                      ? t("knowledge.ui.searching")
                      : t("knowledge.ui.search")}
                  </Button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
                {isShowingSearchResults && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg border border-border/35 px-3 text-[11px] font-semibold text-muted hover:border-border/60 hover:bg-bg/35 hover:text-txt"
                    onClick={() => {
                      setSearchResults(null);
                      setSearchQuery("");
                    }}
                  >
                    {t("knowledgeview.ClearSearch", {
                      defaultValue: "Clear search",
                    })}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-3">
              {loading && !isShowingSearchResults && documents.length === 0 && (
                <div
                  className={`${DESKTOP_INSET_EMPTY_PANEL_CLASSNAME} px-4 py-10 text-center text-sm font-medium text-muted`}
                >
                  {t("knowledgeview.LoadingDocuments")}
                </div>
              )}

              {!loading &&
                !isShowingSearchResults &&
                documents.length === 0 && (
                  <DesktopEmptyStatePanel
                    className="min-h-[12rem] px-4 py-8"
                    description={t("knowledgeview.UploadFilesOrImpo")}
                    title={t("knowledgeview.NoDocumentsYet")}
                  />
                )}

              {!loading &&
                !isShowingSearchResults &&
                documents.length > 0 &&
                filteredDocuments.length === 0 && (
                  <DesktopEmptyStatePanel
                    className="min-h-[12rem] px-4 py-8"
                    description={t("knowledgeview.SearchTips", {
                      defaultValue:
                        "Try a filename, topic, or phrase from the document body.",
                    })}
                    title={t("knowledgeview.NoMatchingDocuments", {
                      defaultValue: "No matching documents",
                    })}
                  />
                )}

              {isShowingSearchResults && visibleSearchResults.length === 0 && (
                <DesktopEmptyStatePanel
                  className="min-h-[12rem] px-4 py-8"
                  description={t("knowledgeview.SearchTips", {
                    defaultValue:
                      "Try a filename, topic, or phrase from the document body.",
                  })}
                  title={t("knowledgeview.NoResultsFound")}
                />
              )}

              {isShowingSearchResults
                ? visibleSearchResults.map((result) => (
                    <SearchResultListItem
                      key={result.id}
                      result={result}
                      active={
                        selectedDocId === (result.documentId || result.id)
                      }
                      onSelect={setSelectedDocId}
                    />
                  ))
                : filteredDocuments.map((doc) => (
                    <DocumentListItem
                      key={doc.id}
                      doc={doc}
                      active={selectedDocId === doc.id}
                      onSelect={setSelectedDocId}
                      onDelete={handleDelete}
                      deleting={deleting === doc.id}
                    />
                  ))}
            </div>
          </div>
        </aside>

        <div className={DESKTOP_PAGE_CONTENT_CLASSNAME}>
          <div className="mx-auto max-w-[78rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {isServiceLoading && (
              <div
                className={`${KNOWLEDGE_INSET_PANEL_CLASS} mb-4 flex items-center gap-2 px-4 py-3 text-sm text-muted-strong`}
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                {t("knowledgeview.KnowledgeServiceIs")}
              </div>
            )}

            {loadError && !isServiceLoading && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger shadow-sm">
                <span>{loadError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-danger/30 px-3 text-xs text-danger hover:bg-danger/16"
                  onClick={() => loadData()}
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}

            <div className="mt-4">
              <DocumentViewer documentId={selectedDocId} />
            </div>
          </div>
        </div>
      </div>
    </DesktopPageFrame>
  );
}
