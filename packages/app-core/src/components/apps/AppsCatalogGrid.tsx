import { Button, Input } from "@miladyai/ui";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { CATEGORY_LABELS, getAppEmoji, getAppShortName } from "./helpers";

interface AppsCatalogGridProps {
  activeAppNames: Set<string>;
  error: string | null;
  loading: boolean;
  searchQuery: string;
  showActiveOnly: boolean;
  visibleApps: RegistryAppInfo[];
  onLaunch: (app: RegistryAppInfo) => void;
  onRefresh: () => void;
  onSearchQueryChange: (value: string) => void;
  onSelectApp: (appName: string) => void;
  onToggleActiveOnly: () => void;
}

export function AppsCatalogGrid({
  activeAppNames,
  error,
  loading,
  searchQuery,
  showActiveOnly,
  visibleApps,
  onLaunch,
  onRefresh,
  onSearchQueryChange,
  onSelectApp,
  onToggleActiveOnly,
}: AppsCatalogGridProps) {
  const { t } = useApp();
  const launchLabel = t("appsview.Launch", { defaultValue: "Launch" });

  return (
    <div data-testid="apps-catalog-grid">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          aria-label={t("appsview.Search", { defaultValue: "Search apps" })}
          placeholder={t("appsview.SearchPlaceholder")}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="min-w-[200px] flex-1 rounded-xl border-border/50 bg-card/86 text-[12px] text-txt placeholder:text-muted focus:border-accent"
        />
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl px-3 shadow-sm"
          onClick={onRefresh}
        >
          {t("common.refresh")}
        </Button>
        <Button
          variant={showActiveOnly ? "default" : "outline"}
          size="sm"
          className="rounded-xl px-3 shadow-sm"
          onClick={onToggleActiveOnly}
        >
          {t("appsview.ActiveOnly")}
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border/30 bg-card/72 py-16 text-center text-[12px] text-muted">
          {t("appsview.Loading")}
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-6 py-16 text-center">
          <div className="text-[12px] font-medium text-muted-strong">
            {searchQuery
              ? t("appsview.NoAppsMatchSearch")
              : t("appsview.NoAppsAvailable")}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleApps.map((app) => {
            const isActive = activeAppNames.has(app.name);
            const displayName = app.displayName ?? getAppShortName(app);

            return (
              <button
                key={app.name}
                type="button"
                data-testid={`app-card-${app.name.replace(/[^a-z0-9]+/gi, "-")}`}
                title={t("appsview.Open", {
                  name: displayName,
                  defaultValue: `Open ${displayName}`,
                })}
                aria-label={t("appsview.Open", {
                  name: displayName,
                  defaultValue: `Open ${displayName}`,
                })}
                className="group flex flex-col rounded-2xl border border-border/35 bg-card/72 p-4 text-left transition-all hover:border-accent/25 hover:bg-bg-hover/70"
                onClick={() => onSelectApp(app.name)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/35 bg-bg/80 text-lg">
                      {isActive ? (
                        <span className="absolute -right-0.5 -top-0.5 z-10 h-2 w-2 rounded-full border-[1.5px] border-card bg-ok" />
                      ) : null}
                      <span>{getAppEmoji(app)}</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-txt">
                        {displayName}
                      </div>
                      {app.category ? (
                        <div className="text-[11px] text-muted-strong">
                          {CATEGORY_LABELS[app.category] ?? app.category}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-lg px-3 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onLaunch(app);
                    }}
                  >
                    {launchLabel}
                  </Button>
                </div>
                <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-muted-strong">
                  {app.description ||
                    "Launch and manage this agent experience."}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
