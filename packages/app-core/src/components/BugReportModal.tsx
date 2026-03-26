import {
  Banner,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  FieldMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@miladyai/ui";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../api";
import { useBranding } from "../config/branding";
import { useBugReport } from "../hooks";
import { useApp } from "../state";
import { openExternalUrl } from "../utils";

const ENV_OPTIONS = ["macOS", "Windows", "Linux", "Other"] as const;

interface BugReportForm {
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  environment: string;
  nodeVersion: string;
  modelProvider: string;
  logs: string;
}

const EMPTY_FORM: BugReportForm = {
  description: "",
  stepsToReproduce: "",
  expectedBehavior: "",
  actualBehavior: "",
  environment: "",
  nodeVersion: "",
  modelProvider: "",
  logs: "",
};

const modalContentClassName =
  "w-[min(100%-2rem,42rem)] max-h-[min(88vh,52rem)] overflow-hidden rounded-2xl border border-border/70 bg-card/96 p-0 shadow-2xl backdrop-blur-xl";

const modalInputClassName =
  "h-11 rounded-xl border-border bg-bg-hover text-txt placeholder:text-muted/70 focus-visible:ring-accent/30";

const modalTextareaClassName =
  "min-h-[88px] rounded-xl border-border bg-bg-hover px-4 py-3 text-sm text-txt placeholder:text-muted/70 focus-visible:ring-accent/30";

const subtleMonoDescriptionClassName = "font-mono text-[11px] text-muted";

export function BugReportModal() {
  const { copyToClipboard, t } = useApp();
  const branding = useBranding();
  const { isOpen, close } = useBugReport();
  const [form, setForm] = useState<BugReportForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  // Fetch env info on open with cancellation guard
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setForm(EMPTY_FORM);
    setSubmitting(false);
    setResultUrl(null);
    setErrorMsg(null);
    setShowLogs(false);
    setCopied(false);

    client
      .checkBugReportInfo()
      .then((info) => {
        if (cancelled) return;
        if (info.nodeVersion)
          setForm((f) => ({ ...f, nodeVersion: info.nodeVersion ?? "" }));
        if (info.platform)
          setForm((f) => ({
            ...f,
            environment:
              info.platform === "darwin"
                ? "macOS"
                : info.platform === "win32"
                  ? "Windows"
                  : info.platform === "linux"
                    ? "Linux"
                    : "Other",
          }));
      })
      .catch((err: unknown) => {
        console.warn("[BugReportModal] Failed to fetch bug report info:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!resultUrl) return;
    successHeadingRef.current?.focus();
  }, [resultUrl]);

  const updateField = useCallback(
    <K extends keyof BugReportForm>(key: K, value: BugReportForm[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const formatMarkdown = useCallback((): string => {
    const strip = (s: string, max = 10_000) =>
      s.replace(/<[^>]*>/g, "").slice(0, max);
    const lines: string[] = [];
    lines.push(`### Description\n${strip(form.description)}`);
    lines.push(`\n### Steps to Reproduce\n${strip(form.stepsToReproduce)}`);
    if (form.expectedBehavior)
      lines.push(`\n### Expected Behavior\n${strip(form.expectedBehavior)}`);
    if (form.actualBehavior)
      lines.push(`\n### Actual Behavior\n${strip(form.actualBehavior)}`);
    lines.push(
      `\n### Environment\n${strip(form.environment || "Not specified", 200)}`,
    );
    if (form.nodeVersion)
      lines.push(`\n### Node Version\n${strip(form.nodeVersion, 200)}`);
    if (form.modelProvider)
      lines.push(`\n### Model Provider\n${strip(form.modelProvider, 200)}`);
    if (form.logs)
      lines.push(`\n### Logs\n\`\`\`\n${strip(form.logs, 50_000)}\n\`\`\``);
    return lines.join("\n");
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!form.description.trim() || !form.stepsToReproduce.trim()) {
      setErrorMsg(t("bugreportmodal.descriptionRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const result = await client.submitBugReport({
        description: form.description,
        stepsToReproduce: form.stepsToReproduce,
        expectedBehavior: form.expectedBehavior,
        actualBehavior: form.actualBehavior,
        environment: form.environment,
        nodeVersion: form.nodeVersion,
        modelProvider: form.modelProvider,
        logs: form.logs,
      });
      if (result.url) {
        setResultUrl(result.url);
      } else if (result.fallback) {
        // No GITHUB_TOKEN on server — copy report and open GitHub manually
        let ok = false;
        try {
          await copyToClipboard(formatMarkdown());
          ok = true;
        } catch (err) {
          console.warn(
            "[BugReportModal] Failed to copy bug report to clipboard:",
            err,
          );
          ok = false;
        }
        setCopied(ok);
        await openExternalUrl(result.fallback);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to submit bug report",
      );
    } finally {
      setSubmitting(false);
    }
  }, [copyToClipboard, form, formatMarkdown, t]);

  const handleCopyAndOpen = useCallback(async () => {
    let ok = false;
    try {
      await copyToClipboard(formatMarkdown());
      ok = true;
    } catch (err) {
      console.warn(
        "[BugReportModal] Failed to copy bug report to clipboard:",
        err,
      );
      ok = false;
    }
    setCopied(ok);
    await openExternalUrl(branding.bugReportUrl);
  }, [copyToClipboard, formatMarkdown, branding.bugReportUrl]);

  if (!isOpen) return null;
  const canSubmit =
    form.description.trim() && form.stepsToReproduce.trim() && !submitting;

  // Success state
  if (resultUrl) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="w-[min(100%-2rem,28rem)] rounded-2xl border border-border/70 bg-card/96 p-0 shadow-2xl backdrop-blur-xl">
          <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
            <DialogTitle
              ref={successHeadingRef}
              tabIndex={-1}
              className="text-sm font-bold text-txt focus:outline-none"
            >
              {t("bugreportmodal.BugReportSubmitted")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted">
              {t("bugreportmodal.YourBugReportHas")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-6 text-center">
            <p className="text-sm text-txt">{t("bugreportmodal.YourBugReportHas")}</p>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {resultUrl}
            </a>
          </div>
          <DialogFooter className="border-t border-border/70 px-5 py-4 sm:justify-end">
            <Button variant="outline" size="sm" onClick={close}>
              {t("bugreportmodal.Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={modalContentClassName}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          descRef.current?.focus();
        }}
      >
        <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
          <DialogTitle className="text-sm font-bold text-txt">
            {t("bugreportmodal.ReportABug")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted">
            Help us reproduce the issue with concrete steps and environment
            details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[min(88vh,52rem)] flex-col" aria-busy={submitting}>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {errorMsg && (
              <Banner variant="error" className="rounded-xl text-xs">
                {errorMsg}
              </Banner>
            )}

            <Field>
              <FieldLabel htmlFor="bug-report-description">
                {t("skillsview.Description")}{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </FieldLabel>
              <Textarea
                ref={descRef}
                id="bug-report-description"
                className={modalTextareaClassName}
                placeholder={t("bugreportmodal.DescribeTheIssueY")}
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={4}
              />
              <FieldDescription className={subtleMonoDescriptionClassName}>
                Describe what happened and why it was unexpected.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="bug-report-steps">
                {t("bugreportmodal.StepsToReproduce")}{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </FieldLabel>
              <Textarea
                id="bug-report-steps"
                className={modalTextareaClassName}
                placeholder={t("bugreportmodal.stepsPlaceholder")}
                value={form.stepsToReproduce}
                onChange={(e) => updateField("stepsToReproduce", e.target.value)}
                rows={4}
              />
              <FieldDescription className={subtleMonoDescriptionClassName}>
                Include the shortest reliable path that reproduces the bug.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="bug-report-expected">
                {t("bugreportmodal.ExpectedBehavior")}
              </FieldLabel>
              <Textarea
                id="bug-report-expected"
                className={`${modalTextareaClassName} min-h-[72px]`}
                placeholder={t("bugreportmodal.DescribeTheExpecte")}
                value={form.expectedBehavior}
                onChange={(e) => updateField("expectedBehavior", e.target.value)}
                rows={3}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="bug-report-actual">
                {t("bugreportmodal.ActualBehavior")}
              </FieldLabel>
              <Textarea
                id="bug-report-actual"
                className={`${modalTextareaClassName} min-h-[72px]`}
                placeholder={t("bugreportmodal.DescribeTheActual")}
                value={form.actualBehavior}
                onChange={(e) => updateField("actualBehavior", e.target.value)}
                rows={3}
              />
            </Field>

            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="bug-report-environment">
                  {t("bugreportmodal.Environment")}
                </FieldLabel>
                <Select
                  value={form.environment}
                  onValueChange={(value) => updateField("environment", value)}
                >
                  <SelectTrigger
                    id="bug-report-environment"
                    className={modalInputClassName}
                  >
                    <SelectValue placeholder={t("bugreportmodal.Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>
                      {t("bugreportmodal.Select")}
                    </SelectItem>
                    {ENV_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="bug-report-node-version">
                  {t("bugreportmodal.NodeVersion")}
                </FieldLabel>
                <Input
                  id="bug-report-node-version"
                  className={modalInputClassName}
                  placeholder={t("bugreportmodal.22X")}
                  value={form.nodeVersion}
                  onChange={(e) => updateField("nodeVersion", e.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="bug-report-model-provider">
                {t("bugreportmodal.ModelProvider")}
              </FieldLabel>
              <Input
                id="bug-report-model-provider"
                className={modalInputClassName}
                placeholder={t("bugreportmodal.AnthropicOpenAI")}
                value={form.modelProvider}
                onChange={(e) => updateField("modelProvider", e.target.value)}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <FieldLabel className="mb-0">{t("bugreportmodal.Logs")}</FieldLabel>
                  <FieldDescription className={subtleMonoDescriptionClassName}>
                    Paste only the relevant errors, traces, or console output.
                  </FieldDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-xl px-3 text-xs text-muted hover:text-txt"
                  onClick={() => setShowLogs(!showLogs)}
                  aria-expanded={showLogs}
                  aria-controls="bug-report-logs-panel"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${showLogs ? "rotate-90" : ""}`}
                  />
                  {showLogs ? "Hide logs" : "Add logs"}
                </Button>
              </div>
              {showLogs && (
                <Textarea
                  id="bug-report-logs-panel"
                  className={`${modalTextareaClassName} min-h-[120px] font-mono text-xs`}
                  placeholder={t("bugreportmodal.PasteRelevantError")}
                  value={form.logs}
                  onChange={(e) => updateField("logs", e.target.value)}
                  rows={6}
                />
              )}
            </Field>
          </div>

          <DialogFooter className="border-t border-border/70 px-5 py-4 sm:items-center sm:justify-between sm:space-x-0">
            <Button variant="outline" size="sm" onClick={close}>
              {t("common.cancel")}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAndOpen}
                disabled={!canSubmit}
              >
                {copied
                  ? t("bugreportmodal.copied")
                  : t("bugreportmodal.copyAndOpenGitHub")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting
                  ? t("bugreportmodal.submitting")
                  : t("bugreportmodal.submit")}
              </Button>
            </div>
          </DialogFooter>

          {copied && !resultUrl ? (
            <FieldMessage
              tone="success"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="px-5 pb-4 pt-0"
            >
              Report copied to clipboard.
            </FieldMessage>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
