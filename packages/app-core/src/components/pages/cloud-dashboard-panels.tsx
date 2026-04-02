import { Button, SectionCard } from "@miladyai/ui";
import { ExternalLink, Loader2, Terminal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type CloudCompatAgent, client } from "../../api";
import { useIntervalWhenDocumentVisible } from "../../hooks/useDocumentVisibility";
import { getVrmPreviewUrl, useApp } from "../../state";
import { STATUS_BADGE } from "./cloud-dashboard-utils";

export function AgentStatusBadge({ status }: { status: string }) {
  const { t } = useApp();
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.stopped;
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${badge?.className}`}
    >
      {t(badge?.i18nKey)}
    </span>
  );
}

export function CloudAgentCard({
  agent,
  onDelete,
  deleting,
  launching,
  onLaunch,
  onOpenUI,
  openingUI,
  onSelect,
  selected = false,
}: {
  agent: CloudCompatAgent;
  onDelete: (id: string) => void;
  deleting: boolean;
  launching: boolean;
  onLaunch: (id: string) => void;
  onOpenUI: (id: string) => void;
  openingUI: boolean;
  onSelect?: (id: string) => void;
  selected?: boolean;
}) {
  const { t } = useApp();
  return (
    // biome-ignore lint/a11y/useSemanticElements: cannot use button due to nested buttons
    <div
      className={`flex cursor-pointer flex-col justify-between gap-4 rounded-2xl border p-5 transition-all duration-200 ${
        selected
          ? "border-accent/45 bg-accent/8 shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.12),0_14px_30px_rgba(0,0,0,0.12)]"
          : "border-border/60 bg-card/88 shadow-sm hover:border-accent/30"
      }`}
      onClick={() => onSelect?.(agent.agent_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(agent.agent_id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {(() => {
            const agentName = agent.agent_name ?? "";
            const avatarIndex =
              (agentName
                .split("")
                .reduce((acc, c) => acc + c.charCodeAt(0), 0) %
                8) +
              1;
            return (
              <img
                src={getVrmPreviewUrl(avatarIndex)}
                alt={agentName}
                className="w-7 h-7 rounded-full object-cover shrink-0 border border-border/40"
              />
            );
          })()}
          <span className="max-w-[16rem] truncate text-sm font-bold text-txt-strong">
            {agent.agent_name || t("elizaclouddashboard.unnamedAgent")}
          </span>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>

      <div className="space-y-1 text-[11px] text-muted">
        <div className="flex items-center justify-between gap-3">
          <span>{t("elizaclouddashboard.node")}</span>
          <span className="truncate font-mono text-txt-strong/70">
            {agent.node_id?.slice(0, 8) ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>{t("elizaclouddashboard.created")}</span>
          <span className="text-right text-txt-strong/70">
            {new Date(agent.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1 rounded-xl border-border/40 text-xs"
          onClick={(event) => {
            event.stopPropagation();
            onLaunch(agent.agent_id);
          }}
          disabled={launching}
        >
          {launching ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <ExternalLink className="w-3 h-3 mr-1" />
          )}
          {t("elizaclouddashboard.open")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-xl border-danger/30 px-0 text-xs text-danger hover:bg-danger/10 sm:w-10"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(agent.agent_id);
          }}
          disabled={deleting || launching}
        >
          {deleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface StatusDetail {
  status?: string;
  databaseStatus?: string;
  lastHeartbeat?: string | number | Date | null;
}

export function AgentDetailSidebar({
  agent,
  onClose,
}: {
  agent: CloudCompatAgent | undefined;
  onClose: () => void;
}) {
  const { t } = useApp();
  const [logs, setLogs] = useState<string>("");
  const [statusDetail, setStatusDetail] = useState<StatusDetail | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchDetails = useCallback(async () => {
    if (!agent) return;
    try {
      const [statusRes, logsRes] = await Promise.all([
        client.getCloudCompatAgentStatus(agent.agent_id),
        client.getCloudCompatAgentLogs(agent.agent_id, 100),
      ]);

      if (!aliveRef.current) return;
      setStatusDetail(statusRes.data);
      setLogs(typeof logsRes.data === "string" ? logsRes.data : "");
    } catch {
      // Silently retry next tick
    }
  }, [agent]);

  useEffect(() => {
    void fetchDetails();
  }, [fetchDetails]);

  useIntervalWhenDocumentVisible(
    () => {
      void fetchDetails();
    },
    5000,
    Boolean(agent),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: rerun when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!agent) return null;

  return (
    <div className="space-y-4 animate-in slide-in-from-right-8 duration-300">
      <SectionCard
        title={t("elizaclouddashboard.agentDetails")}
        className="relative overflow-hidden rounded-3xl border-accent/30 bg-card/92 shadow-sm backdrop-blur-xl"
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 p-1 rounded-full text-muted hover:text-txt-strong"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                {t("elizaclouddashboard.Status", {
                  defaultValue: "Status",
                })}
              </span>
              <AgentStatusBadge status={statusDetail?.status || agent.status} />
            </div>
            <div className="rounded-xl border border-border/40 bg-bg/40 p-3">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                {t("elizaclouddashboard.DatabaseStatus", {
                  defaultValue: "DB Status",
                })}
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.databaseStatus || agent.database_status || "—"}
              </span>
            </div>
            <div className="rounded-xl border border-border/40 bg-bg/40 p-3 sm:col-span-2">
              <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-1 block">
                {t("elizaclouddashboard.Heartbeat", {
                  defaultValue: "Heartbeat",
                })}
              </span>
              <span className="text-xs font-mono">
                {statusDetail?.lastHeartbeat
                  ? new Date(statusDetail.lastHeartbeat).toLocaleString()
                  : agent.last_heartbeat_at
                    ? new Date(agent.last_heartbeat_at).toLocaleString()
                    : t("elizaclouddashboard.NoHeartbeatYet", {
                        defaultValue: "No heartbeat yet",
                      })}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-bg/80 p-3">
            <span className="text-[10px] text-muted uppercase font-bold tracking-wider mb-2 flex items-center gap-2">
              <Terminal className="w-3 h-3" />{" "}
              {t("elizaclouddashboard.LiveLogs", {
                defaultValue: "Live Logs",
              })}
            </span>
            <div className="custom-scrollbar h-64 overflow-y-auto rounded-lg border border-border/30 bg-bg/65 p-3">
              <pre className="text-[10px] font-mono text-txt-strong/85 whitespace-pre-wrap break-all">
                {logs ||
                  t("elizaclouddashboard.NoLogsAvailableDeploying", {
                    defaultValue: "No logs available. Deploying...",
                  })}
                <div ref={logsEndRef} />
              </pre>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
