import { Link } from "react-router-dom";

const DOCS_BASE_URL = "https://docs.milady.ai";

type GuideCardLink = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

const startHereLinks: GuideCardLink[] = [
  {
    title: "Quickstart",
    description:
      "Go from first launch to first chat using the chooser-first startup flow.",
    href: `${DOCS_BASE_URL}/quickstart`,
    cta: "Read quickstart",
  },
  {
    title: "Choose a Server",
    description:
      "Understand the difference between creating, discovering, and manually connecting to a server.",
    href: `${DOCS_BASE_URL}/guides/choose-a-server`,
    cta: "Choose your path",
  },
];

const pathLinks: GuideCardLink[] = [
  {
    title: "Create One",
    description:
      "Run the server on the current machine and continue through local onboarding.",
    href: `${DOCS_BASE_URL}/guides/create-local-server`,
    cta: "Create a local server",
  },
  {
    title: "Connect to One",
    description:
      "Attach to a LAN, remote, or Eliza Cloud server without treating provider choice as part of hosting.",
    href: `${DOCS_BASE_URL}/guides/connect-existing-server`,
    cta: "Connect to a server",
  },
];

const nextLinks: GuideCardLink[] = [
  {
    title: "Select a Model Provider",
    description:
      "Separate provider routing from runtime target so local, remote, and Eliza Cloud all behave the same.",
    href: `${DOCS_BASE_URL}/guides/select-model-provider`,
    cta: "Choose provider routing",
  },
  {
    title: "Startup Flow",
    description:
      "See the current handoff from splash chooser to onboarding, restore, and chat.",
    href: `${DOCS_BASE_URL}/guides/onboarding-ui-flow`,
    cta: "View startup flow",
  },
];

export function GuidesLanding() {
  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-28 text-text-light sm:px-6 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <section className="border border-border bg-surface/40 p-6 sm:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand">
            Guides
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">
            Start with the chooser
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-text-muted sm:text-base">
            Milady now starts by asking where your agent should live. This page
            stays thin on purpose: pick a path, open the right guide, and only
            drop into the full docs when you need more detail.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`${DOCS_BASE_URL}/quickstart`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center border border-brand/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brand transition-colors hover:bg-brand hover:text-dark"
            >
              Read Quickstart
            </a>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-light transition-colors hover:border-text-muted hover:text-white"
            >
              Open Dashboard
            </Link>
            <a
              href={DOCS_BASE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-text-muted hover:text-white"
            >
              Browse Full Docs
            </a>
          </div>
        </section>

        <GuideSection
          eyebrow="Start here"
          title="Choose the right first read"
          description="These two docs explain the current startup model and what the chooser is doing before you commit to a local or cloud path."
          links={startHereLinks}
        />

        <GuideSection
          eyebrow="Pick your path"
          title="Decide where your agent lives"
          description="The startup chooser is about runtime ownership. These guides map directly to the two main actions the user can take from the first screen."
          links={pathLinks}
        />

        <GuideSection
          eyebrow="Keep moving"
          title="Finish the handoff to chat"
          description="Once the server is selected, these guides explain provider routing and the remaining startup handoff."
          links={nextLinks}
        />
      </div>
    </main>
  );
}

function GuideSection({
  eyebrow,
  title,
  description,
  links,
}: {
  eyebrow: string;
  title: string;
  description: string;
  links: GuideCardLink[];
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base">
          {description}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {links.map((link) => (
          <a
            key={link.title}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="group flex h-full flex-col justify-between border border-border bg-dark-secondary/60 p-5 transition-colors hover:border-brand/40 hover:bg-brand/5"
          >
            <div>
              <h3 className="font-mono text-[13px] uppercase tracking-[0.18em] text-white">
                {link.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                {link.description}
              </p>
            </div>

            <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
              {link.cta}
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
