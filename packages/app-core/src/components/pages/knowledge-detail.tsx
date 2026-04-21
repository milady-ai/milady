/**
 * Knowledge document detail viewer — preview, metadata, and fragment list.
 *
 * Extracted from KnowledgeView.tsx to keep individual files under ~500 LOC.
 */

import type {
  KnowledgeDocument,
  KnowledgeFragment,
} from "@miladyai/app-core/api";
import { client } from "@miladyai/app-core/api";
import { formatByteSize, formatShortDate } from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";
import { PagePanel } from "@miladyai/ui";
import { useEffect, useState } from "react";

export function getKnowledgeTypeLabel(contentType?: string): string {
  return contentType?.split("/").pop()?.toUpperCase() || "DOC";
}

export function getKnowledgeSourceLabel(
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

export function getKnowledgeDocumentSummary(
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

/* ── Document Viewer ────────────────────────────────────────────────── */

export function DocumentViewer({ documentId }: { documentId: string | null }) {
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
                      {formatShortDate(doc.createdAt, { fallback: "\u2014" })}
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
