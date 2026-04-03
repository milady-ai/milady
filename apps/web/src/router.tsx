import { Outlet, Route, Routes } from "react-router-dom";
import { Homepage } from "./App";
import { CreateAgent } from "./components/dashboard/CreateAgent";
import { Dashboard } from "./components/dashboard/Dashboard";
import { GuidesLanding } from "./components/guides/GuidesLanding";
import { Nav } from "./components/Nav";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route element={<NavLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/docs" element={<GuidesLanding />} />
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
