/**
 * Databases page — wrapper with Tables / Media / Vectors sub-tabs.
 */

import { Button } from "@miladyai/ui";
import { useApp } from "../state";
import { DatabaseView } from "./DatabaseView";
import { MediaGalleryView } from "./MediaGalleryView";
import { VectorBrowserView } from "./VectorBrowserView";

export function DatabasePageView() {
  const { t, databaseSubTab, setState } = useApp();
  const dbTabs = [
    {
      id: "tables" as const,
      label: t("databaseview.Tables"),
    },
    {
      id: "media" as const,
      label: t("settings.sections.media.label"),
    },
    {
      id: "vectors" as const,
      label: t("databasepageview.Vectors"),
    },
  ];

  const leftNav = (
    <div className="flex p-1 bg-bg/50 backdrop-blur-md border border-border/40 rounded-xl shadow-inner gap-1">
      {dbTabs.map((tab) => (
        <Button
          variant={databaseSubTab === tab.id ? "default" : "ghost"}
          size="sm"
          key={tab.id}
          className={`h-auto min-h-[1.75rem] px-4 py-1 whitespace-normal break-words text-left text-xs font-medium rounded-lg transition-all duration-300 ${
            databaseSubTab === tab.id
              ? "bg-accent text-accent-fg shadow-[0_0_15px_rgba(var(--accent),0.4)] border border-accent/50 scale-105"
              : "text-muted hover:text-txt hover:bg-bg-hover hover:border-border/50"
          }`}
          onClick={() => setState("databaseSubTab", tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Sub-tab content */}
      <div className="flex-1 min-h-0">
        {databaseSubTab === "tables" && <DatabaseView leftNav={leftNav} />}
        {databaseSubTab === "media" && <MediaGalleryView leftNav={leftNav} />}
        {databaseSubTab === "vectors" && (
          <VectorBrowserView leftNav={leftNav} />
        )}
      </div>
    </div>
  );
}
