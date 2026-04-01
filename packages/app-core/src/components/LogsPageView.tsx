import { PageLayoutHeader } from "@miladyai/ui";
import type { ReactNode } from "react";
import { useApp } from "../state";
import { LogsView } from "./LogsView";

export function LogsPageView({
  contentHeader,
}: {
  contentHeader?: ReactNode;
} = {}) {
  const { t } = useApp();
  return (
    <div className="flex flex-col h-full">
      {contentHeader ? (
        <PageLayoutHeader>{contentHeader}</PageLayoutHeader>
      ) : null}
      <h2 className="text-lg font-bold mb-1">{t("bugreportmodal.Logs")}</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">
        {t("logspageview.AgentRuntimeLogsW")}
      </p>
      <div className="flex-1 min-h-0">
        <LogsView />
      </div>
    </div>
  );
}
