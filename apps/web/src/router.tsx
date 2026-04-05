import { Outlet, Route, Routes } from "react-router-dom";
import { Homepage } from "./App";
import { CreateAgent } from "./components/dashboard/CreateAgent";
import { Dashboard } from "./components/dashboard/Dashboard";
import { DocsLanding } from "./components/docs/DocsLanding";
import { DocsLayout } from "./components/docs/DocsLayout";
import { DocsPage } from "./components/docs/DocsPage";
import { TierLanding } from "./components/docs/TierLanding";
import { GuidesLanding } from "./components/guides/GuidesLanding";
import { Nav } from "./components/Nav";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route element={<NavLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        {/* Consumer docs at milady.ai/docs — see apps/web/src/docs/registry.ts */}
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsLanding />} />
          {/* Developer lander is hand-authored, matches before :tier */}
          <Route path="developer" element={<DocsPage />} />
          <Route path=":tier" element={<TierLanding />} />
          <Route path=":tier/:slug" element={<DocsPage />} />
        </Route>
        {/* Legacy onboarding diagrams — kept for now, lives off /guides */}
        <Route path="/guides" element={<GuidesLanding />} />
        <Route path="/onboard" element={<CreateAgent />} />
      </Route>
    </Routes>
  );
}

function NavLayout() {
  return (
    <>
      <Nav />
      <Outlet />
    </>
  );
}
