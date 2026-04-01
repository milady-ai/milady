import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "../../ui/button";
import { PagePanel } from "../page-panel";
import { TrajectoryCodeBlock } from "./trajectory-code-block";

interface CallMetricProps {
  label: React.ReactNode;
  value: React.ReactNode;
  meta?: React.ReactNode;
}

function CallMetric({ label, value, meta }: CallMetricProps) {
  return (
    <PagePanel.SummaryCard compact className="px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-txt">{value}</div>
      {meta ? <div className="mt-1 text-[11px] text-muted">{meta}</div> : null}
    </PagePanel.SummaryCard>
  );
}

export interface TrajectoryLlmCallCardProps {
  callLabel: React.ReactNode;
  copyLabel: React.ReactNode;
  copyToClipboardLabel?: string;
  costLabel: React.ReactNode;
  costValue: React.ReactNode;
  inputLabel: React.ReactNode;
  latencyLabel: React.ReactNode;
  maxLabel: React.ReactNode;
  maxValue: React.ReactNode;
  model: React.ReactNode;
  onCopy: (content: string) => void;
  outputLabel: React.ReactNode;
  purposeLabel: React.ReactNode;
  response: string;
  systemCollapseLabel: React.ReactNode;
  systemExpandLabel: React.ReactNode;
  systemLabel: React.ReactNode;
  systemLinesLabel: React.ReactNode;
  systemPrompt?: string | null;
  systemPromptButtonLabel: React.ReactNode;
  temperatureLabel: React.ReactNode;
  temperatureValue: React.ReactNode;
  tokensLabel: React.ReactNode;
  totalTokensValue: React.ReactNode;
  tokenBreakdownMeta: React.ReactNode;
  inputLinesLabel: React.ReactNode;
  outputLinesLabel: React.ReactNode;
  userPrompt: string;
}

export function TrajectoryLlmCallCard({
  callLabel,
  copyLabel,
  copyToClipboardLabel,
  costLabel,
  costValue,
  inputLabel,
  latencyLabel,
  maxLabel,
  maxValue,
  model,
  onCopy,
  outputLabel,
  purposeLabel,
  response,
  systemCollapseLabel,
  systemExpandLabel,
  systemLabel,
  systemLinesLabel,
  systemPrompt,
  systemPromptButtonLabel,
  temperatureLabel,
  temperatureValue,
  tokensLabel,
  totalTokensValue,
  tokenBreakdownMeta,
  inputLinesLabel,
  outputLinesLabel,
  userPrompt,
}: TrajectoryLlmCallCardProps) {
  const [showSystem, setShowSystem] = React.useState(false);

  return (
    <PagePanel variant="section" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-txt">{callLabel}</span>
            <span className="rounded-full border border-accent/26 bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-txt-strong">
              {model}
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted/70">
              {purposeLabel}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted">{latencyLabel}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CallMetric
          label={tokensLabel}
          value={totalTokensValue}
          meta={tokenBreakdownMeta}
        />
        <CallMetric label={costLabel} value={costValue} />
        <CallMetric label={temperatureLabel} value={temperatureValue} />
        <CallMetric label={maxLabel} value={maxValue} />
      </div>

      {systemPrompt ? (
        <div className="mt-4">
          <Button
            variant="outline"
            size="sm"
            type="button"
            className="h-9 rounded-full px-4 text-[11px]"
            onClick={() => setShowSystem((current) => !current)}
          >
            {showSystem ? (
              <ChevronDown className="mr-1.5 h-4 w-4" />
            ) : (
              <ChevronRight className="mr-1.5 h-4 w-4" />
            )}
            {systemPromptButtonLabel}
          </Button>
          {showSystem ? (
            <div className="mt-3">
              <TrajectoryCodeBlock
                content={systemPrompt}
                label={systemLabel}
                linesLabel={systemLinesLabel}
                copyLabel={copyLabel}
                copyToClipboardLabel={copyToClipboardLabel}
                collapseLabel={systemCollapseLabel}
                expandLabel={systemExpandLabel}
                onCopy={onCopy}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TrajectoryCodeBlock
          content={userPrompt}
          label={inputLabel}
          linesLabel={inputLinesLabel}
          copyLabel={copyLabel}
          copyToClipboardLabel={copyToClipboardLabel}
          collapseLabel={systemCollapseLabel}
          expandLabel={systemExpandLabel}
          onCopy={onCopy}
        />
        <TrajectoryCodeBlock
          content={response}
          label={outputLabel}
          linesLabel={outputLinesLabel}
          copyLabel={copyLabel}
          copyToClipboardLabel={copyToClipboardLabel}
          collapseLabel={systemCollapseLabel}
          expandLabel={systemExpandLabel}
          onCopy={onCopy}
        />
      </div>
    </PagePanel>
  );
}
