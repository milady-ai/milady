const PREVIEW_LOGS = [
  { id: "log-1", time: "00:00:00", level: "INFO", msg: "Agent initialized" },
  { id: "log-2", time: "00:00:01", level: "INFO", msg: "Loading character..." },
  {
    id: "log-3",
    time: "00:00:02",
    level: "DEBUG",
    msg: "Memory store ready",
  },
] as const;

export function LogsPanel() {
  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      <div className="border border-border bg-surface">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border flex items-center justify-between">
          <span className="font-mono text-xs text-text-muted">
            $ tail -f agent.log
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono text-text-subtle">
            <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />
            DISCONNECTED
          </div>
        </div>

        <div className="p-6 min-h-[200px]">
          {/* Preview log lines - muted */}
          <div className="space-y-2 mb-8 opacity-20">
            {PREVIEW_LOGS.map((line) => (
              <div
                key={line.id}
                className="flex items-start gap-3 font-mono text-[11px]"
              >
                <span className="text-text-subtle tabular-nums">
                  {line.time}
                </span>
                <span
                  className={
                    line.level === "DEBUG"
                      ? "text-text-subtle"
                      : "text-emerald-400/70"
                  }
                >
                  [{line.level}]
                </span>
                <span className="text-text-muted">{line.msg}</span>
              </div>
            ))}
          </div>

          <div className="text-center py-4">
            <h3 className="font-mono text-sm text-text-light mb-2">
              NO LOG STREAM
            </h3>
            <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              Select an agent from the Agents panel to stream live logs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
