import { STYLE_PRESETS } from "@miladyai/shared/onboarding-presets";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  FieldMessage,
  Input,
  Textarea,
} from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AgentProvider, useAgents } from "../../lib/AgentProvider";
import type { JobStatus } from "../../lib/cloud-api";

type OnboardingStep =
  | "select"
  | "customize"
  | "creating"
  | "provisioning"
  | "done"
  | "error";

const shellPanelClassName =
  "rounded-[28px] border border-border/70 bg-surface/96 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-xl";

const fieldInputClassName =
  "rounded-xl border-border bg-dark/70 text-text-light placeholder:text-text-muted/55 focus-visible:ring-brand/35";

function getPresetSummary(preset: (typeof STYLE_PRESETS)[number]): string {
  return preset.hint || preset.bio[0] || "";
}

export function CreateAgent() {
  return (
    <AgentProvider>
      <CreateAgentInner />
    </AgentProvider>
  );
}

function CreateAgentInner() {
  const navigate = useNavigate();
  const { cloudClient } = useAgents();
  const [step, setStep] = useState<OnboardingStep>("select");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preset = STYLE_PRESETS.find((p) => p.id === selectedPreset);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearTimeout(pollRef.current);
      }
    };
  }, []);

  const handleSelect = useCallback((presetId: string) => {
    const p = STYLE_PRESETS.find((c) => c.id === presetId);
    setSelectedPreset(presetId);
    setAgentName(p?.name ?? "");
    setBio(p?.bio.join("\n\n") ?? "");
    setStep("customize");
  }, []);

  const pollJob = useCallback(
    async (jobId: string, attempt = 0) => {
      const MAX_ATTEMPTS = 60; // ~2.5 min at 2.5s intervals
      if (!cloudClient) return;
      if (attempt >= MAX_ATTEMPTS) {
        setStep("error");
        setError("Provisioning timed out. Please check the dashboard.");
        return;
      }
      try {
        const status = await cloudClient.getJobStatus(jobId);
        setJobStatus(status);
        if (status.status === "completed") {
          setStep("done");
        } else if (status.status === "failed") {
          setStep("error");
          setError(status.error ?? "Provisioning failed.");
        } else {
          pollRef.current = setTimeout(() => pollJob(jobId, attempt + 1), 2500);
        }
      } catch {
        // Network error during polling — retry with backoff
        pollRef.current = setTimeout(() => pollJob(jobId, attempt + 1), 5000);
      }
    },
    [cloudClient],
  );

  const handleDeploy = useCallback(async () => {
    if (!agentName.trim()) {
      setError("Agent name is required.");
      return;
    }
    setError(null);
    setStep("creating");
    try {
      if (!cloudClient) {
        setError("Not signed in to Eliza Cloud.");
        setStep("customize");
        return;
      }
      const result = await cloudClient.createAgent({
        name: agentName.trim(),
        config: {
          preset: selectedPreset,
          bio: bio.trim(),
        },
      });

      if (result.id) {
        setStep("provisioning");
        try {
          const provResult = await cloudClient.provisionAgent(result.id);
          if (provResult.jobId) {
            pollJob(provResult.jobId);
          } else {
            // Provisioning was synchronous
            setStep("done");
          }
        } catch {
          // Provisioning endpoint failed but agent was still created
          setStep("error");
          setError(
            "Agent was created but provisioning failed. Check the dashboard.",
          );
        }
      } else {
        setStep("error");
        setError("Agent creation did not return an ID.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep("error");
      setError(`Failed to create agent: ${msg}`);
    }
  }, [agentName, bio, selectedPreset, cloudClient, pollJob]);

  // Derive deployment progress steps for terminal display
  const getDeploySteps = () => {
    const isProvisioning = step === "provisioning";
    const isDone = step === "done";
    const jobPending = jobStatus?.status === "pending";
    const jobInProgress = jobStatus?.status === "in_progress";

    return [
      {
        id: "create",
        label: "Agent created",
        status: step === "creating" ? ("active" as const) : ("done" as const),
      },
      {
        id: "provision",
        label: "Provisioning container",
        status: isDone
          ? ("done" as const)
          : isProvisioning && jobPending
            ? ("active" as const)
            : isProvisioning
              ? ("done" as const)
              : ("pending" as const),
      },
      {
        id: "runtime",
        label: "Starting runtime",
        status: isDone
          ? ("done" as const)
          : isProvisioning && jobInProgress
            ? ("active" as const)
            : ("pending" as const),
      },
    ];
  };

  return (
    <div className="min-h-screen bg-dark text-text-light">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 pb-10 pt-[max(6rem,calc(4.5rem+var(--safe-area-top,0px)))]">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            type="button"
            onClick={() =>
              step === "select" || step === "done" || step === "error"
                ? navigate("/dashboard")
                : setStep("select")
            }
            variant="ghost"
            className="h-10 rounded-xl px-3 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
          >
            {"\u2190"} Back
          </Button>
          <div>
            <h1 className="text-lg font-medium tracking-tight">Create Agent</h1>
            <p className="mt-1 text-sm text-text-muted">
              Start from a preset, tune the personality, and deploy to Eliza
              Cloud.
            </p>
          </div>
        </div>

        {/* Step: Select character preset */}
        {step === "select" && (
          <section className={`${shellPanelClassName} space-y-6 p-6`}>
            <div className="space-y-2">
              <h2 className="text-sm font-mono uppercase tracking-[0.22em] text-text-muted">
                Choose a personality
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-text-muted">
                Pick a character preset to start with. You can customize
                everything in the next step.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {STYLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className="group rounded-2xl border border-border bg-dark/45 p-5 text-left transition-[border-color,background-color,transform] duration-200 hover:border-brand/45 hover:bg-brand/5"
                >
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <span className="text-sm font-medium text-text-light transition-colors group-hover:text-brand">
                      {p.name}
                    </span>
                    <span className="font-mono text-[11px] italic text-text-muted/45">
                      &ldquo;{p.catchphrase}&rdquo;
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-text-muted">
                    {getPresetSummary(p)}
                  </p>
                </button>
              ))}

              {/* Custom option */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPreset(null);
                  setAgentName("");
                  setBio("");
                  setStep("customize");
                }}
                className="group rounded-2xl border border-dashed border-border bg-dark/30 p-5 text-left transition-[border-color,background-color] duration-200 hover:border-brand/45 hover:bg-brand/5"
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-text-muted transition-colors group-hover:text-brand">
                    Custom
                  </span>
                  <span className="font-mono text-xs text-text-muted/40">
                    +
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-text-muted">
                  Start from scratch with your own personality
                </p>
              </button>
            </div>
          </section>
        )}

        {/* Step: Customize */}
        {step === "customize" && (
          <section className={`${shellPanelClassName} space-y-6 p-6`}>
            <div className="space-y-2">
              <h2 className="text-sm font-mono uppercase tracking-[0.22em] text-text-muted">
                Customize your agent
              </h2>
              {preset && (
                <p className="text-sm leading-relaxed text-text-muted">
                  Starting from {preset.name} preset — customize as needed.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <Field>
                <FieldLabel
                  htmlFor="agent-name"
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-subtle"
                >
                  Agent Name
                </FieldLabel>
                <Input
                  id="agent-name"
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Enter agent name"
                  className={fieldInputClassName}
                />
                <FieldDescription className="font-mono text-[11px] text-text-subtle">
                  Keep it short, recognizable, and deployment-safe.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="agent-bio"
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-subtle"
                >
                  Bio / Description
                </FieldLabel>
                <Textarea
                  id="agent-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Describe your agent's personality and purpose"
                  rows={4}
                  className={`${fieldInputClassName} min-h-[132px] resize-y px-4 py-3 font-mono`}
                />
                <FieldDescription className="font-mono text-[11px] text-text-subtle">
                  This becomes the starting personality prompt for the cloud
                  agent.
                </FieldDescription>
              </Field>
            </div>

            {error && (
              <FieldMessage
                tone="danger"
                className="font-mono text-xs"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </FieldMessage>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => setStep("select")}
                variant="outline"
                className="h-11 rounded-xl border-border bg-dark/50 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-light hover:bg-dark-secondary"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleDeploy}
                className="h-11 rounded-xl border-brand/70 bg-brand px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-dark shadow-[0_16px_40px_rgba(240,185,11,0.16)] hover:border-brand hover:bg-brand-hover"
              >
                Deploy to Cloud
              </Button>
            </div>
          </section>
        )}

        {/* Step: Creating / Provisioning — terminal deploy log */}
        {(step === "creating" || step === "provisioning") && (
          <section
            className={`${shellPanelClassName} overflow-hidden`}
            role="status"
            aria-live="polite"
          >
            {/* Terminal header bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50">
              <span className="w-2.5 h-2.5 rounded-full bg-brand animate-[status-pulse_2s_ease-in-out_infinite]" />
              <span className="font-mono text-xs text-text-muted">
                deploying...
              </span>
            </div>

            <div className="p-6 font-mono text-sm">
              <div className="text-text-muted mb-4">
                <span className="text-brand">$</span> milady deploy --name{" "}
                <span className="text-text-light">{agentName}</span>
              </div>

              <ol className="space-y-2.5" aria-label="Deployment progress">
                {getDeploySteps().map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    {s.status === "done" && (
                      <span className="text-green-500 w-4 text-center">✓</span>
                    )}
                    {s.status === "active" && (
                      <span className="text-brand w-4 text-center animate-pulse">
                        ◌
                      </span>
                    )}
                    {s.status === "pending" && (
                      <span className="text-text-subtle w-4 text-center">
                        ○
                      </span>
                    )}
                    <span
                      className={
                        s.status === "done"
                          ? "text-text-light"
                          : s.status === "active"
                            ? "text-brand"
                            : "text-text-subtle"
                      }
                    >
                      {s.label}
                      {s.status === "active" && "..."}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <section
            className={`${shellPanelClassName} overflow-hidden`}
            role="status"
            aria-live="polite"
          >
            {/* Terminal header bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="font-mono text-xs text-text-muted">
                deploy complete
              </span>
            </div>

            <div className="p-6 font-mono text-sm">
              <div className="text-text-muted mb-4">
                <span className="text-brand">$</span> milady deploy --name{" "}
                <span className="text-text-light">{agentName}</span>
              </div>

              <ol className="space-y-2.5 mb-6" aria-label="Deployment progress">
                {getDeploySteps().map((s) => (
                  <li key={s.id} className="flex items-center gap-3">
                    <span className="text-green-500 w-4 text-center">✓</span>
                    <span className="text-text-light">{s.label}</span>
                  </li>
                ))}
              </ol>

              <div className="pt-4 border-t border-border/50">
                <div className="flex items-center gap-2 text-green-500 mb-6">
                  <span>→</span>
                  <span className="text-text-light">{agentName}</span>
                  <span className="text-text-subtle">is live</span>
                </div>

                <Button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="h-11 rounded-xl border-brand/70 bg-brand px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-dark shadow-[0_16px_40px_rgba(240,185,11,0.16)] hover:border-brand hover:bg-brand-hover"
                >
                  View Dashboard
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Step: Error */}
        {step === "error" && (
          <section
            className={`${shellPanelClassName} overflow-hidden`}
            role="alert"
            aria-live="assertive"
          >
            {/* Terminal header bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-border/50">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="font-mono text-xs text-text-muted">
                deploy failed
              </span>
            </div>

            <div className="p-6 font-mono text-sm">
              <div className="text-text-muted mb-4">
                <span className="text-brand">$</span> milady deploy --name{" "}
                <span className="text-text-light">{agentName}</span>
              </div>

              <div className="text-red-500 mb-6">
                <span>ERROR:</span> {error}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    setStep("customize");
                    setError(null);
                    setJobStatus(null);
                  }}
                  variant="outline"
                  className="h-11 rounded-xl border-border bg-dark/50 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-light hover:bg-dark-secondary"
                >
                  Retry
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  variant="ghost"
                  className="h-11 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
                >
                  Dashboard
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
