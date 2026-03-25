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
import { confirmDesktopAction } from "@miladyai/app-core/utils";
import { Button, Checkbox, Input } from "@miladyai/ui";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_HEADER_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
} from "./sidebar-shell-styles";
import {
  isKnowledgeImageFile,
  MAX_KNOWLEDGE_IMAGE_PROCESSING_BYTES,
  maybeCompressKnowledgeUploadImage,
} from "./knowledge-upload-image";

const MAX_UPLOAD_REQUEST_BYTES = 32 * 1_048_576; // Must match server knowledge route limit
const BULK_UPLOAD_TARGET_BYTES = 24 * 1_048_576;
const MAX_BULK_REQUEST_DOCUMENTS = 100;
const LARGE_FILE_WARNING_BYTES = 8 * 1_048_576;
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".mdx",
  ".pdf",
  ".docx",
  ".json",
  ".csv",
  ".xml",
  ".html",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

const KNOWLEDGE_SHELL_CLASS = APP_PANEL_SHELL_CLASSNAME;
const KNOWLEDGE_SIDEBAR_CLASS = `lg:w-[22rem] lg:max-w-[360px] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const KNOWLEDGE_KICKER_CLASS = APP_SIDEBAR_KICKER_CLASSNAME;
const KNOWLEDGE_SECTION_LABEL_CLASS =
  "px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60";
const KNOWLEDGE_PANEL_CLASS =
  "rounded-[28px] border border-border/35 bg-bg/20 shadow-sm ring-1 ring-border/10";
const KNOWLEDGE_SIDEBAR_ITEM_BASE_CLASS = APP_SIDEBAR_CARD_BASE_CLASSNAME;
const KNOWLEDGE_SIDEBAR_ITEM_ACTIVE_CLASS = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const KNOWLEDGE_SIDEBAR_ITEM_INACTIVE_CLASS =
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;
const KNOWLEDGE_META_PILL_CLASS = `${APP_SIDEBAR_PILL_CLASSNAME} text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/75`;

export type KnowledgeUploadFile = File & {
  webkitRelativePath?: string;
};

type KnowledgeUploadOptions = {
  includeImageDescriptions: boolean;
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

function isSupportedKnowledgeFile(file: Pick<File, "name">): boolean {
  const lowerName = file.name.toLowerCase();
  for (const extension of SUPPORTED_UPLOAD_EXTENSIONS) {
    if (lowerName.endsWith(extension)) return true;
  }
  return false;
}

function getKnowledgeTypeLabel(contentType?: string): string {
  return contentType?.split("/").pop()?.toUpperCase() || "DOC";
}

function getKnowledgeSourceLabel(source?: string): string {
  if (source === "youtube") return "YouTube";
  if (source === "url") return "From URL";
  return "Upload";
}

function getKnowledgeDocumentSummary(doc: KnowledgeDocument): string {
  const fragmentLabel =
    doc.fragmentCount === 1 ? "1 fragment" : `${doc.fragmentCount} fragments`;
  return `${getKnowledgeSourceLabel(doc.source)} • ${fragmentLabel} • ${formatByteSize(doc.fileSize)}`;
}

/* ── Upload Zone ────────────────────────────────────────────────────── */

function UploadZone({
  onFilesUpload,
  onUrlUpload,
  uploading,
  uploadStatus,
}: {
  onFilesUpload: (
    files: KnowledgeUploadFile[],
    options: KnowledgeUploadOptions,
  ) => void;
  onUrlUpload: (url: string, options: KnowledgeUploadOptions) => void;
  uploading: boolean;
  uploadStatus: { current: number; total: number; filename: string } | null;
}) {
  const { t } = useApp();
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [includeImageDescriptions, setIncludeImageDescriptions] =
    useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files) as KnowledgeUploadFile[];
      if (files.length > 0 && !uploading) {
        onFilesUpload(files, { includeImageDescriptions });
      }
    },
    [includeImageDescriptions, onFilesUpload, uploading],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && !uploading) {
        onFilesUpload(Array.from(files) as KnowledgeUploadFile[], {
          includeImageDescriptions,
        });
      }
      e.target.value = "";
    },
    [includeImageDescriptions, onFilesUpload, uploading],
  );

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim();
    if (url && !uploading) {
      onUrlUpload(url, { includeImageDescriptions });
      setUrlInput("");
      setShowUrlInput(false);
    }
  }, [includeImageDescriptions, urlInput, uploading, onUrlUpload]);

  return (
    <fieldset
      className="w-full"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      aria-label={t("aria.knowledgeUpload")}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".txt,.md,.mdx,.pdf,.docx,.json,.csv,.xml,.html,.png,.jpg,.jpeg,.webp,.gif"
        onChange={handleFileSelect}
      />
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className={KNOWLEDGE_SECTION_LABEL_CLASS}>Add Content</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted">
            Import files or paste a source URL.
          </div>
        </div>
        <div className={KNOWLEDGE_META_PILL_CLASS}>
          {SUPPORTED_UPLOAD_EXTENSIONS.size} formats
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="default"
          size="sm"
          className="h-10 px-4 text-[11px] font-semibold text-txt shadow-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {t("knowledgeview.ChooseFiles")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-10 px-4 text-[11px] font-semibold text-txt shadow-sm hover:text-txt"
          onClick={() => setShowUrlInput(!showUrlInput)}
          disabled={uploading}
        >
          {t("knowledgeview.AddFromURL")}
        </Button>
      </div>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: form control is associated programmatically */}
      <label className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-border/35 bg-bg/18 px-3 text-[11px] leading-relaxed text-muted-strong transition-colors hover:border-border/55 hover:bg-bg/28 hover:text-txt">
        <Checkbox
          checked={includeImageDescriptions}
          onCheckedChange={(checked) => setIncludeImageDescriptions(!!checked)}
          disabled={uploading}
        />
        <span className="min-w-0">{t("knowledgeview.IncludeAIImageDes")}</span>
      </label>
      <div
        className={`mt-3 rounded-2xl border px-3 py-3 transition-colors ${
          dragOver
            ? "border-accent/50 bg-accent/8 shadow-sm"
            : "border-dashed border-border/35 bg-card/62"
        } ${uploading ? "opacity-60" : ""}`}
      >
        {(dragOver || uploading) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted/80">
            <span className="font-medium text-txt/80">
              {uploadStatus
                ? `Uploading ${uploadStatus.current}/${uploadStatus.total}${uploadStatus.filename ? `: ${uploadStatus.filename}` : ""}`
                : "Drop files or folders to upload"}
            </span>
          </div>
        )}

        {!dragOver && !uploading && !showUrlInput && (
          <div className="space-y-1 py-1 text-center">
            <div className="text-[11px] font-medium text-muted-strong">
              Drop files here to upload
            </div>
            <div className="text-[10px] text-muted">
              Docs, PDFs, JSON, CSV, and supported images.
            </div>
          </div>
        )}

        {showUrlInput && (
          <div
            className={`${dragOver || uploading ? "mt-2" : ""} animate-in fade-in slide-in-from-top-2 duration-300`}
          >
            <div className="mb-2 text-[11px] font-medium leading-relaxed text-muted">
              {t("knowledgeview.PasteAURLToImpor")}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="url"
                placeholder={t("knowledgeview.httpsExampleCom")}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                disabled={uploading}
                className="h-10 flex-1 border-border/55 bg-bg/72 text-xs shadow-none"
              />
              <Button
                variant="default"
                size="sm"
                className="h-10 px-4 text-[11px] font-semibold"
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim() || uploading}
              >
                {t("settings.import")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  );
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
          {result.documentTitle || "Unknown Document"}
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
  return (
    <div
      className={`${KNOWLEDGE_SIDEBAR_ITEM_BASE_CLASS} ${
        active
          ? KNOWLEDGE_SIDEBAR_ITEM_ACTIVE_CLASS
          : KNOWLEDGE_SIDEBAR_ITEM_INACTIVE_CLASS
      }`}
    >
      <span
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[11px] font-semibold ${
          active
            ? "border-accent/30 bg-accent/18 text-txt-strong"
            : "border-border/50 bg-bg-accent/80 text-muted"
        }`}
      >
        {getKnowledgeTypeLabel(doc.contentType).slice(0, 3)}
      </span>
      <Button
        variant="ghost"
        className="h-auto min-w-0 flex-1 rounded-sm p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => onSelect(doc.id)}
        aria-label={`Open ${doc.filename}`}
        aria-current={active ? "page" : undefined}
      >
        <div className="truncate text-sm font-semibold text-txt transition-colors">
          {doc.filename}
        </div>
        <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted/85">
          {getKnowledgeDocumentSummary(doc)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/70">
          <span className="rounded-full border border-border/45 bg-bg/30 px-2 py-0.5">
            {getKnowledgeSourceLabel(doc.source)}
          </span>
          <span>{formatShortDate(doc.createdAt, { fallback: "—" })}</span>
        </div>
      </Button>
      <div className="flex shrink-0 items-center pl-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ConfirmDeleteControl
          triggerClassName="h-8 rounded-lg border border-transparent px-3 text-xs font-bold !bg-transparent text-danger transition-all hover:!bg-danger/12 hover:border-danger/25 hover:text-danger"
          confirmClassName="h-8 rounded-lg border border-danger/25 bg-danger/14 px-3 text-xs font-bold text-danger transition-all hover:bg-danger/20"
          cancelClassName="h-8 rounded-lg border border-border/35 px-3 text-xs font-bold text-muted-strong transition-all hover:border-border-strong hover:text-txt"
          disabled={deleting}
          busyLabel="..."
          onConfirm={() => onDelete(doc.id)}
        />
      </div>
    </div>
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
          err instanceof Error ? err.message : "Failed to load document",
        );
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const previewText = doc?.content?.text?.trim();

  return (
    <section
      className={`${KNOWLEDGE_PANEL_CLASS} min-h-[62vh] overflow-hidden`}
    >
      <div className="border-b border-border/30 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className={KNOWLEDGE_KICKER_CLASS}>Viewer</div>
            <h2 className="mt-1 text-2xl font-semibold text-txt-strong">
              {loading
                ? "Loading..."
                : doc?.filename || "Select a document to inspect"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {doc
                ? "Review metadata, preview the source, and scan the indexed fragments without leaving the page."
                : "Pick a document from the sidebar to review its metadata, preview text, and indexed fragments."}
            </p>
          </div>
          {doc && (
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-full border border-border/45 bg-bg/25 px-3 py-1.5 text-[11px] font-semibold text-muted">
                {getKnowledgeTypeLabel(doc.contentType)}
              </span>
              <span className="rounded-full border border-accent/25 bg-accent/8 px-3 py-1.5 text-[11px] font-semibold text-accent-fg">
                {getKnowledgeSourceLabel(doc.source)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        {loading && (
          <div className="py-12 text-center font-bold tracking-wide text-muted animate-pulse">
            <span className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent align-middle" />
            {t("databaseview.Loading")}
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-lg rounded-xl border border-danger/25 bg-danger/10 py-10 text-center font-medium text-danger">
            {error}
          </div>
        )}

        {!loading && !error && !doc && (
          <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-6 py-16 text-center shadow-inner">
            <div className="text-base font-semibold text-txt">
              No document selected
            </div>
            <div className="mt-2 text-sm text-muted">
              Upload a file or choose an item from the sidebar to start viewing
              fragments and metadata.
            </div>
          </div>
        )}

        {!loading && !error && doc && (
          <>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)]">
              <div className="rounded-2xl border border-border/35 bg-card/82 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/25 pb-3">
                  <div className="text-sm font-semibold text-txt">Preview</div>
                  <span className="rounded-full border border-border/35 bg-bg/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">
                    {formatByteSize(doc.fileSize)}
                  </span>
                </div>
                {previewText ? (
                  <pre className="max-h-[18rem] overflow-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-txt/88">
                    {previewText.slice(0, 3000)}
                  </pre>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/35 bg-bg/16 px-4 py-10 text-center text-sm text-muted">
                    Full text preview is not available for this document type,
                    but indexed fragments are shown below.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/35 bg-card/82 p-5 shadow-sm">
                <div className="text-sm font-semibold text-txt">Details</div>
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
                      Uploaded
                    </span>
                    <span className="inline-block w-fit rounded-md border border-border/25 bg-bg-hover px-2 py-1 font-medium text-txt">
                      {formatShortDate(doc.createdAt, { fallback: "—" })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
                      Fragments
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

            <div className="rounded-2xl border border-border/35 bg-card/82 p-5 shadow-sm">
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
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-txt/90">
                      {fragment.text}
                    </p>
                  </div>
                ))}
                {fragments.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border/35 bg-card/72 py-12 text-center text-muted">
                    {t("knowledgeview.NoFragmentsFound")}
                  </div>
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
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
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
          err instanceof Error ? err.message : "Failed to load knowledge data";
        setLoadError(msg);
        setActionNoticeRef.current(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("[KnowledgeView] Failed to load data:", err);
      setLoading(false);
    });
  }, [loadData]);

  // Auto-retry with exponential backoff when knowledge service is still loading (503)
  useEffect(() => {
    if (!isServiceLoading) {
      serviceRetryRef.current = 0;
      return;
    }
    const attempt = serviceRetryRef.current;
    if (attempt >= 5) {
      setIsServiceLoading(false);
      setLoadError(
        "Knowledge service did not become available. Please reload the page.",
      );
      return;
    }
    const delayMs = 2000 * 1.5 ** attempt; // 2s, 3s, 4.5s, 6.75s, ~10s
    const timer = setTimeout(() => {
      serviceRetryRef.current = attempt + 1;
      loadData();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [isServiceLoading, loadData]);

  const readKnowledgeFile = useCallback(async (file: KnowledgeUploadFile) => {
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
          return;
        }

        if (result instanceof ArrayBuffer) {
          const bytes = new Uint8Array(result);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          resolve(btoa(binary));
          return;
        }

        reject(new Error("Failed to read file"));
      };

      reader.onerror = () => reject(reader.error);

      if (shouldReadKnowledgeFileAsText(file)) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }, []);

  const buildKnowledgeUploadRequest = useCallback(
    async (file: KnowledgeUploadFile, options: KnowledgeUploadOptions) => {
      const optimizedImage = await maybeCompressKnowledgeUploadImage(file);
      const uploadFile = optimizedImage.file as KnowledgeUploadFile;
      if (
        isKnowledgeImageFile(uploadFile) &&
        uploadFile.size > MAX_KNOWLEDGE_IMAGE_PROCESSING_BYTES
      ) {
        throw new Error(
          `Image could not be compressed below ${formatByteSize(MAX_KNOWLEDGE_IMAGE_PROCESSING_BYTES)} for processing.`,
        );
      }

      const uploadFilename = getKnowledgeUploadFilename(uploadFile);
      const content = await readKnowledgeFile(uploadFile);

      const request = {
        content,
        filename: uploadFilename,
        contentType: uploadFile.type || "application/octet-stream",
        metadata: {
          includeImageDescriptions: options.includeImageDescriptions,
          relativePath: uploadFile.webkitRelativePath || undefined,
        },
      };
      const requestBytes = new TextEncoder().encode(
        JSON.stringify(request),
      ).length;
      if (requestBytes > MAX_UPLOAD_REQUEST_BYTES) {
        throw new Error(
          `Upload payload is ${formatByteSize(requestBytes)}, which exceeds the current limit (${formatByteSize(MAX_UPLOAD_REQUEST_BYTES)}).`,
        );
      }

      return {
        filename: uploadFilename,
        request,
        requestBytes,
      };
    },
    [readKnowledgeFile],
  );

  const handleFilesUpload = useCallback(
    async (files: KnowledgeUploadFile[], options: KnowledgeUploadOptions) => {
      const unsupportedFiles = files.filter(
        (file) => !isSupportedKnowledgeFile(file),
      );
      const uploadQueue = files.filter(
        (file) => file.size > 0 && isSupportedKnowledgeFile(file),
      );
      if (uploadQueue.length === 0) {
        setActionNotice(
          unsupportedFiles.length > 0
            ? "No supported non-empty files were selected."
            : "No non-empty files were selected.",
          "info",
          3000,
        );
        return;
      }

      const largeFiles = uploadQueue.filter(
        (file) => file.size >= LARGE_FILE_WARNING_BYTES,
      );
      if (largeFiles.length > 0) {
        const shouldContinue =
          typeof window === "undefined"
            ? true
            : await confirmDesktopAction({
                title: "Upload Large Files",
                message: `${largeFiles.length} large file(s) detected.`,
                detail:
                  "Uploading can take longer and may increase embedding or vision costs.",
                confirmLabel: "Continue",
                cancelLabel: "Cancel",
                type: "warning",
              });
        if (!shouldContinue) return;
      }

      const failures: string[] = [];
      const warnings: string[] = [];
      let successful = 0;

      const normalizeUploadError = (err: unknown): string => {
        const message =
          err instanceof Error ? err.message : "Unknown upload error";
        const status = (err as Error & { status?: number })?.status;
        return status === 413 || /maximum size|payload is/i.test(message)
          ? "Upload too large. Try splitting this file."
          : message;
      };

      setUploading(true);
      setUploadStatus({
        current: 0,
        total: uploadQueue.length,
        filename: "Preparing...",
      });

      try {
        type PreparedUpload = {
          filename: string;
          request: {
            content: string;
            filename: string;
            contentType: string;
            metadata: {
              includeImageDescriptions: boolean;
              relativePath: string | undefined;
            };
          };
          requestBytes: number;
        };

        let currentBatch: PreparedUpload[] = [];
        let currentBatchBytes = 0;

        const flushBatch = async () => {
          if (currentBatch.length === 0) return;

          const batchToUpload = currentBatch;
          currentBatch = [];
          currentBatchBytes = 0;

          const batchLabel = batchToUpload[0]?.filename || "batch";
          setUploadStatus({
            current: successful + failures.length,
            total: uploadQueue.length,
            filename: `Uploading batch starting with ${batchLabel}`,
          });

          try {
            const result = await client.uploadKnowledgeDocumentsBulk({
              documents: batchToUpload.map((item) => item.request),
            });

            for (const item of result.results) {
              const batchItem = batchToUpload[item.index];
              const filename =
                item.filename || batchItem?.filename || "document";
              if (item.ok) {
                successful += 1;
                if (item.warnings?.[0]) {
                  warnings.push(`${filename}: ${item.warnings[0]}`);
                }
              } else {
                failures.push(`${filename}: ${item.error || "Upload failed"}`);
              }
            }
          } catch (err) {
            const message = normalizeUploadError(err);
            for (const batchItem of batchToUpload) {
              failures.push(`${batchItem.filename}: ${message}`);
            }
          }
        };

        for (const [index, file] of uploadQueue.entries()) {
          const uploadFilename = getKnowledgeUploadFilename(file);
          setUploadStatus({
            current: index + 1,
            total: uploadQueue.length,
            filename: `Preparing: ${uploadFilename}`,
          });

          try {
            const prepared = await buildKnowledgeUploadRequest(file, options);
            if (
              currentBatch.length > 0 &&
              (currentBatchBytes + prepared.requestBytes >
                BULK_UPLOAD_TARGET_BYTES ||
                currentBatch.length >= MAX_BULK_REQUEST_DOCUMENTS)
            ) {
              await flushBatch();
            }
            currentBatch.push(prepared);
            currentBatchBytes += prepared.requestBytes;
          } catch (err) {
            failures.push(`${uploadFilename}: ${normalizeUploadError(err)}`);
          }
        }

        await flushBatch();

        let refreshFailed = false;
        try {
          await loadData();
        } catch (err) {
          refreshFailed = true;
          console.error("[KnowledgeView] Failed to refresh after upload:", err);
        }

        const skippedSummary =
          unsupportedFiles.length > 0
            ? ` Skipped ${unsupportedFiles.length} unsupported file(s).`
            : "";
        const refreshSummary = refreshFailed
          ? " Uploaded, but failed to refresh document list."
          : "";

        if (
          uploadQueue.length === 1 &&
          successful === 1 &&
          failures.length === 0
        ) {
          const onlyFile = getKnowledgeUploadFilename(uploadQueue[0]);
          const baseMessage = `Uploaded "${onlyFile}"`;
          if (warnings.length > 0) {
            setActionNotice(`${baseMessage}. ${warnings[0]}`, "info", 6000);
          } else if (refreshFailed) {
            setActionNotice(
              `${baseMessage}. Uploaded, but failed to refresh document list.`,
              "info",
              6000,
            );
          } else {
            setActionNotice(baseMessage, "success", 3000);
          }
          return;
        }

        if (failures.length === 0) {
          setActionNotice(
            `Uploaded ${successful}/${uploadQueue.length} files.${warnings.length > 0 ? ` ${warnings[0]}` : ""}${skippedSummary}${refreshSummary}`,
            warnings.length > 0 || refreshFailed || unsupportedFiles.length > 0
              ? "info"
              : "success",
            7000,
          );
          return;
        }

        setActionNotice(
          `Uploaded ${successful}/${uploadQueue.length} files. ${failures.length} failed.${failures.length > 0 ? ` ${failures[0]}` : ""}${skippedSummary}${refreshSummary}`,
          successful > 0 ? "info" : "error",
          7000,
        );
      } finally {
        setUploading(false);
        setUploadStatus(null);
      }
    },
    [buildKnowledgeUploadRequest, loadData, setActionNotice],
  );

  const handleUrlUpload = useCallback(
    async (url: string, options: KnowledgeUploadOptions) => {
      setUploading(true);
      try {
        const result = await client.uploadKnowledgeFromUrl(url, {
          includeImageDescriptions: options.includeImageDescriptions,
        });

        const baseMessage = result.isYouTubeTranscript
          ? `Imported YouTube transcript (${result.fragmentCount} fragments)`
          : `Imported "${result.filename}" (${result.fragmentCount} fragments)`;
        if (result.warnings && result.warnings.length > 0) {
          setActionNotice(
            `${baseMessage}. ${result.warnings[0]}`,
            "info",
            6000,
          );
        } else {
          setActionNotice(baseMessage, "success", 3000);
        }
        loadData();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown import error";
        setActionNotice(`Failed to import from URL: ${message}`, "error", 5000);
      } finally {
        setUploading(false);
      }
    },
    [loadData, setActionNotice],
  );

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
          err instanceof Error ? err.message : "Unknown search error";
        setActionNotice(`Search failed: ${message}`, "error", 4000);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [setActionNotice],
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeleting(documentId);

      try {
        const result = await client.deleteKnowledgeDocument(documentId);

        if (result.ok) {
          setActionNotice(
            `Deleted document (${result.deletedFragments} fragments removed)`,
            "success",
            3000,
          );
          await loadData();
        } else {
          setActionNotice("Failed to delete document", "error", 4000);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown delete error";
        setActionNotice(`Failed to delete document: ${message}`, "error", 5000);
      } finally {
        setDeleting(null);
      }
    },
    [loadData, setActionNotice],
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

  const totalFragments = useMemo(
    () => documents.reduce((sum, d) => sum + (d.fragmentCount || 0), 0),
    [documents],
  );
  const selectedDoc = documents.find((doc) => doc.id === selectedDocId) || null;
  const isShowingSearchResults = searchResults !== null;
  const visibleSearchResults = searchResults ?? [];

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
    <div
      className={
        inModal
          ? "flex h-full w-full min-h-0 bg-bg"
          : "flex h-full w-full min-h-0 bg-bg p-0 lg:p-1"
      }
    >
      <div className={KNOWLEDGE_SHELL_CLASS}>
        <aside className={KNOWLEDGE_SIDEBAR_CLASS}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className={APP_SIDEBAR_HEADER_CLASSNAME}>
              <div className={KNOWLEDGE_KICKER_CLASS}>Knowledge</div>
              <div className={APP_SIDEBAR_META_CLASSNAME}>
                {documents.length > 0
                  ? `${documents.length} uploaded document${documents.length === 1 ? "" : "s"} indexed`
                  : "Upload docs and explore indexed fragments"}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 px-1">
              <span className={KNOWLEDGE_META_PILL_CLASS}>
                {documents.length} {documents.length === 1 ? "doc" : "docs"}
              </span>
              <span className={KNOWLEDGE_META_PILL_CLASS}>
                {totalFragments} fragments
              </span>
              {selectedDoc && (
                <span className="rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-fg">
                  {getKnowledgeTypeLabel(selectedDoc.contentType)}
                </span>
              )}
            </div>

            <div className="mt-4 border-b border-border/25 pb-4">
              <UploadZone
                onFilesUpload={handleFilesUpload}
                onUrlUpload={handleUrlUpload}
                uploading={uploading}
                uploadStatus={uploadStatus}
              />
            </div>

            <div className="mt-4 border-b border-border/25 pb-4">
              <div className="px-1">
                <div className={KNOWLEDGE_SECTION_LABEL_CLASS}>Search</div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted">
                  Jump to a known document by searching fragment text.
                </div>
              </div>
              <form
                className="mt-3 w-full max-w-[500px] flex-[1_1_500px]"
                onSubmit={handleSearchSubmit}
              >
                <div className="flex items-stretch gap-2">
                  <Input
                    type="text"
                    placeholder={t("knowledge.ui.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={searching}
                    className="h-10 border-border/55 bg-bg/82 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                  />
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
                <span
                  className={
                    isShowingSearchResults
                      ? "rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-fg"
                      : KNOWLEDGE_META_PILL_CLASS
                  }
                >
                  {isShowingSearchResults
                    ? `${visibleSearchResults.length} result${visibleSearchResults.length === 1 ? "" : "s"}`
                    : "Search idle"}
                </span>
                {isShowingSearchResults && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg border border-border/35 px-3 text-[11px] font-semibold text-muted hover:border-border/60 hover:bg-bg/35 hover:text-txt"
                    onClick={() => setSearchResults(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 px-1">
                <div>
                  <div className={KNOWLEDGE_SECTION_LABEL_CLASS}>
                    {isShowingSearchResults
                      ? t("knowledgeview.SearchResults")
                      : t("knowledgeview.Documents")}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    {isShowingSearchResults
                      ? "Search hits replace the document list until you clear them."
                      : "Uploaded docs live here for quick review."}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl px-3 text-[11px] font-semibold shadow-sm"
                  onClick={() => void loadData()}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4" />
                  {loading ? "Loading..." : "Refresh"}
                </Button>
              </div>

              <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-3">
                {loading &&
                  !isShowingSearchResults &&
                  documents.length === 0 && (
                    <div className="rounded-2xl border border-border/35 bg-card/72 px-4 py-10 text-center text-sm font-medium text-muted">
                      {t("knowledgeview.LoadingDocuments")}
                    </div>
                  )}

                {!loading &&
                  !isShowingSearchResults &&
                  documents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-4 py-10 text-center shadow-inner">
                      <div className="text-sm font-semibold text-txt">
                        {t("knowledgeview.NoDocumentsYet")}
                      </div>
                      <div className="mt-2 text-[11px] leading-relaxed text-muted">
                        {t("knowledgeview.UploadFilesOrImpo")}
                      </div>
                    </div>
                  )}

                {isShowingSearchResults &&
                  visibleSearchResults.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-4 py-10 text-center shadow-inner">
                      <div className="text-sm font-semibold text-txt">
                        {t("knowledgeview.NoResultsFound")}
                      </div>
                      <div className="mt-2 text-[11px] leading-relaxed text-muted">
                        Try a filename, topic, or phrase from the document body.
                      </div>
                    </div>
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
                  : documents.map((doc) => (
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
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto bg-bg/10">
          <div className="mx-auto max-w-[78rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            {isServiceLoading && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border/40 bg-card/86 px-4 py-3 text-sm text-muted-strong shadow-sm">
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

            <section className={`${KNOWLEDGE_PANEL_CLASS} px-5 py-5 sm:px-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className={KNOWLEDGE_KICKER_CLASS}>Knowledge</div>
                  <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                    {selectedDoc?.filename || "Knowledge workspace"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    {selectedDoc
                      ? `${getKnowledgeDocumentSummary(selectedDoc)}. Open search results, inspect fragments, and keep uploads close at hand in the sidebar.`
                      : "Keep uploads, search, and document review in one workspace so the knowledge base is easier to manage and inspect."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="rounded-full border border-border/45 bg-bg/25 px-3 py-1.5 text-[11px] font-semibold text-muted">
                    {documents.length} docs
                  </span>
                  <span className="rounded-full border border-border/45 bg-bg/25 px-3 py-1.5 text-[11px] font-semibold text-muted">
                    {totalFragments} fragments
                  </span>
                  {searchResults !== null && (
                    <span className="rounded-full border border-accent/25 bg-accent/8 px-3 py-1.5 text-[11px] font-semibold text-accent-fg">
                      {searchResults.length} results
                    </span>
                  )}
                </div>
              </div>
            </section>

            <div className="mt-4">
              <DocumentViewer documentId={selectedDocId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
