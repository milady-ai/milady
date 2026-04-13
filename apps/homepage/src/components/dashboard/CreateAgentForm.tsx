import {
  Button,
  cn,
  Field,
  FieldDescription,
  FieldLabel,
  FieldMessage,
  Input,
} from "@elizaos/app-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../../lib/auth";
import { CloudClient, type JobStatus } from "../../lib/cloud-api";
import {
  MIN_DEPOSIT_DISPLAY,
  PRICE_IDLE_PER_HR,
  PRICE_RUNNING_PER_HR,
} from "../../lib/pricing-constants";
import { useCloudLogin } from "./useCloudLogin";

interface CreateAgentFormProps {
  onAuthenticated?: () => void;
  onCreated: () => void;
  onCancel: () => void;
}

type CreateStep = "form" | "creating" | "provisioning" | "done" | "error";

interface DeployStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

interface EnvVarRow {
  id: string;
  key: string;
  value: string;
}

const terminalPrimaryButtonClassName =
  "h-11 border-brand/70 bg-brand !text-[#08080a] font-mono text-xs font-semibold uppercase tracking-[0.18em] hover:border-brand hover:bg-brand-hover";

const terminalSecondaryButtonClassName =
  "h-11 border-border bg-dark/55 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-light hover:border-brand/30 hover:bg-dark-secondary";

const terminalInputClassName =
  "h-11 border-border bg-dark/80 px-4 font-mono text-sm text-text-light placeholder:text-text-muted/65 focus-visible:ring-brand/35";

export function CreateAgentForm({
  onAuthenticated,
  onCreated,
  onCancel,
}: CreateAgentFormProps) {
  const [name, setName] = useState("");
  const [envVars, setEnvVars] = useState<EnvVarRow[]>([]);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [step, setStep] = useState<CreateStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [_createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressHeadingRef = useRef<HTMLSpanElement>(null);
  const errorHeadingRef = useRef<HTMLSpanElement>(null);
  const previousStepRef = useRef<CreateStep>("form");
  const {
    error: loginError,
    isAuthenticated: authenticated,
    manualLoginUrl,
    signIn,
    state: loginState,
  } = useCloudLogin({ onAuthenticated });

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearTimeout(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    if (step === "creating" || step === "provisioning" || step === "done") {
      progressHeadingRef.current?.focus();
    } else if (step === "error") {
      errorHeadingRef.current?.focus();
    }
    previousStepRef.current = step;
  }, [step]);

  const pollJob = useCallback(
    async (cc: CloudClient, jobId: string, attempt = 0) => {
      const MAX_ATTEMPTS = 60; // ~2.5 min at 2.5s intervals
      if (attempt >= MAX_ATTEMPTS) {
        setStep("error");
        setError("Provisioning timed out. Please check the dashboard.");
        return;
      }
      try {
        const status = await cc.getJobStatus(jobId);
        setJobStatus(status);
        if (status.status === "completed") {
          setStep("done");
          setTimeout(() => onCreated(), 1200);
        } else if (status.status === "failed") {
          setStep("error");
          setError(status.error ?? "Provisioning failed.");
        } else {
          pollRef.current = setTimeout(
            () => pollJob(cc, jobId, attempt + 1),
            2500,
          );
        }
      } catch {
        // Network error during polling, retry with backoff
        pollRef.current = setTimeout(
          () => pollJob(cc, jobId, attempt + 1),
          5000,
        );
      }
    },
    [onCreated],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    if (!authenticated) {
      setError("Authentication required.");
      return;
    }

    setCreatedName(name.trim());
    setStep("creating");
    setError(null);

    try {
      const cc = new CloudClient(getToken() ?? "");

      // Build environment vars object
      const environmentVars: Record<string, string> = {};
      for (const ev of envVars) {
        if (ev.key.trim()) {
          environmentVars[ev.key.trim()] = ev.value;
        }
      }

      const result = await cc.createAgent({
        name: name.trim(),
        environmentVars:
          Object.keys(environmentVars).length > 0 ? environmentVars : undefined,
      });

      setCreatedAgentId(result.id);

      // Try to provision
      if (result.id) {
        setStep("provisioning");
        try {
          const provResult = await cc.provisionAgent(result.id);
          if (provResult.jobId) {
            // Poll job status
            pollJob(cc, provResult.jobId);
          } else {
            // No job ID, provisioning was synchronous or auto
            setStep("done");
            setTimeout(() => onCreated(), 1200);
          }
        } catch {
          // Provisioning endpoint failed, agent was still created
          setStep("done");
          setTimeout(() => onCreated(), 1200);
        }
      } else {
        setStep("done");
        setTimeout(() => onCreated(), 1200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep("error");
      if (err instanceof Error && err.name === "CloudAgentsNotAvailableError") {
        setError("Cloud agent hosting is coming soon. Stay tuned!");
      } else if (msg.includes("401") || msg.includes("403")) {
        setError("Authentication failed. Please sign in again.");
      } else {
        setError(msg);
      }
    }
  }, [authenticated, name, envVars, onCreated, pollJob]);

  const addEnvVar = () =>
    setEnvVars([...envVars, { id: crypto.randomUUID(), key: "", value: "" }]);
  const removeEnvVar = (i: number) =>
    setEnvVars(envVars.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, field: "key" | "value", val: string) => {
    const updated = [...envVars];
    updated[i] = { ...updated[i], [field]: val };
    setEnvVars(updated);
  };
  const canSubmit = Boolean(name.trim());

  // Build deploy steps for terminal output
  const getDeploySteps = (): DeployStep[] => {
    const isProvisioning = step === "provisioning";
    const isDone = step === "done";
    const jobPending = jobStatus?.status === "pending";
    const jobInProgress = jobStatus?.status === "in_progress";

    return [
      {
        id: "create",
        label: "Agent created",
        status: step === "creating" ? "active" : "done",
      },
      {
        id: "provision",
        label: "Provisioning container",
        status: isDone
          ? "done"
          : isProvisioning && jobPending
            ? "active"
            : isProvisioning
              ? "done"
              : "pending",
      },
      {
        id: "runtime",
        label: "Starting runtime",
        status: isDone
          ? "done"
          : isProvisioning && jobInProgress
            ? "active"
            : "pending",
      },
    ];
  };

  // Provisioning / creating / done states — terminal deploy log
  if (step === "creating" || step === "provisioning" || step === "done") {
    const deploySteps = getDeploySteps();

    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        {/* Terminal header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${step === "done" ? "bg-status-running" : "bg-brand animate-[status-pulse_2s_ease-in-out_infinite]"}`}
            />
          </div>
          <span
            ref={progressHeadingRef}
            tabIndex={-1}
            className="font-mono text-xs text-text-muted focus:outline-none"
          >
            {step === "done" ? "deploy complete" : "deploying..."}
          </span>
        </div>

        {/* Deploy log output */}
        <div className="p-5 font-mono text-sm">
          <p
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {step === "done"
              ? `${createdName || name} is live.`
              : `Deploying ${createdName || name}.`}
          </p>
          <div className="text-text-muted mb-4">
            <span className="text-brand">$</span> milady deploy --name{" "}
            {createdName || name}
          </div>

          <ol className="space-y-2.5" aria-label="Deployment progress">
            {deploySteps.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                {s.status === "done" && (
                  <span className="text-status-running w-4 text-center">✓</span>
                )}
                {s.status === "active" && (
                  <span className="text-brand w-4 text-center animate-pulse">
                    ◌
                  </span>
                )}
                {s.status === "pending" && (
                  <span className="text-text-subtle w-4 text-center">○</span>
                )}
                {s.status === "error" && (
                  <span className="text-status-stopped w-4 text-center">✗</span>
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

          {/* Done state — brief flash */}
          {step === "done" && (
            <div className="mt-6 pt-4 border-t border-border-subtle">
              <div className="flex items-center gap-2 text-status-running">
                <span>→</span>
                <span className="text-text-light">{createdName}</span>
                <span className="text-text-subtle">is live</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state — terminal error output
  if (step === "error") {
    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        {/* Terminal header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-status-stopped" />
          <span
            ref={errorHeadingRef}
            tabIndex={-1}
            className="font-mono text-xs text-text-muted focus:outline-none"
          >
            deploy failed
          </span>
        </div>

        {/* Error output */}
        <div className="p-5 font-mono text-sm">
          <div className="text-text-muted mb-4">
            <span className="text-brand">$</span> milady deploy --name{" "}
            {createdName || name}
          </div>

          {error?.includes("nsufficient") || error?.includes("402") ? (
            <>
              <div
                className="text-status-stopped mb-4"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
              >
                <span className="text-status-stopped">
                  INSUFFICIENT BALANCE
                </span>
              </div>
              <p className="text-text-muted text-xs mb-6">
                A minimum balance of $5.00 is required to deploy agents.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    onCancel();
                    // Navigate to credits section
                    window.dispatchEvent(
                      new CustomEvent("navigate-section", {
                        detail: "credits",
                      }),
                    );
                  }}
                  className={`${terminalPrimaryButtonClassName} px-6`}
                >
                  Add Credits
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  className="h-11 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div
                className="text-status-stopped mb-6"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
              >
                <span className="text-status-stopped">ERROR:</span> {error}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep("form");
                    setError(null);
                  }}
                  className={terminalSecondaryButtonClassName}
                >
                  Retry
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  className="h-11 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Form state — unauthenticated
  if (!authenticated) {
    return (
      <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
        {/* Terminal header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
          <span className="font-mono text-xs text-text-muted">new agent</span>
        </div>

        <div className="p-5">
          {/* Terminal prompt */}
          <div className="font-mono text-sm mb-6">
            <span className="text-brand">$</span>{" "}
            <span className="text-text-light">milady deploy</span>{" "}
            <span className="text-text-muted">--new</span>
            <span className="inline-block w-2 h-4 bg-brand/70 ml-1 animate-[cursor-blink_1s_step-end_infinite]" />
          </div>

          {/* Auth required message */}
          <Field className="mb-6 border-l-2 border-brand/40 pl-4">
            <p className="font-mono text-xs text-text-subtle tracking-wide mb-1">
              AUTHENTICATION REQUIRED
            </p>
            <FieldDescription className="text-sm text-text-muted">
              Sign in to deploy.
            </FieldDescription>
            {loginError && (
              <FieldMessage
                tone="danger"
                className="font-mono text-xs"
                role="alert"
                aria-live="assertive"
              >
                {loginError}
              </FieldMessage>
            )}
          </Field>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {loginState === "polling" ? (
              <div
                className="flex items-center gap-3 font-mono text-sm"
                role="status"
                aria-live="polite"
              >
                <span className="text-brand animate-pulse">◌</span>
                <span className="text-text-muted">
                  Waiting for browser auth...
                </span>
                {manualLoginUrl && (
                  <a
                    href={manualLoginUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:text-brand-hover transition-colors"
                  >
                    [open]
                  </a>
                )}
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={signIn}
                  className={terminalPrimaryButtonClassName}
                >
                  Sign In
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onCancel}
                  className="h-11 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Form state — authenticated
  return (
    <div className="border border-border bg-surface animate-[fade-up_0.4s_ease-out_both]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-status-running" />
          <span className="font-mono text-xs text-text-muted">new agent</span>
        </div>
        <span className="font-mono text-[10px] text-text-subtle tracking-wide">
          CLOUD CONNECTED
        </span>
      </div>

      <form
        className="p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        {/* Command preview */}
        <div className="font-mono text-sm text-text-muted mb-5">
          <span className="text-brand">$</span> milady deploy --name{" "}
          <span className={name ? "text-text-light" : "text-text-subtle"}>
            {name || "agent-name"}
          </span>
        </div>

        {/* Agent name input */}
        <Field className="mb-5">
          <FieldLabel
            htmlFor="agent-name-input"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-text-subtle"
          >
            Agent Name
          </FieldLabel>
          <Input
            id="agent-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="agent-name"
            autoFocus
            className={terminalInputClassName}
          />
          <FieldDescription className="font-mono text-[11px] text-text-subtle">
            Use lowercase, numbers, hyphens.
          </FieldDescription>
        </Field>

        {/* Environment Variables — config editor style */}
        <Field className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <FieldLabel className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-text-subtle">
                Environment
              </FieldLabel>
              <FieldDescription className="font-mono text-[11px] text-text-subtle">
                Runtime secrets and config.
              </FieldDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowEnvVars(!showEnvVars)}
              aria-expanded={showEnvVars}
              aria-controls="homepage-agent-env-vars"
            >
              <span
                className={cn(
                  "text-sm transition-transform duration-200",
                  showEnvVars && "rotate-90",
                )}
                aria-hidden="true"
              >
                ▸
              </span>
              {showEnvVars ? "Hide env" : "Edit env"}
              {envVars.length > 0 && (
                <span className="rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand">
                  {envVars.length}
                </span>
              )}
            </Button>
          </div>

          {showEnvVars && (
            <div
              id="homepage-agent-env-vars"
              className="mt-3 border border-border-subtle bg-dark/95"
            >
              {/* Config file header */}
              <div className="px-3 py-2 border-b border-border-subtle bg-dark-secondary">
                <span className="font-mono text-[10px] text-text-subtle">
                  # environment variables
                </span>
              </div>

              <div className="p-3 space-y-2">
                {envVars.length === 0 && (
                  <p className="font-mono text-xs text-text-subtle py-2">
                    # no variables defined
                  </p>
                )}
                {envVars.map((ev, i) => (
                  <div
                    key={ev.id}
                    className="grid gap-2 md:grid-cols-[minmax(0,12rem)_auto_minmax(0,1fr)_auto]"
                  >
                    <Input
                      type="text"
                      value={ev.key}
                      onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      aria-label={`Environment variable ${i + 1} key`}
                      placeholder="KEY"
                      className="h-10 border-border/60 bg-transparent px-3 font-mono text-sm uppercase text-brand placeholder:text-text-subtle/50 focus-visible:ring-brand/25"
                    />
                    <div className="hidden items-center justify-center text-text-subtle md:flex">
                      =
                    </div>
                    <Input
                      type="text"
                      value={ev.value}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      aria-label={`Environment variable ${i + 1} value`}
                      placeholder="value"
                      className="h-10 border-border/60 bg-transparent px-3 font-mono text-sm text-text-light placeholder:text-text-subtle/50 focus-visible:ring-brand/25"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvVar(i)}
                      aria-label={`Remove environment variable ${i + 1}`}
                      className="h-10 w-10 border border-transparent text-text-subtle hover:border-red-400/20 hover:bg-status-stopped/10 hover:text-status-stopped"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addEnvVar}
                  className="w-fit border border-transparent px-2 text-text-subtle hover:border-brand/20 hover:bg-brand/5 hover:text-brand"
                >
                  <span>+</span> add
                </Button>
              </div>
            </div>
          )}
        </Field>

        {/* Pricing note */}
        <div
          className="mb-5 border-l-2 border-brand/30 pl-3 py-1.5 bg-brand/[4%]"
          id="homepage-hosting-note"
        >
          <p className="font-mono text-[10px] text-text-muted leading-relaxed">
            <span className="text-brand">HOSTING</span>{" "}
            {`${PRICE_RUNNING_PER_HR}/hr running · ${PRICE_IDLE_PER_HR}/hr idle · min. balance ${MIN_DEPOSIT_DISPLAY}`}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <FieldMessage
            className="mb-5 font-mono text-sm"
            tone="danger"
            role="alert"
            aria-live="assertive"
          >
            <span className="text-red-500">ERROR:</span> {error}
          </FieldMessage>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            disabled={!canSubmit}
            aria-describedby="homepage-hosting-note"
            className={cn(
              terminalPrimaryButtonClassName,
              "px-6 disabled:border-brand/15 disabled:bg-brand/35 disabled:text-dark/70",
            )}
          >
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Deploy
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="h-11 px-4 font-mono text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:bg-transparent hover:text-text-light"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
