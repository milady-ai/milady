import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { releaseData } from "../generated/release-data";

export function Nav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isOnDashboard = location.pathname === "/dashboard";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center justify-between px-4 sm:px-5 md:px-8 h-[56px]">
        {/* Brand mark — square logo container */}
        <Link
          to="/dashboard"
          className="group flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="w-10 h-10 rounded-sm overflow-hidden bg-surface flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Milady"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-lg sm:text-xl font-black tracking-tighter uppercase text-white">
            MILADY
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            to="/dashboard"
            className={`px-4 py-2 font-mono text-[11px] tracking-wide transition-all duration-150
              ${
                isOnDashboard
                  ? "text-brand bg-brand/10 border border-brand/30"
                  : "text-text-muted border border-transparent hover:text-text-light hover:border-border"
              }`}
          >
            DASHBOARD
          </Link>

          <a
            href={releaseData.release.url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 px-3 py-1.5 font-mono text-[11px] tracking-wide uppercase text-brand border border-brand/40 rounded-sm
              hover:bg-brand hover:text-dark hover:border-brand transition-all duration-150"
          >
            RELEASES
          </a>

          {/* Version indicator */}
          <div className="ml-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-[status-pulse_2s_ease-in-out_infinite]" />
            <span className="font-mono text-[10px] text-text-subtle tracking-wider">
              {releaseData.release.tagName}
            </span>
          </div>
        </div>

        {/* Mobile nav toggle */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
            className="inline-flex items-center justify-center w-10 h-10 border border-border text-text-light 
              hover:bg-surface transition-colors"
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {mobileOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7h16M4 12h16M4 17h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-dark-secondary px-4 py-4 space-y-1">
          <Link
            to="/dashboard"
            className={`block w-full px-4 py-3 font-mono text-xs tracking-wide transition-colors ${
              isOnDashboard
                ? "text-brand bg-brand/5"
                : "text-text-muted hover:text-text-light hover:bg-surface"
            }`}
            onClick={() => setMobileOpen(false)}
          >
            DASHBOARD
          </Link>

          <div className="pt-3 border-t border-border-subtle">
            <a
              href={releaseData.release.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-4 py-3 font-mono text-xs tracking-wide 
                text-brand bg-brand/5 border border-brand/20"
              onClick={() => setMobileOpen(false)}
            >
              <span>DOWNLOAD</span>
              <span className="text-[10px] text-text-subtle">
                {releaseData.release.tagName}
              </span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
