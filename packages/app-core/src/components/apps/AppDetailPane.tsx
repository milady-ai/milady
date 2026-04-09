import { Button } from "@miladyai/ui";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { getAppDetailExtension } from "./extensions/registry";
import {
  CATEGORY_LABELS,
  getAppEmoji,
  getAppSessionFeatureLabels,
  getAppSessionModeLabel,
} from "./helpers";

interface AppDetailPaneProps {
  app: RegistryAppInfo;
  busy: boolean;
  hasActiveViewer: boolean;
  isActive: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onOpenCurrentGame: () => void;
  onOpenCurrentGameInNewTab: () => void;
}

export function AppDetailPane({
  app,
  busy,
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
  const backLabel = t("appsview.Back", { defaultValue: "Back" });
  const sessionModeLabel = getAppSessionModeLabel(app);
  const sessionFeatures = getAppSessionFeatureLabels(app);
  const allTags = [...sessionFeatures, ...(app.capabilities ?? [])];
  const launchLabel = busy
    ? t("appsview.Launching", { defaultValue: "Launching..." })
    : t("appsview.Launch", { defaultValue: "Launch" });

  return (
    <div className="space-y-4" data-testid="apps-detail-panel">
      <button
        type="button"
        className="text-[12px] font-medium text-muted-strong transition-colors hover:text-txt"
        onClick={onBack}
      >
        ← {backLabel}
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/35 bg-bg/80 text-xl">
            {getAppEmoji(app)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-txt">
              {app.displayName ?? app.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-strong">
              {isActive ? <span className="text-ok">Active</span> : null}
              {app.category ? (
                <span>{CATEGORY_LABELS[app.category] ?? app.category}</span>
              ) : null}
              {sessionModeLabel ? (
                <span className="text-accent">{sessionModeLabel}</span>
              ) : null}
              {app.latestVersion ? (
                <span className="font-mono">v{app.latestVersion}</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            variant="default"
            size="sm"
            data-testid="apps-detail-launch"
            className="rounded-xl px-4"
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
                data-testid="apps-detail-resume"
                className="rounded-xl px-4"
                onClick={onOpenCurrentGame}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="apps-detail-open-tab"
                className="rounded-xl px-4"
                onClick={onOpenCurrentGameInNewTab}
              >
                {t("appsview.OpenInTab", { defaultValue: "Open in tab" })}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <p className="max-w-prose text-[13px] leading-6 text-muted-strong">
        {description}
      </p>

      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/30 bg-bg-hover/70 px-2 py-0.5 text-[10px] text-muted-strong"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {app.repository ? (
        <a
          href={app.repository}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[12px] text-accent underline-offset-4 transition-colors hover:underline"
        >
          {app.repository}
        </a>
      ) : null}

      {DetailExtension ? (
        <div className="border-t border-border/30 pt-4">
          <DetailExtension app={app} />
        </div>
      ) : null}
    </div>
  );
}
