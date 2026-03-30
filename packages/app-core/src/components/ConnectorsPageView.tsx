/**
 * Connectors page — curated connector view with AI model config.
 */

import { SectionCard } from "@miladyai/ui";
import { DESKTOP_SURFACE_PANEL_CLASSNAME } from "./desktop-surface-primitives";
import { PluginsView } from "./PluginsView";
import { ProviderSwitcher } from "./ProviderSwitcher";
import { useApp } from "../state";

export function ConnectorsPageView({ inModal }: { inModal?: boolean } = {}) {
  const { t } = useApp();
  return (
    <div className="flex flex-col h-full">
      <PluginsView
        mode="social"
        inModal={inModal ?? false}
        headerSlot={
          <SectionCard
            id="ai-model"
            title={t("settings.sections.aimodel.label")}
            description={t("settings.sections.aimodel.desc")}
            className={`overflow-visible ${DESKTOP_SURFACE_PANEL_CLASSNAME}`}
          >
            <ProviderSwitcher />
          </SectionCard>
        }
      />
    </div>
  );
}
