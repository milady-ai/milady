import { Button, Input } from "@miladyai/ui";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { getAppEmoji, getAppShortName } from "./helpers";

interface AppsCatalogGridProps {
  activeAppNames: Set<string>;
  activeGameDisplayName: string;
  error: string | null;
  hasCurrentGame: boolean;
  loading: boolean;
  searchQuery: string;
  selectedAppName: string | null;
  showActiveOnly: boolean;
  visibleApps: RegistryAppInfo[];
  onOpenCurrentGame: () => void;
  onRefresh: () => void;
  onSearchQueryChange: (value: string) => void;
  onSelectApp: (appName: string) => void;
  onToggleActiveOnly: () => void;
}

export function AppsCatalogGrid({
  activeAppNames,
  activeGameDisplayName,
  error,
  hasCurrentGame,
  loading,
  searchQuery,
  selectedAppName,
  showActiveOnly,
  visibleApps,
  onOpenCurrentGame,
  onRefresh,
  onSearchQueryChange,
  onSelectApp,
  onToggleActiveOnly,
}: AppsCatalogGridProps) {
  const { t } = useApp();

  return (
    <>
      <div className="mb-4 space-y-3">
        <Input
          type="text"
          aria-label={t("appsview.Search", { defaultValue: "Search apps" })}
          placeholder="Search by name or description"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="rounded-xl border-border/50 bg-card/86 text-[12px] text-txt placeholder:text-muted focus:border-accent"
        />
        <p className="text-[11px] leading-5 text-muted-strong">
          Choose an app tile to inspect launch details, current session state,
          and available viewer actions.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="rounded-full border border-border/30 bg-bg-hover px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-strong">
            {visibleApps.length} results
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={onRefresh}
            >
              {t("common.refresh")}
            </Button>
            <Button
              variant={showActiveOnly ? "default" : "outline"}
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={onToggleActiveOnly}
            >
              {t("appsview.ActiveOnly")}
            </Button>
          </div>
        </div>
      </div>

      {hasCurrentGame ? (
        <Button
          variant="ghost"
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-ok/30 bg-ok/8 px-3 py-3 text-left shadow-sm transition-colors hover:bg-ok/12"
          onClick={onOpenCurrentGame}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-ok animate-pulse" />
          <span className="min-w-0 flex-1 text-left text-[11px] font-semibold text-txt">
            {activeGameDisplayName || "Game running"}
          </span>
          <span className="text-[10px] text-muted-strong">Resume</span>
        </Button>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border/30 bg-card/72 py-16 text-center text-[12px] text-muted">
          Loading...
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-6 py-16 text-center">
          <div className="text-[12px] font-medium text-muted-strong">
            {searchQuery ? "No apps match this search" : "No apps available"}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-muted">
            {searchQuery
              ? "Try a broader search, or clear the filter to browse everything in the catalog."
              : "Refresh the catalog or check back after more app packages are installed."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 justify-items-center gap-x-3 gap-y-4 sm:gap-x-4">
          {visibleApps.map((app) => {
            const isActive = activeAppNames.has(app.name);
            const isSelected = selectedAppName === app.name;
            const displayName = app.displayName ?? getAppShortName(app);

            return (
              <Button
                key={app.name}
                variant="ghost"
                className={`phone-app-tile group flex w-full max-w-[5.75rem] flex-col items-center gap-2 rounded-2xl border px-1 py-1.5 text-center transition-all ${
                  isSelected
                    ? "is-selected border-accent/35 bg-accent/10 shadow-sm"
                    : "border-transparent hover:border-border/40 hover:bg-bg-hover/70"
                }`}
                title={`Open ${displayName}`}
                aria-label={`Open ${displayName}`}
                onClick={() => onSelectApp(app.name)}
              >
                <div className="phone-app-icon relative flex h-16 w-16 items-center justify-center rounded-[1.35rem] border border-border/35 bg-card/92 shadow-sm transition-transform group-hover:scale-[1.02]">
                  {isActive ? (
                    <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full border-2 border-card bg-ok" />
                  ) : null}
                  <span className="text-xl">{getAppEmoji(app)}</span>
                </div>
                <span className="phone-app-label min-h-[2.5rem] line-clamp-2 text-[11px] font-medium leading-5 text-txt">
                  {getAppShortName(app)}
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}
