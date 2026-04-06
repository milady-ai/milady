import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  client,
  type HyperscapeAvailableGoal,
  type HyperscapeEmbeddedAgent,
  type HyperscapeGoalState,
  type HyperscapeInventoryItem,
  type HyperscapeNearbyLocation,
  type HyperscapePosition,
  type HyperscapeQuickCommand,
  type HyperscapeQuickActionsResponse,
} from "../../../api";
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

function formatPosition(position: HyperscapePosition | null): string {
  if (!position) return "Position unavailable";
  if (Array.isArray(position)) {
    return `(${position[0].toFixed(1)}, ${position[1].toFixed(1)}, ${position[2].toFixed(1)})`;
  }
  return `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`;
}

function summarizeGoal(goal: HyperscapeGoalState | null): string {
  if (!goal) return "No active goal reported.";
  const description = goal.description?.trim();
  if (description) {
    return goal.progressPercent != null
      ? `${description} (${goal.progressPercent.toFixed(0)}%)`
      : description;
  }
  if (goal.type) {
    return goal.progressPercent != null
      ? `${goal.type} (${goal.progressPercent.toFixed(0)}%)`
      : goal.type;
  }
  return "Goal state received.";
}

function formatNumeric(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "Unknown";
  return value.toFixed(0);
}

export function HyperscapeDetailExtension({ app }: AppDetailExtensionProps) {
  const { appRuns } = useApp();
  const { run, matchingRuns } = useMemo(
    () => selectLatestRunForApp(app.name, appRuns),
    [app.name, appRuns],
  );

  const [embeddedAgents, setEmbeddedAgents] = useState<HyperscapeEmbeddedAgent[]>(
    [],
  );
  const [activeAgent, setActiveAgent] =
    useState<HyperscapeEmbeddedAgent | null>(null);
  const [goal, setGoal] = useState<HyperscapeGoalState | null>(null);
  const [availableGoals, setAvailableGoals] = useState<HyperscapeAvailableGoal[]>(
    [],
  );
  const [quickCommands, setQuickCommands] = useState<HyperscapeQuickCommand[]>(
    [],
  );
  const [nearbyLocations, setNearbyLocations] = useState<HyperscapeNearbyLocation[]>(
    [],
  );
  const [inventory, setInventory] = useState<HyperscapeInventoryItem[]>([]);
  const [playerPosition, setPlayerPosition] =
    useState<[number, number, number] | null>(null);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingCommand, setSendingCommand] = useState<string | null>(null);

  const session = run?.session ?? null;
  const agentIdentifier = session?.agentId ?? null;
  const characterIdentifier = session?.characterId ?? null;
  const controlCharacterId =
    activeAgent?.characterId ?? characterIdentifier ?? null;

  const refreshSurface = useCallback(async () => {
    if (!run) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const embedded = await client.listHyperscapeEmbeddedAgents();
      const agents = Array.isArray(embedded.agents) ? embedded.agents : [];
      setEmbeddedAgents(agents);

      const nextActiveAgent =
        agents.find(
          (candidate) =>
            candidate.agentId === agentIdentifier ||
            candidate.characterId === characterIdentifier,
        ) ?? null;
      setActiveAgent(nextActiveAgent);

      if (!nextActiveAgent) {
        setGoal(null);
        setAvailableGoals([]);
        setQuickCommands([]);
        setNearbyLocations([]);
        setInventory([]);
        setPlayerPosition(null);
        setStatusMessage(
          "Waiting for the embedded Hyperscape agent to connect.",
        );
        return;
      }

      const [goalResponse, quickActionsResponse] = await Promise.all([
        client.getHyperscapeAgentGoal(nextActiveAgent.agentId),
        client.getHyperscapeAgentQuickActions(nextActiveAgent.agentId),
      ]);

      const quickActions = quickActionsResponse as HyperscapeQuickActionsResponse;
      setGoal(goalResponse.goal);
      setAvailableGoals(
        Array.isArray(goalResponse.availableGoals)
          ? goalResponse.availableGoals
          : Array.isArray(quickActions.availableGoals)
            ? quickActions.availableGoals
            : [],
      );
      setQuickCommands(
        Array.isArray(quickActions.quickCommands)
          ? quickActions.quickCommands
          : [],
      );
      setNearbyLocations(
        Array.isArray(quickActions.nearbyLocations)
          ? quickActions.nearbyLocations
          : [],
      );
      setInventory(Array.isArray(quickActions.inventory) ? quickActions.inventory : []);
      setPlayerPosition(quickActions.playerPosition ?? null);
      setStatusMessage(
        goalResponse.message ??
          quickActions.message ??
          "Hyperscape operator surface refreshed.",
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Failed to load the Hyperscape operator surface.",
      );
    } finally {
      setLoading(false);
    }
  }, [agentIdentifier, characterIdentifier, run]);

  useEffect(() => {
    void refreshSurface();
  }, [refreshSurface]);

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => {
      void refreshSurface();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshSurface, run]);

  const handleSendMessage = useCallback(async () => {
    const content = operatorMessage.trim();
    if (!run || !activeAgent?.agentId || content.length === 0 || sending) return;

    setSending(true);
    setStatusMessage(null);
    try {
      const response = await client.sendHyperscapeAgentMessage(
        activeAgent.agentId,
        content,
      );
      setOperatorMessage("");
      setStatusMessage(response.message ?? "Operator message sent.");
      await refreshSurface();
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Failed to send the Hyperscape operator message.",
      );
    } finally {
      setSending(false);
    }
  }, [activeAgent?.agentId, operatorMessage, refreshSurface, run, sending]);

  const handleRunControl = useCallback(
    async (action: "pause" | "resume") => {
      if (!run) return;
      setStatusMessage(null);
      try {
        if (controlCharacterId) {
          await client.controlHyperscapeEmbeddedAgent(controlCharacterId, action);
        } else if (session?.sessionId) {
          await client.controlAppSession(app.name, session.sessionId, action);
        }
        await refreshSurface();
        setStatusMessage(
          action === "pause"
            ? "Hyperscape session paused."
            : "Hyperscape session resumed.",
        );
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : `Failed to ${action} the Hyperscape session.`,
        );
      }
    },
    [app.name, controlCharacterId, refreshSurface, run, session?.sessionId],
  );

  const handleQuickCommand = useCallback(
    async (command: HyperscapeQuickCommand) => {
      if (!run || !controlCharacterId || sendingCommand) return;

      setSendingCommand(command.id);
      setStatusMessage(null);
      try {
        await client.sendHyperscapeEmbeddedAgentCommand(
          controlCharacterId,
          command.command,
        );
        setStatusMessage(
          `${command.label} sent to the embedded Hyperscape agent.`,
        );
        await refreshSurface();
      } catch (error) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Failed to send the Hyperscape quick command.",
        );
      } finally {
        setSendingCommand(null);
      }
    },
    [controlCharacterId, refreshSurface, run, sendingCommand],
  );

  if (!run) {
    return (
      <SurfaceEmptyState
        title="Hyperscape embedded control"
        body="Launch Hyperscape to see the embedded agent-control surface, live goal state, and steering shortcuts here."
      />
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Hyperscape Embedded Control
        </div>
        <SurfaceBadge tone={toneForStatusText(run.status)}>{run.status}</SurfaceBadge>
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

      <SurfaceSection title="Live Agent">
        <SurfaceGrid>
          <SurfaceCard
            label="Embedded Agent"
            value={activeAgent?.name ?? "Waiting for agent"}
            subtitle={
              activeAgent
                ? `${activeAgent.state} · ${activeAgent.scriptedRole ?? "unassigned"}`
                : "The embedded agent has not announced itself yet."
            }
          />
          <SurfaceCard
            label="Identity"
            value={activeAgent?.characterId ?? characterIdentifier ?? "Unknown"}
            subtitle={
              activeAgent?.agentId
                ? `Agent ${activeAgent.agentId}`
                : agentIdentifier
                  ? `Session agent ${agentIdentifier}`
                  : undefined
            }
          />
          <SurfaceCard
            label="World Position"
            value={formatPosition(activeAgent?.position ?? playerPosition)}
            subtitle={
              activeAgent?.entityId
                ? `Entity ${activeAgent.entityId}`
                : "Entity not resolved yet."
            }
          />
          <SurfaceCard
            label="Health"
            value={
              activeAgent?.health != null && activeAgent?.maxHealth != null
                ? `${activeAgent.health}/${activeAgent.maxHealth}`
                : "Unknown"
            }
            subtitle={
              activeAgent?.lastActivity != null
                ? `Last activity ${formatDetailTimestamp(activeAgent.lastActivity)}`
                : "Activity will appear once the agent is live."
            }
          />
        </SurfaceGrid>
      </SurfaceSection>

      <SurfaceSection title="Goal & Recovery">
        <SurfaceGrid>
          <SurfaceCard
            label="Goal"
            value={summarizeGoal(goal)}
            subtitle={
              goal?.progressPercent != null
                ? `Progress ${goal.progressPercent.toFixed(0)}%`
                : undefined
            }
          />
          <SurfaceCard
            label="Available Goals"
            value={
              availableGoals.length > 0
                ? availableGoals
                    .slice(0, 3)
                    .map((candidate) => candidate.type)
                    .join(" · ")
                : "No alternate goals available."
            }
            subtitle={
              availableGoals.length > 0
                ? availableGoals
                    .slice(0, 3)
                    .map((candidate) => `#${candidate.priority}`)
                    .join(" ")
                : undefined
            }
          />
          <SurfaceCard
            label="Session State"
            value={session?.status ?? "Waiting"}
            subtitle={
              session?.summary ?? run.summary ?? "No session summary available."
            }
          />
          <SurfaceCard
            label="Viewer"
            value={
              run.viewer?.embedParams?.surface === "agent-control"
                ? "Embedded agent-control surface"
                : "Embedded viewer requested"
            }
            subtitle={
              run.viewer?.url
                ? `Auth ${run.viewer.postMessageAuth ? "enabled" : "manual"} · ${run.viewer.url}`
                : "Viewer URL unavailable."
            }
          />
        </SurfaceGrid>
        <div className="flex flex-wrap gap-2">
          {session?.controls?.includes("pause") ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={() => void handleRunControl("pause")}
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
              onClick={() => void handleRunControl("resume")}
            >
              Resume session
            </Button>
          ) : null}
        </div>
      </SurfaceSection>

      <SurfaceSection title="Quick Actions">
        {quickCommands.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-bg/60 px-3 py-2 text-[11px] italic text-muted">
            No quick commands have been published yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {quickCommands.map((command) => (
              <Button
                key={command.id}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl px-3 shadow-sm"
                disabled={!command.available || sendingCommand === command.id}
                onClick={() => void handleQuickCommand(command)}
                title={command.reason ?? command.command}
              >
                {sendingCommand === command.id ? "Sending..." : command.label}
              </Button>
            ))}
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          <SurfaceCard
            label="Nearby Locations"
            value={
              nearbyLocations.length > 0
                ? nearbyLocations
                    .slice(0, 3)
                    .map((location) => `${location.name} (${formatNumeric(location.distance)})`)
                    .join(" · ")
                : "No nearby locations yet."
            }
          />
          <SurfaceCard
            label="Inventory"
            value={
              inventory.length > 0
                ? inventory
                    .slice(0, 4)
                    .map((item) => `${item.name} ×${item.quantity}`)
                    .join(" · ")
                : "Inventory is empty or unavailable."
            }
          />
        </div>
      </SurfaceSection>

      <SurfaceSection title="Operator Chat">
        <div className="space-y-2">
          {activeAgent ? (
            <SurfaceCard
              label="Live Agent"
              value={activeAgent.name}
              subtitle={
                activeAgent.error
                  ? activeAgent.error
                  : activeAgent.lastActivity != null
                    ? `Last activity ${formatDetailTimestamp(activeAgent.lastActivity)}`
                    : "Agent is live and waiting."
              }
            />
          ) : (
            <div className="rounded-xl border border-border/30 bg-bg/60 px-3 py-2 text-[11px] italic text-muted">
              Waiting for the live Hyperscape agent before enabling chat.
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={operatorMessage}
              onChange={(event) => setOperatorMessage(event.target.value)}
              placeholder="Tell the agent what to do, what to avoid, or what to explain."
              className="min-h-11 rounded-xl"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              disabled={!activeAgent?.agentId}
            />
            <Button
              type="button"
              className="min-h-11 rounded-xl px-4 shadow-sm"
              onClick={() => void handleSendMessage()}
              disabled={
                sending || !activeAgent?.agentId || operatorMessage.trim().length === 0
              }
            >
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
      </SurfaceSection>

      {statusMessage ? (
        <div className="rounded-2xl border border-border/35 bg-card/70 px-4 py-3 text-[11px] leading-5 text-muted-strong">
          {statusMessage}
        </div>
      ) : null}
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
        Use the embedded agent-control viewer for the live world and this pane
        for recovery, telemetry, and steering shortcuts.
      </div>
    </section>
  );
}
