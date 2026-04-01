/**
 * Databases page — wrapper with Tables / Media / Vectors sub-tabs.
 */

import { Button } from "@miladyai/ui";
import { useApp } from "../state";
import { DatabaseView } from "./DatabaseView";
import {
  DESKTOP_PAGE_CONTENT_CLASSNAME,
  DESKTOP_SEGMENTED_GROUP_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME,
  DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME,
  DesktopPageFrame,
} from "./desktop-surface-primitives";
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
    <div
      className={DESKTOP_SEGMENTED_GROUP_CLASSNAME}
      role="tablist"
      aria-label={t("aria.databaseViews")}
    >
      {dbTabs.map((tab) => {
        const isActive = databaseSubTab === tab.id;
        return (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            className={`${DESKTOP_SEGMENTED_ITEM_BASE_CLASSNAME} h-10 flex-1 ${
              isActive
                ? DESKTOP_SEGMENTED_ITEM_ACTIVE_CLASSNAME
                : DESKTOP_SEGMENTED_ITEM_INACTIVE_CLASSNAME
            }`}
            onClick={() => setState("databaseSubTab", tab.id)}
          >
            {tab.label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <DesktopPageFrame>
      <div
        className={`${DESKTOP_PAGE_CONTENT_CLASSNAME} flex h-full w-full min-h-0 flex-col`}
      >
        {databaseSubTab === "tables" && <DatabaseView leftNav={leftNav} />}
        {databaseSubTab === "media" && <MediaGalleryView leftNav={leftNav} />}
        {databaseSubTab === "vectors" && (
          <VectorBrowserView leftNav={leftNav} />
        )}
      </div>
    </DesktopPageFrame>
  );
}
