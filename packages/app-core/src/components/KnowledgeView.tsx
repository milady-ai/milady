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
import {
  Button,
  Checkbox,
  Input,
  PageLayout,
  PagePanel,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarPanel,
  SidebarScrollRegion,
} from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function getKnowledgeDocumentSummary(
  doc: KnowledgeDocument,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const fragmentLabel =
    doc.fragmentCount === 1
      ? t("knowledgeview.FragmentCountOne", {
          defaultValue: "1 fragment",
        })
      : t("knowledgeview.FragmentCountMany", {
          defaultValue: "{{count}} fragments",
          count: doc.fragmentCount,
        });
  return `${getKnowledgeSourceLabel(doc.source, t)} • ${fragmentLabel} • ${formatByteSize(doc.fileSize)}`;
}

function getRailMonogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return (initials || label.slice(0, 1).toUpperCase() || "?").slice(0, 2);
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
        <PagePanel.Meta compact tone="strong">
          {t("knowledgeview.FormatsCount", {
            defaultValue: "{{count}} formats",
            count: SUPPORTED_UPLOAD_EXTENSIONS.size,
          })}
        </PagePanel.Meta>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="default"
          size="sm"
          className="h-10 px-4 text-[11px] font-semibold text-txt-strong shadow-sm hover:text-txt-strong"
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
      <div className="mt-2 inline-flex min-h-11 w-full items-center gap-2 rounded-xl border border-border/35 bg-bg/18 px-3 text-[11px] leading-relaxed text-muted-strong transition-colors hover:border-border/55 hover:bg-bg/28 hover:text-txt">
        <Checkbox
          id="knowledge-upload-image-descriptions"
          checked={includeImageDescriptions}
          onCheckedChange={(checked) => setIncludeImageDescriptions(!!checked)}
          disabled={uploading}
        />
        <label
          htmlFor="knowledge-upload-image-descriptions"
          className="min-w-0 cursor-pointer"
        >
          {t("knowledgeview.IncludeAIImageDes")}
        </label>
      </div>
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
                ? t("knowledgeview.UploadingProgress", {
                    defaultValue: "Uploading {{current}}/{{total}}{{filename}}",
                    current: uploadStatus.current,
                    total: uploadStatus.total,
                    filename: uploadStatus.filename
                      ? `: ${uploadStatus.filename}`
                      : "",
                  })
                : t("knowledgeview.DropFilesOrFoldersToUpload", {
                    defaultValue: "Drop files or folders to upload",
                  })}
            </span>
          </div>
        )}

        {!dragOver && !uploading && !showUrlInput && (
          <div className="space-y-1 py-1 text-center">
            <div className="text-[11px] font-medium text-muted-strong">
              {t("knowledgeview.DropFilesHereToUpload", {
                defaultValue: "Drop files here to upload",
              })}
            </div>
            <div className="text-[10px] text-muted">
              {t("knowledgeview.UploadSupportedTypes", {
                defaultValue: "Docs, PDFs, JSON, CSV, and supported images.",
              })}
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
    <SidebarContent.ItemButton
      onClick={() => onSelect(result.documentId || result.id)}
      type="button"
      aria-current={active ? "page" : undefined}
    >
      <SidebarContent.ItemIcon
        active={active}
        className="text-[10px] font-semibold"
      >
        {(result.similarity * 100).toFixed(0)}%
      </SidebarContent.ItemIcon>
      <SidebarContent.ItemBody>
        <SidebarContent.ItemTitle className="truncate">
          {result.documentTitle ||
            t("knowledgeview.UnknownDocument", {
              defaultValue: "Unknown Document",
            })}
        </SidebarContent.ItemTitle>
        <SidebarContent.ItemDescription className="line-clamp-2">
          {result.text}
        </SidebarContent.ItemDescription>
        <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg/85">
          {(result.similarity * 100).toFixed(0)}% {t("knowledgeview.Match")}
        </span>
      </SidebarContent.ItemBody>
    </SidebarContent.ItemButton>
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
    <SidebarContent.Item as="div" active={active} className="relative">
      <SidebarContent.ItemButton
        onClick={() => onSelect(doc.id)}
        aria-label={t("knowledgeview.OpenDocument", {
          defaultValue: "Open {{filename}}",
          filename: doc.filename,
        })}
        aria-current={active ? "page" : undefined}
        title={getKnowledgeDocumentSummary(doc, t)}
      >
        <SidebarContent.ItemBody>
          <div className="truncate text-sm font-semibold leading-snug text-txt">
            {doc.filename}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
          </div>
        </SidebarContent.ItemBody>
      </SidebarContent.ItemButton>
      <span className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ConfirmDeleteControl
          triggerClassName="h-7 rounded-lg border border-transparent px-2 text-[10px] font-bold !bg-transparent text-danger/70 transition-all hover:!bg-danger/12 hover:border-danger/25 hover:text-danger"
          confirmClassName="h-7 rounded-lg border border-danger/25 bg-danger/14 px-2 text-[10px] font-bold text-danger transition-all hover:bg-danger/20"
          cancelClassName="h-7 rounded-lg border border-border/35 px-2 text-[10px] font-bold text-muted-strong transition-all hover:border-border-strong hover:text-txt"
          disabled={deleting}
          busyLabel="..."
          onConfirm={() => onDelete(doc.id)}
        />
      </span>
    </SidebarContent.Item>
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
    <PagePanel className="min-h-[62vh] overflow-hidden">
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
          <PagePanel.Empty
            variant="inset"
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
              <PagePanel variant="inset" className="p-5">
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
                  <PagePanel.Empty
                    variant="inset"
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
              </PagePanel>

              <PagePanel variant="inset" className="p-5">
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
              </PagePanel>
            </div>

            <PagePanel variant="inset" className="p-5">
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
                  <PagePanel.Empty
                    variant="inset"
                    className="min-h-[10rem] py-12"
                    title={t("knowledgeview.NoFragmentsFound")}
                  />
                )}
              </div>
            </PagePanel>
          </>
        )}
      </div>
    </PagePanel>
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

  const readKnowledgeFile = useCallback(
    async (file: KnowledgeUploadFile) => {
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

          reject(
            new Error(
              t("knowledgeview.FailedToReadFile", {
                defaultValue: "Failed to read file",
              }),
            ),
          );
        };

        reader.onerror = () => reject(reader.error);

        if (shouldReadKnowledgeFileAsText(file)) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
      });
    },
    [t],
  );

  const buildKnowledgeUploadRequest = useCallback(
    async (file: KnowledgeUploadFile, options: KnowledgeUploadOptions) => {
      const optimizedImage = await maybeCompressKnowledgeUploadImage(file);
      const uploadFile = optimizedImage.file as KnowledgeUploadFile;
      if (
        isKnowledgeImageFile(uploadFile) &&
        uploadFile.size > MAX_KNOWLEDGE_IMAGE_PROCESSING_BYTES
      ) {
        throw new Error(
          t("knowledgeview.ImageCouldNotBeCompressed", {
            defaultValue:
              "Image could not be compressed below {{limit}} for processing.",
            limit: formatByteSize(MAX_KNOWLEDGE_IMAGE_PROCESSING_BYTES),
          }),
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
          t("knowledgeview.UploadPayloadExceedsLimit", {
            defaultValue:
              "Upload payload is {{size}}, which exceeds the current limit ({{limit}}).",
            size: formatByteSize(requestBytes),
            limit: formatByteSize(MAX_UPLOAD_REQUEST_BYTES),
          }),
        );
      }

      return {
        filename: uploadFilename,
        request,
        requestBytes,
      };
    },
    [readKnowledgeFile, t],
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
            ? t("knowledgeview.NoSupportedNonEmptyFiles", {
                defaultValue: "No supported non-empty files were selected.",
              })
            : t("knowledgeview.NoNonEmptyFiles", {
                defaultValue: "No non-empty files were selected.",
              }),
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
                title: t("knowledgeview.UploadLargeFiles", {
                  defaultValue: "Upload Large Files",
                }),
                message: t("knowledgeview.LargeFilesDetected", {
                  defaultValue: "{{count}} large file(s) detected.",
                  count: largeFiles.length,
                }),
                detail: t("knowledgeview.UploadLargeFilesDetail", {
                  defaultValue:
                    "Uploading can take longer and may increase embedding or vision costs.",
                }),
                confirmLabel: t("onboarding.savedMyKeys", {
                  defaultValue: "Continue",
                }),
                cancelLabel: t("common.cancel", {
                  defaultValue: "Cancel",
                }),
                type: "warning",
              });
        if (!shouldContinue) return;
      }

      const failures: string[] = [];
      const warnings: string[] = [];
      let successful = 0;

      const normalizeUploadError = (err: unknown): string => {
        const message =
          err instanceof Error
            ? err.message
            : t("knowledgeview.UnknownUploadError", {
                defaultValue: "Unknown upload error",
              });
        const status = (err as Error & { status?: number })?.status;
        return status === 413 || /maximum size|payload is/i.test(message)
          ? t("knowledgeview.UploadTooLarge", {
              defaultValue: "Upload too large. Try splitting this file.",
            })
          : message;
      };

      setUploading(true);
      setUploadStatus({
        current: 0,
        total: uploadQueue.length,
        filename: t("knowledgeview.Preparing", {
          defaultValue: "Preparing...",
        }),
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

          const batchLabel =
            batchToUpload[0]?.filename ||
            t("knowledgeview.Batch", { defaultValue: "batch" });
          setUploadStatus({
            current: successful + failures.length,
            total: uploadQueue.length,
            filename: t("knowledgeview.UploadingBatchStartingWith", {
              defaultValue: "Uploading batch starting with {{label}}",
              label: batchLabel,
            }),
          });

          try {
            const result = await client.uploadKnowledgeDocumentsBulk({
              documents: batchToUpload.map((item) => item.request),
            });

            for (const item of result.results) {
              const batchItem = batchToUpload[item.index];
              const filename =
                item.filename ||
                batchItem?.filename ||
                t("knowledgeview.Document", {
                  defaultValue: "document",
                });
              if (item.ok) {
                successful += 1;
                if (item.warnings?.[0]) {
                  warnings.push(`${filename}: ${item.warnings[0]}`);
                }
              } else {
                failures.push(
                  `${filename}: ${
                    item.error ||
                    t("knowledgeview.UploadFailed", {
                      defaultValue: "Upload failed",
                    })
                  }`,
                );
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
            filename: t("knowledgeview.PreparingFile", {
              defaultValue: "Preparing: {{filename}}",
              filename: uploadFilename,
            }),
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
    [buildKnowledgeUploadRequest, loadData, setActionNotice, t],
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
          err instanceof Error
            ? err.message
            : t("knowledgeview.UnknownImportError", {
                defaultValue: "Unknown import error",
              });
        setActionNotice(
          t("knowledgeview.FailedToImportFromUrl", {
            defaultValue: "Failed to import from URL: {{message}}",
            message,
          }),
          "error",
          5000,
        );
      } finally {
        setUploading(false);
      }
    },
    [loadData, setActionNotice, t],
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

  const totalFragments = useMemo(
    () => documents.reduce((sum, d) => sum + (d.fragmentCount || 0), 0),
    [documents],
  );
  const isShowingSearchResults = searchResults !== null;
  const visibleSearchResults = searchResults ?? [];
  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || isShowingSearchResults) {
      return documents;
    }
    return documents.filter(
      (doc) =>
        doc.filename.toLowerCase().includes(query) ||
        doc.contentType?.toLowerCase().includes(query),
    );
  }, [documents, isShowingSearchResults, searchQuery]);

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

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      if (searchResults !== null) {
        setSearchResults(null);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSearch(query);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [handleSearch, searchQuery, searchResults]);

  return (
    <PageLayout
      className={inModal ? "min-h-0" : undefined}
      sidebar={
        <Sidebar
          testId="knowledge-sidebar"
          contentIdentity="knowledge"
          header={
            <SidebarHeader
              search={{
                placeholder: t("knowledge.ui.searchPlaceholder"),
                value: searchQuery,
                onChange: (e) => {
                  setSearchQuery(e.target.value);
                  if (isShowingSearchResults) {
                    setSearchResults(null);
                  }
                },
                onClear: () => {
                  setSearchQuery("");
                  setSearchResults(null);
                },
                loading: searching,
                clearLabel: t("common.clear", { defaultValue: "Clear" }),
                autoComplete: "off",
                spellCheck: false,
              }}
            />
          }
          collapsedRailItems={
            isShowingSearchResults
              ? visibleSearchResults.map((result) => {
                  const resultLabel =
                    result.documentTitle ||
                    t("knowledgeview.UnknownDocument", {
                      defaultValue: "Unknown Document",
                    });
                  return (
                    <SidebarContent.RailItem
                      key={result.id}
                      aria-label={resultLabel}
                      title={resultLabel}
                      active={
                        selectedDocId === (result.documentId || result.id)
                      }
                      onClick={() =>
                        setSelectedDocId(result.documentId || result.id)
                      }
                    >
                      {getRailMonogram(resultLabel)}
                    </SidebarContent.RailItem>
                  );
                })
              : filteredDocuments.map((doc) => (
                  <SidebarContent.RailItem
                    key={doc.id}
                    aria-label={doc.filename}
                    title={doc.filename}
                    active={selectedDocId === doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                  >
                    {getRailMonogram(doc.filename)}
                  </SidebarContent.RailItem>
                ))
          }
        >
          <SidebarScrollRegion>
            <SidebarPanel>
              <div className="space-y-4">
                <PagePanel variant="inset" className="p-4">
                  <UploadZone
                    onFilesUpload={handleFilesUpload}
                    onUrlUpload={handleUrlUpload}
                    uploading={uploading}
                    uploadStatus={uploadStatus}
                  />
                </PagePanel>

                <div className="flex flex-wrap gap-2 px-1">
                  <PagePanel.Meta compact>
                    {t("knowledgeview.DocumentsCount", {
                      defaultValue: "{{count}} docs",
                      count: documents.length,
                    })}
                  </PagePanel.Meta>
                  <PagePanel.Meta compact tone="strong">
                    {t("knowledgeview.TotalFragmentsCount", {
                      defaultValue: "{{count}} fragments",
                      count: totalFragments,
                    })}
                  </PagePanel.Meta>
                </div>

                <div className="space-y-1.5">
                  {loading &&
                    !isShowingSearchResults &&
                    documents.length === 0 && (
                      <PagePanel.Empty
                        variant="inset"
                        className="px-4 py-10 text-center text-sm font-medium"
                        title={t("knowledgeview.LoadingDocuments")}
                      >
                        {t("knowledgeview.LoadingDocuments")}
                      </PagePanel.Empty>
                    )}

                  {!loading &&
                    !isShowingSearchResults &&
                    documents.length === 0 && (
                      <PagePanel.Empty
                        variant="inset"
                        className="min-h-[12rem] px-4 py-8"
                        description={t("knowledgeview.UploadFilesOrImpo")}
                        title={t("knowledgeview.NoDocumentsYet")}
                      />
                    )}

                  {!loading &&
                    !isShowingSearchResults &&
                    documents.length > 0 &&
                    filteredDocuments.length === 0 && (
                      <PagePanel.Empty
                        variant="inset"
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

                  {isShowingSearchResults &&
                    visibleSearchResults.length === 0 && (
                      <PagePanel.Empty
                        variant="inset"
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
            </SidebarPanel>
          </SidebarScrollRegion>
        </Sidebar>
      }
      contentInnerClassName="mx-auto w-full max-w-[78rem]"
    >
      {isServiceLoading && (
        <PagePanel
          variant="inset"
          className="mb-4 flex items-center gap-2 px-4 py-3 text-sm text-muted-strong"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          {t("knowledgeview.KnowledgeServiceIs")}
        </PagePanel>
      )}

      {loadError && !isServiceLoading && (
        <PagePanel.Notice
          tone="danger"
          className="mb-4"
          actions={
            <Button
              variant="outline"
              size="sm"
              className="border-danger/30 px-3 text-xs text-danger hover:bg-danger/16"
              onClick={() => loadData()}
            >
              {t("common.retry")}
            </Button>
          }
        >
          {loadError}
        </PagePanel.Notice>
      )}

      <div className="mt-4">
        <DocumentViewer documentId={selectedDocId} />
      </div>
    </PageLayout>
  );
}
