import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Dashboard, Homepage } from "./App";
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
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/onboard" element={<Navigate to="/dashboard" replace />} />
      <Route element={<NavLayout />}>
        {/* Consumer docs at milady.ai/docs — see apps/homepage/src/docs/registry.ts */}
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<DocsLanding />} />
          {/* Developer lander is hand-authored, matches before :tier */}
          <Route path="developer" element={<DocsPage />} />
          <Route path=":tier" element={<TierLanding />} />
          <Route path=":tier/:slug" element={<DocsPage />} />
        </Route>
        <Route path="/guides" element={<GuidesLanding />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
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
