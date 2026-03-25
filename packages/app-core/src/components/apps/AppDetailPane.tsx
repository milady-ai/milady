import { Button } from "@miladyai/ui";
import type React from "react";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { getAppDetailExtension } from "./extensions/registry";
import { CATEGORY_LABELS, getAppEmoji } from "./helpers";

interface AppDetailPaneProps {
  app: RegistryAppInfo;
  busy: boolean;
  compact?: boolean;
  hasActiveViewer: boolean;
  isActive: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onOpenCurrentGame: () => void;
  onOpenCurrentGameInNewTab: () => void;
}

function DetailBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success";
}) {
  const toneClassName =
    tone === "success"
      ? "border-ok/30 bg-ok/10 text-ok"
      : tone === "accent"
        ? "border-accent/25 bg-accent/10 text-accent"
        : "border-border/35 bg-bg-hover/70 text-muted-strong";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 rounded-2xl border border-border/35 bg-card/72 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <span className="min-w-0 text-[12px] leading-5 text-txt">{value}</span>
    </div>
  );
}

export function AppDetailPane({
  app,
  busy,
  compact = false,
  hasActiveViewer,
  isActive,
  onBack,
  onLaunch,
  onOpenCurrentGame,
  onOpenCurrentGameInNewTab,
}: AppDetailPaneProps) {
  const { t } = useApp();
  const DetailExtension = getAppDetailExtension(app);
  const description =
    app.description ??
    t("appsview.NoDescriptionAvailable", {
      defaultValue: "No description available.",
    });
  const launchLabel = busy
    ? t("appsview.Launching", { defaultValue: "Launching..." })
    : t("appsview.Launch", { defaultValue: "Launch app" });
  const backLabel = t("appsview.Back", { defaultValue: "Back to catalog" });

  if (compact) {
    return (
      <div className="phone-inline-detail space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 justify-start rounded-xl border border-border/35 bg-card/72 px-3 text-[12px] font-medium text-muted-strong shadow-sm hover:bg-bg-hover/80 hover:text-txt"
          onClick={onBack}
        >
          ← {backLabel}
        </Button>

        <div className="rounded-[1.5rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-border/35 bg-bg/80 text-[1.75rem] shadow-sm">
              {getAppEmoji(app)}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-base font-semibold tracking-[0.01em] text-txt">
                {app.displayName ?? app.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <DetailBadge tone={isActive ? "success" : "neutral"}>
                  {isActive
                    ? t("appsview.Active", { defaultValue: "Active" })
                    : t("appsview.Inactive", { defaultValue: "Inactive" })}
                </DetailBadge>
                {app.category ? (
                  <DetailBadge>
                    {CATEGORY_LABELS[app.category] ?? app.category}
                  </DetailBadge>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-border/35 bg-bg/55 px-4 py-3">
          <p className="text-[12px] leading-6 text-muted-strong">
            {description}
          </p>
        </div>

        <div className="grid gap-2">
          <Button
            variant="default"
            size="sm"
            className="min-h-11 w-full rounded-xl px-4 shadow-sm"
            disabled={busy}
            onClick={onLaunch}
          >
            {launchLabel}
          </Button>
          {hasActiveViewer ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full rounded-xl px-4 shadow-sm"
              onClick={onOpenCurrentGame}
            >
              {t("appsview.ResumeSession", {
                defaultValue: "Resume session",
              })}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MetadataRow
            label={t("appsview.LaunchType", { defaultValue: "Launch type" })}
            value={<span className="break-words">{app.launchType || "—"}</span>}
          />
          <MetadataRow
            label={t("common.version", { defaultValue: "Version" })}
            value={
              <span className="font-mono text-[11px] text-muted-strong">
                {app.latestVersion ? `v${app.latestVersion}` : "—"}
              </span>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 rounded-xl border-border/35 bg-card/72 px-3 shadow-sm"
          onClick={onBack}
        >
          ← {backLabel}
        </Button>
        {app.latestVersion ? (
          <span className="font-mono text-[11px] text-muted-strong">
            v{app.latestVersion}
          </span>
        ) : null}
      </div>

      <section className="rounded-[1.75rem] border border-border/35 bg-card/78 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] border border-border/35 bg-bg/80 text-[2rem] shadow-sm">
            {getAppEmoji(app)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold tracking-[0.01em] text-txt">
              {app.displayName ?? app.name}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <DetailBadge tone={isActive ? "success" : "neutral"}>
                {isActive
                  ? t("appsview.Active", { defaultValue: "Active" })
                  : t("appsview.Inactive", { defaultValue: "Inactive" })}
              </DetailBadge>
              {app.category ? (
                <DetailBadge>
                  {CATEGORY_LABELS[app.category] ?? app.category}
                </DetailBadge>
              ) : null}
              {app.latestVersion ? (
                <DetailBadge tone="accent">v{app.latestVersion}</DetailBadge>
              ) : null}
            </div>
            <div className="mt-4 rounded-[1.25rem] border border-border/35 bg-bg/55 px-4 py-3">
              <p className="max-w-[62ch] text-[13px] leading-6 text-muted-strong">
                {description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`grid gap-2 ${hasActiveViewer ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" : "md:grid-cols-2"}`}
      >
        <Button
          variant="default"
          size="sm"
          className="min-h-11 rounded-xl px-5 shadow-sm"
          disabled={busy}
          onClick={onLaunch}
        >
          {launchLabel}
        </Button>
        {hasActiveViewer ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-xl px-5 shadow-sm"
              onClick={onOpenCurrentGame}
            >
              {t("appsview.ResumeSession", {
                defaultValue: "Resume session",
              })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-xl px-5 shadow-sm"
              onClick={onOpenCurrentGameInNewTab}
            >
              {t("appsview.OpenInTab", { defaultValue: "Open in browser tab" })}
            </Button>
          </>
        ) : null}
      </div>

      <section className="space-y-2.5">
        <MetadataRow
          label={t("appsview.LaunchType", { defaultValue: "Launch type" })}
          value={<span className="break-words">{app.launchType || "—"}</span>}
        />
        {app.launchUrl ? (
          <MetadataRow
            label={t("appsview.URL", { defaultValue: "URL" })}
            value={
              <span className="break-all text-muted-strong">
                {app.launchUrl}
              </span>
            }
          />
        ) : null}
        {app.repository ? (
          <MetadataRow
            label={t("appsview.Repository", { defaultValue: "Repository" })}
            value={
              <a
                href={app.repository}
                target="_blank"
                rel="noreferrer"
                className="break-all text-accent underline-offset-4 transition-colors hover:text-txt hover:underline"
              >
                {app.repository}
              </a>
            }
          />
        ) : null}
      </section>

      {app.capabilities?.length ? (
        <section className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t("appsview.Capabilities", { defaultValue: "Capabilities" })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {app.capabilities.map((capability) => (
              <DetailBadge key={capability}>{capability}</DetailBadge>
            ))}
          </div>
        </section>
      ) : null}

      {app.viewer ? (
        <section className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t("appsview.Viewer", { defaultValue: "Viewer" })}
          </div>
          <div className="space-y-2">
            <MetadataRow
              label={t("appsview.URL", { defaultValue: "URL" })}
              value={
                <span className="break-all text-muted-strong">
                  {app.viewer.url}
                </span>
              }
            />
            <MetadataRow
              label={t("appsview.Auth", { defaultValue: "Auth" })}
              value={
                <span className="text-muted-strong">
                  {app.viewer.postMessageAuth
                    ? t("appsview.Enabled", { defaultValue: "Enabled" })
                    : t("appsview.Disabled", { defaultValue: "Disabled" })}
                </span>
              }
            />
            <MetadataRow
              label={t("appsview.Sandbox", { defaultValue: "Sandbox" })}
              value={
                <span className="break-all text-muted-strong">
                  {app.viewer.sandbox || "—"}
                </span>
              }
            />
          </div>
        </section>
      ) : null}

      {DetailExtension ? (
        <div className="border-t border-border/35 pt-4">
          <DetailExtension app={app} />
        </div>
      ) : null}
    </div>
  );
}
