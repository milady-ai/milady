export function MetricsPanel() {
  return (
    <div className="animate-[fade-up_0.4s_ease-out_both]">
      <div className="border border-border bg-surface">
        <div className="px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="font-mono text-xs text-text-muted">
            $ metrics --watch
          </span>
        </div>

        <div className="p-8">
          {/* Metric labels row */}
          <div className="grid grid-cols-3 gap-px bg-border mb-6 max-w-md mx-auto">
            {[
              { label: "CPU", value: "—%", sub: "idle" },
              { label: "MEM", value: "—MB", sub: "allocated" },
              { label: "REQ/S", value: "—", sub: "throughput" },
            ].map((metric) => (
              <div key={metric.label} className="bg-surface p-4 text-left">
                <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1">
                  {metric.label}
                </p>
                <p className="font-mono text-xl text-text-muted/30 tabular-nums">
                  {metric.value}
                </p>
                <p className="font-mono text-[10px] text-text-subtle mt-0.5">
                  {metric.sub}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <h3 className="font-mono text-sm text-text-light mb-2">
              NO ACTIVE METRICS
            </h3>
            <p className="font-mono text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              Connect to a running agent to stream real-time performance data.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-mono text-text-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted/30" />
              WAITING FOR DATA
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
