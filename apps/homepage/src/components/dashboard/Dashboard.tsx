import { useEffect, useState } from "react";
import { AgentProvider, useAgents } from "../../lib/AgentProvider";
import { useAuth } from "../../lib/useAuth";
import { AgentGrid } from "./AgentGrid";
import { CloudLoginBanner } from "./AuthGate";
import { CreditsPanel } from "./CreditsPanel";
import { LogsPanel } from "./LogsPanel";
import { MetricsPanel } from "./MetricsPanel";
import { type DashboardSection, Sidebar } from "./Sidebar";
import { SourceBar } from "./SourceBar";

export function Dashboard() {
  const [section, setSection] = useState<DashboardSection>("agents");
  const { isAuthenticated: authed } = useAuth();

  // Snap back to agents section if user signs out while on credits
  useEffect(() => {
    if (!authed && section === "credits") {
      setSection("agents");
    }
  }, [authed, section]);

  // Listen for navigate-section events (e.g. from "Add Credits" button in deploy error)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setSection(detail as DashboardSection);
    };
    window.addEventListener("navigate-section", handler);
    return () => window.removeEventListener("navigate-section", handler);
  }, []);

  return (
    <AgentProvider>
      <div
        data-testid="dashboard"
        className="min-h-screen bg-dark text-text-light"
      >
        <div className="pt-[56px] flex min-h-screen flex-col md:flex-row">
          <Sidebar active={section} onChange={setSection} />
          <div className="flex-1 flex flex-col min-w-0">
            <SourceBar />
            <CloudLoginPrompt />
            <main className="flex-1 px-4 sm:px-5 md:px-8 py-4 sm:py-6">
              <DashboardContent section={section} />
            </main>
          </div>
        </div>
      </div>
    </AgentProvider>
  );
}

/** Show cloud login banner only when user isn't authenticated */
function CloudLoginPrompt() {
  const { refresh } = useAgents();
  const { isAuthenticated: authed } = useAuth();
  if (authed) return null;
  return <CloudLoginBanner onAuthenticated={() => refresh()} />;
}

function DashboardContent({ section }: { section: DashboardSection }) {
  switch (section) {
    case "agents":
      return <AgentGrid />;
    case "metrics":
      return <MetricsPanel />;
    case "logs":
      return <LogsPanel />;
    case "credits":
      return <CreditsPanel />;
  }
}
