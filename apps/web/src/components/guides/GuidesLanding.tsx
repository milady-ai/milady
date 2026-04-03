import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const FIRST_VIEW_OPTIONS = [
  {
    index: "01",
    title: "Create one",
    eyebrow: "Local server",
    description:
      "Start a Milady server on this machine, then pick whichever provider you want that server to use.",
  },
  {
    index: "02",
    title: "LAN agents",
    eyebrow: "Discovered on your network",
    description:
      "Found servers are just other Milady gateways. Once connected, they behave like any other server.",
  },
  {
    index: "03",
    title: "Eliza Cloud",
    eyebrow: "Shown only when credentials exist",
    description:
      "A hosted server option. It does not force Eliza Cloud inference unless you choose that route.",
  },
  {
    index: "04",
    title: "Manual connect",
    eyebrow: "Remote server",
    description:
      "Enter a URL or address for an existing server you already run elsewhere.",
  },
] as const;

const FLOW_STAGES = [
  {
    step: "01",
    title: "Pick a server",
    body: "Choose local, LAN, remote, or Eliza Cloud. This decides where the Milady runtime lives.",
  },
  {
    step: "02",
    title: "Link accounts if needed",
    body: "OpenAI, Anthropic, Eliza Cloud, ElevenLabs, or other accounts become available inventory, not active routes.",
  },
  {
    step: "03",
    title: "Choose your chat provider",
    body: "Select who handles chat inference for the selected server. This is separate from hosting.",
  },
  {
    step: "04",
    title: "Open chat",
    body: "Milady should only let the first message through once both the server target and chat route are resolved.",
  },
] as const;

const SYSTEM_RULES = [
  {
    label: "Server target",
    body: "Where the Milady server runs: local, LAN, remote, or Eliza Cloud.",
  },
  {
    label: "Linked accounts",
    body: "What a server is allowed to use, without forcing those accounts to become active services.",
  },
  {
    label: "Service routing",
    body: "Who handles chat, TTS, media, embeddings, and RPC for the selected server.",
  },
] as const;

const PROVIDER_ROWS = [
  {
    provider: "Local Llama / Ollama",
    local: "Yes",
    remote: "If that server exposes it",
    cloud: "If your cloud server is configured for it",
  },
  {
    provider: "OpenAI / Anthropic",
    local: "Yes",
    remote: "Yes",
    cloud: "Yes",
  },
  {
    provider: "OpenRouter",
    local: "Yes",
    remote: "Yes",
    cloud: "Yes",
  },
  {
    provider: "Eliza Cloud inference",
    local: "Yes, if selected",
    remote: "Yes, if selected",
    cloud: "Yes, if selected",
  },
] as const;

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand">
      {children}
    </p>
  );
}

function FlowNode({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <div className="relative pl-14">
      <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-brand/50 bg-brand/10 font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
        {step}
      </div>
      <h3 className="text-lg font-black uppercase tracking-[-0.03em] text-white">
        {title}
      </h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">{body}</p>
    </div>
  );
}

export function GuidesLanding() {
  return (
    <main
      data-testid="guides-page"
      className="min-h-screen bg-dark text-text-light"
    >
      <section className="relative overflow-hidden border-b border-border bg-dark-secondary/70 pt-[calc(var(--safe-area-top,0px)+88px)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(144,224,239,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(77,182,172,0.12),transparent_38%)]" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div className="relative">
            <SectionEyebrow>Consumer Docs</SectionEyebrow>
            <h1 className="mt-4 text-4xl font-black uppercase tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              Start with the server.
              <br />
              Route providers after that.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-text-muted sm:text-lg">
              Milady is a client for local, LAN, remote, and Eliza Cloud
              servers. Hosting and inference are separate choices, and the app
              should make that obvious from the first screen.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/dashboard"
                className="border border-brand bg-brand px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-dark transition-colors hover:bg-brand/90"
              >
                Open App
              </Link>
              <Link
                to="/"
                className="border border-text-subtle/30 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-text-muted/50 hover:text-text-light"
              >
                Back to Landing
              </Link>
              <a
                href="https://docs.milady.ai"
                className="border border-text-subtle/30 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-text-muted/50 hover:text-text-light"
              >
                Developer Docs
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {SYSTEM_RULES.map((rule) => (
                <div
                  key={rule.label}
                  className="border border-border bg-dark/55 p-4 backdrop-blur-sm"
                >
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-white">
                    {rule.label}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-text-muted">
                    {rule.body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative border border-border bg-dark/55 p-5 backdrop-blur-sm sm:p-6">
            <div className="absolute inset-x-6 top-16 h-px bg-gradient-to-r from-transparent via-brand/35 to-transparent" />
            <SectionEyebrow>What Users See First</SectionEyebrow>
            <div className="mt-5 space-y-3">
              {FIRST_VIEW_OPTIONS.map((option) => (
                <div
                  key={option.title}
                  className="group grid gap-3 border border-border-subtle bg-dark-secondary/45 p-4 transition-transform transition-colors hover:-translate-y-0.5 hover:border-brand/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-subtle">
                        {option.eyebrow}
                      </p>
                      <h2 className="mt-2 text-xl font-black uppercase tracking-[-0.03em] text-white">
                        {option.title}
                      </h2>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand">
                      {option.index}
                    </span>
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-text-muted">
                    {option.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-16">
        <div className="border border-border bg-dark-secondary/40 p-6 sm:p-8">
          <SectionEyebrow>First Chat Flow</SectionEyebrow>
          <div className="relative mt-8 space-y-8">
            <div className="absolute bottom-6 left-4 top-3 w-px bg-gradient-to-b from-brand/50 via-text-subtle/30 to-transparent" />
            {FLOW_STAGES.map((stage) => (
              <FlowNode
                key={stage.step}
                step={stage.step}
                title={stage.title}
                body={stage.body}
              />
            ))}
          </div>
        </div>

        <div className="border border-border bg-dark-secondary/40 p-6 sm:p-8">
          <SectionEyebrow>Provider Behavior</SectionEyebrow>
          <h2 className="mt-4 text-2xl font-black uppercase tracking-[-0.03em] text-white sm:text-3xl">
            The provider rules should look the same everywhere.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-text-muted">
            Local, LAN, remote, and Eliza Cloud are server targets. They should
            not rewrite provider behavior. A selected server can still route
            chat to local Llama, OpenAI, Anthropic, OpenRouter, or Eliza Cloud
            inference depending on what that server is configured to use.
          </p>

          <div className="mt-8 overflow-hidden border border-border-subtle">
            <div className="grid grid-cols-[1.1fr_repeat(3,minmax(0,1fr))] bg-dark/70 font-mono text-[10px] uppercase tracking-[0.18em] text-text-subtle">
              <div className="border-b border-r border-border-subtle px-4 py-3">
                Provider
              </div>
              <div className="border-b border-r border-border-subtle px-4 py-3">
                Local server
              </div>
              <div className="border-b border-r border-border-subtle px-4 py-3">
                LAN / remote
              </div>
              <div className="border-b border-border-subtle px-4 py-3">
                Eliza Cloud
              </div>
            </div>

            {PROVIDER_ROWS.map((row, index) => (
              <div
                key={row.provider}
                className={`grid grid-cols-[1.1fr_repeat(3,minmax(0,1fr))] text-sm leading-6 ${
                  index % 2 === 0 ? "bg-dark-secondary/30" : "bg-dark/40"
                }`}
              >
                <div className="border-r border-t border-border-subtle px-4 py-4 text-white">
                  {row.provider}
                </div>
                <div className="border-r border-t border-border-subtle px-4 py-4 text-text-muted">
                  {row.local}
                </div>
                <div className="border-r border-t border-border-subtle px-4 py-4 text-text-muted">
                  {row.remote}
                </div>
                <div className="border-t border-border-subtle px-4 py-4 text-text-muted">
                  {row.cloud}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
        <div className="grid gap-6 border border-border bg-dark-secondary/40 p-6 sm:p-8 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <SectionEyebrow>Before The First Message</SectionEyebrow>
            <h2 className="mt-4 text-2xl font-black uppercase tracking-[-0.03em] text-white sm:text-3xl">
              Linked accounts are inventory. Active routes are decisions.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-text-muted">
              If a server has no chat route yet, Milady should ask for one
              before the first send. Linking Eliza Cloud, OpenAI, Anthropic, or
              any other account should make that account available, but it
              should never silently become the active chat model.
            </p>
          </div>

          <div className="border border-border-subtle bg-dark/55 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-subtle">
              Checklist
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-light">
              <li className="border-b border-border-subtle pb-3">
                The selected server is known and reachable.
              </li>
              <li className="border-b border-border-subtle pb-3">
                A chat provider is actively routed for that server.
              </li>
              <li className="border-b border-border-subtle pb-3">
                Optional cloud services stay optional unless explicitly chosen.
              </li>
              <li>Chat opens only after those three conditions are true.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
