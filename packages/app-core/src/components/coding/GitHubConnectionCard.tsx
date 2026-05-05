import { Button, SettingsControls } from "@miladyai/ui";
import { CheckCircle2, ExternalLink, Github, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { client } from "../../api";
import { openExternalUrl } from "../../utils";

interface TokenStatus {
  connected: boolean;
  username?: string;
  scopes?: string[];
  savedAt?: number;
}

const TOKEN_GENERATE_URL =
  "https://github.com/settings/tokens/new?description=eliza-coding-agents&scopes=repo,read:user";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

async function requestGitHubToken<T>(
  init?: RequestInit,
): Promise<T> {
  const baseUrl = client.getBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/github/token`
    : "/api/github/token";
  const token = client.getRestAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json().catch(() => null)) as T | { error?: string };
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && body.error
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function GitHubConnectionCard() {
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  const refreshStatus = useCallback(async () => {
    const next = await requestGitHubToken<TokenStatus>();
    setStatus(next);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleConnect = useCallback(async () => {
    const token = draft.trim();
    if (token.length === 0) return;
    setSubmitState({ kind: "submitting" });
    try {
      const res = await requestGitHubToken<TokenStatus | { error: string }>(
        {
          method: "POST",
          body: JSON.stringify({ token }),
        },
      );
      if ("error" in res) {
        setSubmitState({ kind: "error", message: res.error });
        return;
      }
      setStatus(res);
      setDraft("");
      setSubmitState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitState({ kind: "error", message });
    }
  }, [draft]);

  const handleDisconnect = useCallback(async () => {
    setSubmitState({ kind: "submitting" });
    try {
      await requestGitHubToken<void>({ method: "DELETE" });
      setStatus({ connected: false });
      setSubmitState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitState({ kind: "error", message });
    }
  }, []);

  const submitting = submitState.kind === "submitting";
  const errorMessage =
    submitState.kind === "error" ? submitState.message : null;

  return (
    <div className="space-y-3 rounded-2xl border border-border/20 bg-card/14 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Github className="h-4 w-4 text-muted" aria-hidden />
          <span className="text-sm font-medium text-txt">GitHub</span>
          {status?.connected ? (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
              title={`Connected as @${status.username}`}
              aria-label={`Connected as @${status.username}`}
              role="img"
            />
          ) : (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-muted/40"
              title="Not connected"
              aria-label="Not connected"
              role="img"
            />
          )}
        </div>
      </div>

      {status?.connected ? (
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            <span>
              Connected as{" "}
              <span className="font-medium text-txt">@{status.username}</span>
            </span>
          </div>
          {status.scopes && status.scopes.length > 0 ? (
            <div className="text-muted">
              Scopes:{" "}
              <span className="font-mono text-txt">
                {status.scopes.join(", ")}
              </span>
            </div>
          ) : (
            <div className="text-muted">
              Scopes: <span className="text-amber-500">(none reported)</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-muted">
              Coding sub-agents will use this token for git/gh operations.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDisconnect}
              disabled={submitting}
            >
              <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-muted">
            Paste a personal access token so coding sub-agents can clone private
            repos, push commits, and open pull requests.
          </p>
          <button
            type="button"
            className="inline-flex w-fit items-center gap-1 text-xs text-blue-500 hover:underline"
            onClick={() => void openExternalUrl(TOKEN_GENERATE_URL)}
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            Generate a token on github.com (scopes: repo, read:user)
          </button>
          <div className="flex items-center gap-2">
            <SettingsControls.Input
              className="w-full"
              variant="compact"
              type="password"
              placeholder="ghp_..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConnect();
              }}
              autoComplete="off"
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={submitting || draft.trim().length === 0}
            >
              {submitting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      )}

      {errorMessage ? (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-500">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
