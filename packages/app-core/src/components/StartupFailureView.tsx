import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  StatusBadge,
} from "@miladyai/ui";
import { useBranding } from "../config/branding";
import type { StartupErrorState } from "../state";
import { useApp } from "../state";

const REASON_LABELS: Record<StartupErrorState["reason"], string> = {
  "backend-timeout": "Backend Timeout",
  "backend-unreachable": "Backend Unreachable",
  "agent-timeout": "Agent Timeout",
  "agent-error": "Agent Error",
  "asset-missing": "Asset Missing",
};

const SCREEN_SHELL_CLASS =
  "relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-bg px-4 py-6 font-body text-txt sm:px-6";
const SCREEN_CARD_CLASS =
  "relative z-10 w-full max-w-[720px] overflow-hidden border border-border/60 bg-card/95 shadow-[0_30px_120px_rgba(0,0,0,0.36)] backdrop-blur-xl";

interface StartupFailureViewProps {
  error: StartupErrorState;
  onRetry: () => void;
}

export function StartupFailureView({
  error,
  onRetry,
}: StartupFailureViewProps) {
  const { t } = useApp();
  const branding = useBranding();
  const isBackendUnreachable = error.reason === "backend-unreachable";
  const reasonLabel = REASON_LABELS[error.reason];

  return (
    <div className={SCREEN_SHELL_CLASS}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.1),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]"
      />
      <Card className={SCREEN_CARD_CLASS}>
        <CardHeader className="border-b border-border/60 bg-danger/5 pb-6 pt-6">
          <div className="flex flex-col gap-4">
            <StatusBadge
              label={reasonLabel}
              tone="danger"
              withDot
              className="self-start"
            />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold leading-tight text-danger">
                {t("startupfailureview.StartupFailed")} {reasonLabel}
              </h1>
              <p className="max-w-[56ch] text-sm leading-relaxed text-txt-strong">
                {error.message}
              </p>
            </div>
            {isBackendUnreachable ? (
              <p className="max-w-[56ch] rounded-xl border border-border/50 bg-bg/35 px-4 py-3 text-sm leading-relaxed text-muted">
                {t("startupfailureview.ThisOriginDoesNot")}
              </p>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 pt-6">
          {error.detail ? (
            <section className="space-y-2 rounded-2xl border border-border/50 bg-bg/35 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                Details
              </div>
              <pre className="max-h-60 overflow-auto rounded-xl border border-border bg-bg-muted p-3 text-xs leading-relaxed text-muted whitespace-pre-wrap break-words">
                {error.detail}
              </pre>
            </section>
          ) : (
            <CardDescription className="max-w-[56ch] leading-relaxed">
              {reasonLabel}
            </CardDescription>
          )}

          <div className="flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center">
            <Button
              variant="default"
              size="lg"
              onClick={onRetry}
              className="w-full sm:w-auto sm:min-w-[11rem]"
            >
              {t("startupfailureview.RetryStartup")}
            </Button>
            {isBackendUnreachable ? (
              <Button
                variant="outline"
                size="lg"
                asChild
                className="w-full sm:w-auto sm:min-w-[10rem]"
              >
                <a href={branding.appUrl} target="_blank" rel="noreferrer">
                  {t("startupfailureview.OpenApp")}
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
