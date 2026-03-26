/**
 * TrajectoryDetailView — detailed view of one trajectory rendered as an
 * embedded right-hand viewer.
 */

import {
  client,
  type TrajectoryDetailResult,
  type TrajectoryLlmCall,
} from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { estimateTokenCost } from "./conversations/conversation-utils";
import {
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_INSET_PANEL_CLASSNAME,
  DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME,
  DESKTOP_SECTION_SHELL_CLASSNAME,
  DesktopEmptyStatePanel,
} from "./desktop-surface-primitives";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";

interface TrajectoryDetailViewProps {
  trajectoryId: string;
  onBack?: () => void;
}

function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): string {
  return estimateTokenCost(promptTokens, completionTokens, model);
}

function CodeBlock({ content, label }: { content: string; label: string }) {
  const { t, copyToClipboard } = useApp();
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n").length;
  const shouldTruncate = !expanded && lines > 20;
  const displayContent = shouldTruncate
    ? `${content.split("\n").slice(0, 20).join("\n")}\n...`
    : content;

  return (
    <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-border/20 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
            {label}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {lines} {t("trajectorydetailview.lines")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lines > 20 && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              className={`h-8 rounded-full px-3 text-[11px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded
                ? t("trajectorydetailview.Collapse", {
                    defaultValue: "Collapse",
                  })
                : t("trajectorydetailview.Expand", { defaultValue: "Expand" })}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            className={`h-8 rounded-full px-3 text-[11px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
            onClick={() => {
              void copyToClipboard(content);
            }}
            title={t("trajectorydetailview.CopyToClipboard")}
          >
            {t("trajectorydetailview.Copy")}
          </Button>
        </div>
      </div>
      <pre className="max-h-[28rem] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words px-4 py-4 text-xs leading-6 text-txt">
        {displayContent}
      </pre>
    </div>
  );
}

function LlmCallCard({
  call,
  index,
}: {
  call: TrajectoryLlmCall;
  index: number;
}) {
  const { t } = useApp();
  const [showSystem, setShowSystem] = useState(false);
  const promptTokens = call.promptTokens ?? 0;
  const completionTokens = call.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;

  return (
    <section className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-txt">#{index + 1}</span>
            <span className="rounded-full border border-accent/26 bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-txt-strong">
              {call.model}
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              {call.purpose || call.actionType || "response"}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted">
            {formatTrajectoryDuration(call.latencyMs)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
            Tokens
          </div>
          <div className="mt-2 text-sm font-semibold text-txt">
            {formatTrajectoryTokenCount(totalTokens, { emptyLabel: "—" })}
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {formatTrajectoryTokenCount(promptTokens, { emptyLabel: "—" })}↑ •{" "}
            {formatTrajectoryTokenCount(completionTokens, {
              emptyLabel: "—",
            })}{" "}
            ↓
          </div>
        </div>
        <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
            Cost
          </div>
          <div className="mt-2 text-sm font-semibold text-txt">
            {estimateCost(promptTokens, completionTokens, call.model)}
          </div>
        </div>
        <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
            Temp
          </div>
          <div className="mt-2 text-sm font-semibold text-txt">
            {call.temperature}
          </div>
        </div>
        <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
            Max
          </div>
          <div className="mt-2 text-sm font-semibold text-txt">
            {call.maxTokens > 0 ? call.maxTokens : "—"}
          </div>
        </div>
      </div>

      {call.systemPrompt ? (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className={`h-9 rounded-full px-4 text-[11px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
            onClick={() => setShowSystem((current) => !current)}
          >
            {showSystem ? (
              <ChevronDown className="mr-1.5 h-4 w-4" />
            ) : (
              <ChevronRight className="mr-1.5 h-4 w-4" />
            )}
            {t("trajectorydetailview.SystemPrompt")}
          </Button>
          {showSystem ? (
            <div className="mt-3">
              <CodeBlock
                content={call.systemPrompt}
                label={t("trajectorydetailview.System")}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <CodeBlock
          content={call.userPrompt}
          label={t("trajectorydetailview.InputUser")}
        />
        <CodeBlock
          content={call.response}
          label={t("trajectorydetailview.OutputResponse")}
        />
      </div>
    </section>
  );
}

export function TrajectoryDetailView({
  trajectoryId,
  onBack,
}: TrajectoryDetailViewProps) {
  const { t } = useApp();
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
      <DesktopEmptyStatePanel
        className="min-h-[22rem]"
        description="Pulling prompt, response, token, and metadata detail for the selected run."
        title={t("trajectorydetailview.LoadingTrajectory")}
      />
    );
  }

  if (error) {
    return (
      <DesktopEmptyStatePanel
        className="min-h-[22rem] border-danger/25 bg-danger/10 text-danger"
        description={error}
        title="Unable to load trajectory"
      />
    );
  }

  if (!detail) {
    return (
      <DesktopEmptyStatePanel
        className="min-h-[22rem]"
        description={t("trajectorydetailview.TrajectoryNotFound")}
        title="Trajectory unavailable"
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className={DESKTOP_PADDED_SURFACE_PANEL_CLASSNAME}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
              Trajectory
            </div>
            <div className="mt-2 text-[1.8rem] font-semibold leading-tight text-txt">
              {formatTrajectoryTimestamp(trajectory.createdAt, "detailed")}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              Review the exact prompt and response chain for this run, including
              cost, latency, source, and any orchestration context captured with
              the call.
            </p>
          </div>
          {onBack ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onBack}
              className={`h-9 rounded-full px-4 text-[11px] ${DESKTOP_CONTROL_SURFACE_CLASSNAME}`}
            >
              {t("onboarding.back")}
            </Button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              Source
            </div>
            <div className="mt-2 text-sm font-semibold text-txt">
              {trajectory.source}
            </div>
          </div>
          <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              Status
            </div>
            <div className="mt-2 text-sm font-semibold text-txt">
              {trajectory.status}
            </div>
          </div>
          <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              Duration
            </div>
            <div className="mt-2 text-sm font-semibold text-txt">
              {formatTrajectoryDuration(trajectory.durationMs)}
            </div>
          </div>
          <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-4`}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              Total Tokens
            </div>
            <div className="mt-2 text-sm font-semibold text-txt">
              {formatTrajectoryTokenCount(
                totalPromptTokens + totalCompletionTokens,
                { emptyLabel: "—" },
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border/28 bg-bg/55 px-3 py-1 text-[11px] font-medium text-muted">
            {llmCalls.length} LLM calls
          </span>
          <span className="rounded-full border border-border/28 bg-bg/55 px-3 py-1 text-[11px] font-mono text-muted">
            {trajectory.id}
          </span>
        </div>
      </section>

      {orchestratorData ? (
        <section className={`${DESKTOP_SECTION_SHELL_CLASSNAME} p-5`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
            Orchestrator
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                Decision Type
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {String(orchestratorData.decisionType ?? "—")}
              </div>
            </div>
            <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                Task
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {String(orchestratorData.taskLabel ?? "—")}
              </div>
            </div>
            <div className={`${DESKTOP_INSET_PANEL_CLASSNAME} px-4 py-3`}>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
                Session
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-txt">
                {String(orchestratorData.sessionId ?? "—")}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4 pb-1">
          {llmCalls.length === 0 ? (
            <DesktopEmptyStatePanel
              className="min-h-[18rem]"
              description={t("trajectorydetailview.NoLLMCallsRecorde")}
              title="No captured calls"
            />
          ) : (
            llmCalls.map((call, index) => (
              <LlmCallCard key={call.id} call={call} index={index} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
