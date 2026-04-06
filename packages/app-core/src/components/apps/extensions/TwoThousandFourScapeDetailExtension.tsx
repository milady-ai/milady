import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type AppSessionJsonValue } from "../../../api";
import { useApp } from "../../../state";
import {
  formatDetailTimestamp,
  selectLatestRunForApp,
  SurfaceBadge,
  SurfaceCard,
  SurfaceEmptyState,
  SurfaceGrid,
  SurfaceSection,
  toneForHealthState,
  toneForStatusText,
  toneForViewerAttachment,
} from "./surface";
import type { AppDetailExtensionProps } from "./types";

interface RecentActivityEntry {
  action?: string;
  detail?: string;
  ts?: string | number;
}

function formatTelemetryValue(value: AppSessionJsonValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? `${value}` : "Unknown";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "Unavailable";
  if (Array.isArray(value)) return `${value.length} entries`;
  return "Structured telemetry";
}

function extractRecentActivity(
  telemetry: Record<string, AppSessionJsonValue> | null | undefined,
): RecentActivityEntry[] {
  const recentActivity = telemetry?.recentActivity;
  if (!Array.isArray(recentActivity)) return [];
  const entries: Array<RecentActivityEntry | null> = recentActivity.map(
    (entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return null;
      const record = entry as Record<string, AppSessionJsonValue>;
      const normalizedEntry: RecentActivityEntry = {
        action: typeof record.action === "string" ? record.action : undefined,
        detail: typeof record.detail === "string" ? record.detail : undefined,
        ts:
          typeof record.ts === "string" || typeof record.ts === "number"
            ? record.ts
            : undefined,
      };
      return normalizedEntry;
    },
  );
  return entries
    .filter((entry): entry is RecentActivityEntry => entry !== null)
    .slice(-4)
    .reverse();
}

export function TwoThousandFourScapeDetailExtension({
  app,
}: AppDetailExtensionProps) {
  const { appRuns } = useApp();
  const { run, matchingRuns } = useMemo(
    () => selectLatestRunForApp(app.name, appRuns),
    [app.name, appRuns],
  );
  const [operatorMessage, setOperatorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const session = run?.session ?? null;
  const telemetry =
    session?.telemetry && typeof session.telemetry === "object"
      ? session.telemetry
      : null;
  const recentActivity = extractRecentActivity(telemetry);
  const autoLoginLabel = run?.viewer?.postMessageAuth
    ? `Auto-login ${run.viewer.authMessage?.type ?? "configured"}`
    : "Manual login required";

  const handleSendMessage = useCallback(async () => {
    const content = operatorMessage.trim();
    if (!run || !session?.sessionId || content.length === 0 || sending) return;

    setSending(true);
    setStatusMessage(null);
    try {
      const response = await client.sendAppSessionMessage(
        app.name,
        session.sessionId,
        content,
      );
      setOperatorMessage("");
      setStatusMessage(response.message ?? "Operator message sent.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Failed to send the 2004scape operator message.",
      );
    } finally {
      setSending(false);
    }
  }, [app.name, operatorMessage, run, session?.sessionId, sending]);

  const handleControl = useCallback(
    async (action: "pause" | "resume") => {
      if (!run || !session?.sessionId) return;
      setStatusMessage(null);
      try {
        const response = await client.controlAppSession(
          app.name,
          session.sessionId,
          action,
        );
        setStatusMessage(
          response.message ??
            (action === "pause"
              ? "2004scape session paused."
              : "2004scape session resumed."),
        );
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : `Failed to ${action} the 2004scape session.`,
        );
      }
    },
    [app.name, run, session?.sessionId],
  );

  if (!run) {
    return (
      <SurfaceEmptyState
        title="2004scape operator surface"
        body="Launch 2004scape to verify auto-login, background runtime, and the live agent loop here."
      />
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          2004scape Operator Surface
        </div>
        <SurfaceBadge tone={toneForStatusText(run.status)}>
          {run.status}
        </SurfaceBadge>
        <SurfaceBadge tone={toneForViewerAttachment(run.viewerAttachment)}>
          {run.viewerAttachment}
        </SurfaceBadge>
        <SurfaceBadge tone={toneForHealthState(run.health.state)}>
          {run.health.state}
        </SurfaceBadge>
        <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted">
          {matchingRuns.length} active run{matchingRuns.length === 1 ? "" : "s"}
        </span>
      </div>

      <SurfaceSection title="Login & Runtime">
        <SurfaceGrid>
          <SurfaceCard
            label="Auto-login"
            value={autoLoginLabel}
            subtitle={
              run.viewer?.url
                ? `Viewer ${run.viewer.url}`
                : "Viewer URL unavailable."
            }
          />
          <SurfaceCard
            label="Runtime"
            value={
              run.supportsBackground
                ? "Continuously running service"
                : "Foreground session only"
            }
            subtitle={
              session?.status ??
              run.summary ??
              "Waiting for the 2004scape runtime to respond."
            }
          />
          <SurfaceCard
            label="Command Bridge"
            value={
              session?.canSendCommands
                ? "Operator chat is live."
                : "Waiting for command bridge."
            }
            subtitle={session?.sessionId ?? "No session yet."}
          />
          <SurfaceCard
            label="Identity"
            value={session?.characterId ?? "Character not resolved"}
            subtitle={
              session?.agentId
                ? `Agent ${session.agentId}`
                : "The agent identity will appear once the session is attached."
            }
          />
        </SurfaceGrid>
      </SurfaceSection>

      <SurfaceSection title="Current State">
        <SurfaceGrid>
          <SurfaceCard
            label="Goal"
            value={session?.goalLabel ?? "No goal recorded."}
            subtitle={
              session?.summary ?? run.summary ?? "No session summary yet."
            }
          />
          <SurfaceCard
            label="Follow Target"
            value={session?.followEntity ?? "No follow target."}
            subtitle={
              session?.controls?.length
                ? `Controls: ${session.controls.join(" · ")}`
                : "No direct control actions exposed yet."
            }
          />
          <SurfaceCard
            label="Last Heartbeat"
            value={formatDetailTimestamp(run.lastHeartbeatAt ?? run.updatedAt)}
            subtitle={`Started ${formatDetailTimestamp(run.startedAt)}`}
          />
          <SurfaceCard
            label="Viewer Attachment"
            value={run.viewerAttachment}
            subtitle={
              run.viewer?.authMessage?.type
                ? `Auth ${run.viewer.authMessage.type}`
                : undefined
            }
          />
        </SurfaceGrid>
        {recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((entry, index) => (
              <div
                key={`${entry.action ?? "activity"}-${index}`}
                className="rounded-xl border border-border/30 bg-bg/60 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-[11px] font-medium text-txt">
                  <span>{entry.action ?? "activity"}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted">
                    {formatDetailTimestamp(entry.ts)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] leading-5 text-muted-strong">
                  {entry.detail ?? "No detail captured."}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border/30 bg-bg/60 px-3 py-2 text-[11px] italic text-muted">
            No recent gameplay activity has been captured yet.
          </div>
        )}
      </SurfaceSection>

      {session?.suggestedPrompts?.length ? (
        <SurfaceSection title="Suggested Prompts">
          <div className="flex flex-wrap gap-2">
            {session.suggestedPrompts.map((prompt) => (
              <span
                key={prompt}
                className="inline-flex max-w-full items-center rounded-full border border-border/30 bg-bg/75 px-2 py-0.5 text-[10px] text-muted-strong"
              >
                {prompt}
              </span>
            ))}
          </div>
        </SurfaceSection>
      ) : null}

      <SurfaceSection title="Telemetry">
        <div className="grid gap-2 md:grid-cols-2">
          <SurfaceCard
            label="Status Fields"
            value={[
              `status: ${formatTelemetryValue(session?.status)}`,
              `summary: ${formatTelemetryValue(session?.summary)}`,
              `goalLabel: ${formatTelemetryValue(session?.goalLabel)}`,
              `characterId: ${formatTelemetryValue(session?.characterId)}`,
            ].join(" · ")}
          />
          <SurfaceCard
            label="Configured Notes"
            value={[
              `viewer: ${formatTelemetryValue(run.viewer?.url)}`,
              `postMessageAuth: ${run.viewer?.postMessageAuth ? "true" : "false"}`,
              `supportsBackground: ${run.supportsBackground ? "true" : "false"}`,
            ].join(" · ")}
          />
        </div>
      </SurfaceSection>

      <SurfaceSection title="Steering">
        <div className="flex flex-wrap gap-2">
          {session?.controls?.includes("pause") ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={() => void handleControl("pause")}
            >
              Pause session
            </Button>
          ) : null}
          {session?.controls?.includes("resume") ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={() => void handleControl("resume")}
            >
              Resume session
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={operatorMessage}
            onChange={(event) => setOperatorMessage(event.target.value)}
            placeholder="Tell the bot what to do, what to avoid, or what to explain."
            className="min-h-11 rounded-xl"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSendMessage();
              }
            }}
            disabled={!session?.sessionId}
          />
          <Button
            type="button"
            className="min-h-11 rounded-xl px-4 shadow-sm"
            onClick={() => void handleSendMessage()}
            disabled={
              sending ||
              !session?.sessionId ||
              operatorMessage.trim().length === 0
            }
          >
            {sending ? "Sending" : "Send"}
          </Button>
        </div>
      </SurfaceSection>

      {statusMessage ? (
        <div className="rounded-2xl border border-border/35 bg-card/70 px-4 py-3 text-[11px] leading-5 text-muted-strong">
          {statusMessage}
        </div>
      ) : null}
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
        2004scape runtime ready for verification.
      </div>
    </section>
  );
}
