/**
 * TrajectoryDetailView — detailed view of one trajectory rendered as an
 * embedded right-hand viewer.
 */

import { client, type TrajectoryDetailResult } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { PagePanel, TrajectoryLlmCallCard } from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import {
  formatTrajectoryDuration,
  formatTrajectoryTokenCount,
} from "../../utils/trajectory-format";
import { estimateTokenCost } from "../conversations/conversation-utils";

interface TrajectoryDetailViewProps {
  trajectoryId: string;
  onBack?: () => void;
}

function formatTrajectoryStepLabel(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return fallback;
  return normalized.replace(/_/g, " ");
}

function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): string {
  return estimateTokenCost(promptTokens, completionTokens, model);
}

export function TrajectoryDetailView({
  trajectoryId,
  onBack,
}: TrajectoryDetailViewProps) {
  const { t, copyToClipboard } = useApp();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<TrajectoryDetailResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getTrajectoryDetail(trajectoryId);
      setDetail(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trajectory",
      );
    } finally {
      setLoading(false);
    }
  }, [trajectoryId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (loading) {
    return (
      <PagePanel.Loading
        variant="workspace"
        heading={t("trajectorydetailview.LoadingTrajectory")}
        description={t("trajectorydetailview.LoadingDescription")}
      />
    );
  }

  if (error) {
    return (
      <PagePanel.Empty
        variant="workspace"
        title={t("trajectorydetailview.UnableToLoad")}
        description={error}
      />
    );
  }

  if (!detail) {
    return (
      <PagePanel.Empty
        variant="workspace"
        title={t("trajectorydetailview.Unavailable")}
        description={t("trajectorydetailview.TrajectoryNotFound")}
      />
    );
  }

  const { trajectory, llmCalls } = detail;
  const totalPromptTokens = llmCalls.reduce(
    (sum, call) => sum + (call.promptTokens ?? 0),
    0,
  );
  const totalCompletionTokens = llmCalls.reduce(
    (sum, call) => sum + (call.completionTokens ?? 0),
    0,
  );

  const orchestrator = trajectory.metadata?.orchestrator;
  const orchestratorData =
    orchestrator && typeof orchestrator === "object"
      ? (orchestrator as Record<string, unknown>)
      : null;

  const summaryCards = [
    {
      label: t("trajectorydetailview.Source"),
      value: trajectory.source,
    },
    {
      label: t("trajectorydetailview.Status"),
      value: trajectory.status,
    },
    {
      label: t("trajectorydetailview.Duration"),
      value: formatTrajectoryDuration(trajectory.durationMs),
    },
    {
      label: t("trajectorydetailview.TotalTokens", {
        defaultValue: "Total Tokens",
      }),
      value: formatTrajectoryTokenCount(
        totalPromptTokens + totalCompletionTokens,
        { emptyLabel: "—" },
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {orchestratorData ? (
        <PagePanel variant="section" className="p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
            {t("trajectorydetailview.Orchestrator")}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <PagePanel.SummaryCard compact className="px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                {t("trajectorydetailview.DecisionType")}
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {String(orchestratorData.decisionType ?? "—")}
              </div>
            </PagePanel.SummaryCard>
            <PagePanel.SummaryCard compact className="px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                {t("trajectorydetailview.Task")}
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {String(orchestratorData.taskLabel ?? "—")}
              </div>
            </PagePanel.SummaryCard>
            <PagePanel.SummaryCard compact className="px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                {t("trajectorydetailview.Session1")}
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-txt">
                {String(orchestratorData.sessionId ?? "—")}
              </div>
            </PagePanel.SummaryCard>
          </div>
        </PagePanel>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4 pb-1">
          {llmCalls.length === 0 ? (
            <PagePanel.Empty
              variant="surface"
              className="min-h-[18rem]"
              title={t("trajectorydetailview.NoCapturedCalls")}
              description={t("trajectorydetailview.NoLLMCallsRecorde")}
            />
          ) : (
            llmCalls.map((call, index) => (
              <TrajectoryLlmCallCard
                key={call.id}
                callLabel={`#${index + 1}`}
                model={call.model}
                purposeLabel={formatTrajectoryStepLabel(
                  call.stepType || call.purpose || call.actionType,
                  t("trajectorydetailview.Response"),
                )}
                latencyLabel={formatTrajectoryDuration(call.latencyMs)}
                tokensLabel={t("trajectorydetailview.Tokens")}
                totalTokensValue={formatTrajectoryTokenCount(
                  (call.promptTokens ?? 0) + (call.completionTokens ?? 0),
                  { emptyLabel: "—" },
                )}
                tokenBreakdownMeta={`${formatTrajectoryTokenCount(
                  call.promptTokens ?? 0,
                  { emptyLabel: "—" },
                )}↑ • ${formatTrajectoryTokenCount(call.completionTokens ?? 0, {
                  emptyLabel: "—",
                })} ↓`}
                costLabel={t("trajectorydetailview.Cost")}
                costValue={estimateCost(
                  call.promptTokens ?? 0,
                  call.completionTokens ?? 0,
                  call.model,
                )}
                temperatureLabel={t("trajectorydetailview.Temp")}
                temperatureValue={call.temperature}
                maxLabel={t("trajectorydetailview.Max")}
                maxValue={call.maxTokens > 0 ? call.maxTokens : "—"}
                systemPrompt={call.systemPrompt}
                systemPromptButtonLabel={t("trajectorydetailview.SystemPrompt")}
                systemLabel={t("trajectorydetailview.System")}
                systemLinesLabel={`${call.systemPrompt?.split("\n").length ?? 0} ${t(
                  "trajectorydetailview.lines",
                )}`}
                systemCollapseLabel={t("trajectorydetailview.Collapse", {
                  defaultValue: "Collapse",
                })}
                systemExpandLabel={t("trajectorydetailview.Expand", {
                  defaultValue: "Expand",
                })}
                inputLabel={t("trajectorydetailview.InputUser")}
                outputLabel={t("trajectorydetailview.OutputResponse")}
                inputLinesLabel={`${call.userPrompt.split("\n").length} ${t(
                  "trajectorydetailview.lines",
                )}`}
                outputLinesLabel={`${call.response.split("\n").length} ${t(
                  "trajectorydetailview.lines",
                )}`}
                tags={(call.tags ?? []).filter((tag) => tag !== "llm")}
                userPrompt={call.userPrompt}
                response={call.response}
                copyLabel={t("trajectorydetailview.Copy")}
                copyToClipboardLabel={t("trajectorydetailview.CopyToClipboard")}
                onCopy={(content) => {
                  void copyToClipboard(content);
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
