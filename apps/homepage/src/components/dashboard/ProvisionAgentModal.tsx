import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CloudClient, JobStatus } from "../../lib/cloud-api";

export interface ProvisionAgentModalProps {
  cloudClient: CloudClient | null;
  onClose: () => void;
  onProvisioned: (result: {
    id: string;
    name: string;
    jobStatus: JobStatus["status"] | "no-job";
  }) => void;
  onRefreshList?: () => void;
}

type Phase = "form" | "creating" | "provisioning" | "done" | "error";

const MAX_POLL_ATTEMPTS = 48; // ~120s at 2.5s intervals
const POLL_INTERVAL_MS = 2500;

export function ProvisionAgentModal({
  cloudClient,
  onClose,
  onProvisioned,
  onRefreshList,
}: ProvisionAgentModalProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus["status"] | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthed = !!cloudClient;
  const isWorking = phase === "creating" || phase === "provisioning";
  const isDone = phase === "done";
  const canSubmit = isAuthed && name.trim().length > 0 && !isWorking && !isDone;

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (autoCloseTimerRef.current !== null) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "done") return;
    autoCloseTimerRef.current = setTimeout(() => {
      onClose();
    }, 2500);
    return () => {
      if (autoCloseTimerRef.current !== null) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [phase, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isWorking) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, isWorking]);

  const pollJob = useCallback(
    async (jobId: string, finalName: string, finalId: string, attempt = 0) => {
      if (!cloudClient) return;
      if (attempt >= MAX_POLL_ATTEMPTS) {
        setPhase("error");
        setError(
          "Provisioning is taking longer than expected. The agent may still come online in the background.",
        );
        return;
      }
      try {
        const status = await cloudClient.getJobStatus(jobId);
        setJobStatus(status.status);
        if (status.status === "completed") {
          setPhase("done");
          onProvisioned({
            id: finalId,
            name: finalName,
            jobStatus: "completed",
          });
          onRefreshList?.();
        } else if (status.status === "failed") {
          setPhase("error");
          setError(status.error ?? "Provisioning failed.");
        } else {
          pollTimerRef.current = setTimeout(
            () => pollJob(jobId, finalName, finalId, attempt + 1),
            POLL_INTERVAL_MS,
          );
        }
      } catch {
        pollTimerRef.current = setTimeout(
          () => pollJob(jobId, finalName, finalId, attempt + 1),
          POLL_INTERVAL_MS * 2,
        );
      }
    },
    [cloudClient, onProvisioned, onRefreshList],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit || !cloudClient || isDone || isWorking) return;
      setError(null);
      setPhase("creating");

      const trimmedName = name.trim();
      const agentConfig = systemPrompt.trim()
        ? { system: systemPrompt.trim() }
        : undefined;

      try {
        const result = await cloudClient.createAgent({
          name: trimmedName,
          ...(agentConfig ? { config: agentConfig } : {}),
        });

        if (!result.id) {
          setPhase("error");
          setError("Agent was created but no ID was returned.");
          return;
        }

        setPhase("provisioning");
        try {
          const provResult = await cloudClient.provisionAgent(result.id);
          if (provResult.jobId) {
            pollJob(provResult.jobId, trimmedName, result.id);
          } else {
            setPhase("done");
            onProvisioned({
              id: result.id,
              name: trimmedName,
              jobStatus: "no-job",
            });
            onRefreshList?.();
          }
        } catch (provErr) {
          setPhase("error");
          const msg =
            provErr instanceof Error ? provErr.message : String(provErr);
          setError(`Agent created but provisioning failed: ${msg}`);
        }
      } catch (createErr) {
        setPhase("error");
        const msg =
          createErr instanceof Error ? createErr.message : String(createErr);
        setError(`Failed to create agent: ${msg}`);
      }
    },
    [
      canSubmit,
      cloudClient,
      isDone,
      isWorking,
      name,
      systemPrompt,
      pollJob,
      onProvisioned,
      onRefreshList,
    ],
  );

  const statusLine = buildStatusLine(phase, jobStatus);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close provision dialog"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (!isWorking) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="provision-modal-title"
        className="relative z-10 w-[min(100%-2rem,30rem)] rounded-xl border border-border bg-[#0c0c0e] shadow-2xl"
      >
        <form className="space-y-5 p-6" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <div className="font-mono text-[10px] lowercase tracking-[0.18em] text-white/45">
              new cloud agent
            </div>
            <h2
              id="provision-modal-title"
              className="text-[17px] font-semibold tracking-tight text-white/95"
            >
              spin up an agent on milady cloud.
            </h2>
            <p className="text-[12px] leading-5 text-text-muted">
              takes about 45 seconds. we create the record, provision a sandbox,
              and attach it to your dashboard.
            </p>
          </div>

          {!isAuthed ? (
            <div className="rounded-md border border-brand/25 bg-brand/[0.06] px-3 py-2 text-[12px] leading-5 text-brand/90">
              sign in to eliza cloud first. use the sidebar sign-in button.
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="provision-name"
              className="font-mono text-[10px] lowercase tracking-wider text-text-subtle"
            >
              name
            </label>
            <input
              id="provision-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="scout"
              autoComplete="off"
              disabled={isWorking}
              maxLength={64}
              className="w-full h-10 px-3 font-mono text-sm bg-dark border border-border text-text-light placeholder:text-text-muted/50 focus:outline-none focus:border-brand/50 disabled:opacity-60"
            />
            <p className="text-[11px] leading-4 text-text-muted/70">
              lowercase, a-z 0-9 and dashes work best.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="provision-prompt"
              className="font-mono text-[10px] lowercase tracking-wider text-text-subtle"
            >
              system prompt{" "}
              <span className="text-text-muted/50">(optional)</span>
            </label>
            <textarea
              id="provision-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant that\u2026"
              rows={3}
              disabled={isWorking}
              className="w-full px-3 py-2 font-mono text-sm bg-dark border border-border text-text-light placeholder:text-text-muted/50 focus:outline-none focus:border-brand/50 resize-none disabled:opacity-60"
            />
          </div>

          {phase !== "form" ? (
            <div
              aria-live="polite"
              className={`rounded-md border px-3 py-2 text-[12px] leading-5 ${
                phase === "error"
                  ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                  : phase === "done"
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-border bg-white/[0.02] text-white/75"
              }`}
            >
              {phase === "error"
                ? (error ?? "something went wrong.")
                : statusLine}
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className="rounded-md px-5 py-2.5 text-[12px] font-semibold text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_8px_20px_-10px_rgba(240,185,11,0.45)] transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:shadow-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/60"
              style={{
                background: canSubmit
                  ? "var(--gold-gradient-primary)"
                  : "var(--accent-muted)",
              }}
            >
              {isDone
                ? "done"
                : isWorking
                  ? "provisioning\u2026"
                  : "create agent"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isWorking}
              className="rounded-md px-5 py-2.5 text-[12px] text-text-muted transition hover:text-text-light disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
            >
              {isDone ? "close" : "cancel"}
            </button>
            {isDone ? (
              <span className="ml-auto font-mono text-[10px] lowercase tracking-[0.14em] text-emerald-300/80">
                ready
              </span>
            ) : null}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function buildStatusLine(
  phase: Phase,
  jobStatus: JobStatus["status"] | null,
): string {
  if (phase === "creating") return "creating agent record\u2026";
  if (phase === "provisioning") {
    if (jobStatus === "pending")
      return "job queued, waiting for a worker\u2026";
    if (jobStatus === "in_progress") return "booting container\u2026 (~45s)";
    if (jobStatus === "completed") return "wrapping up\u2026";
    return "provisioning sandbox\u2026 (~45s)";
  }
  if (phase === "done") return "agent is live.";
  return "";
}
