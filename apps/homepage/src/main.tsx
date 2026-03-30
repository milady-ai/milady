import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { consumeUrlToken } from "./lib/auth";
import { getSpaFallbackRedirectTarget } from "./lib/spa-fallback";
import { AppRoutes } from "./router";

const spaRedirectTarget = getSpaFallbackRedirectTarget(window.location);
if (spaRedirectTarget) {
  window.history.replaceState({}, "", spaRedirectTarget);
}

consumeUrlToken();

const root = document.getElementById("root");
if (!root) throw new Error("No root element");

createRoot(root).render(
  <ErrorBoundary>
    <StrictMode>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </StrictMode>
  </ErrorBoundary>,
);
