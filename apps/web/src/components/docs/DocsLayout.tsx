import { MDXProvider } from "@mdx-js/react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DocsSidebar } from "./DocsSidebar";
import { mdxComponents } from "./mdx-components";

/**
 * DocsLayout — shell for every /docs/* route.
 *
 * Layout:
 *   [ fixed Nav header from parent NavLayout, 56px tall ]
 *   [ docs content area: sidebar (desktop) | outlet | TOC (xl) ]
 *
 * Mobile: sidebar collapses into a slide-out drawer triggered by a button
 * at the top of the content area. The drawer closes automatically on route
 * change.
 *
 * Wraps the outlet in <MDXProvider> so custom shortcodes (<Callout>,
 * <Steps>, <Screenshot>) resolve inside .mdx pages without explicit imports.
 */
export function DocsLayout() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes. The pathname is a
  // trigger-only dependency — the effect body doesn't read it — but the
  // re-run is necessary for browser back/forward navigation and in-content
  // links that bypass the sidebar's own onNavigate callback.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep; see comment above
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <MDXProvider components={mdxComponents}>
      <div className="pt-[56px] min-h-screen bg-dark">
        {/* Mobile sidebar toggle — visible only below md */}
        <div className="md:hidden border-b border-border bg-dark px-4 py-2 sticky top-[56px] z-40 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
            aria-label="Toggle documentation navigation"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-light"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            {drawerOpen ? "Close menu" : "Docs menu"}
          </button>
        </div>

        <div className="mx-auto max-w-[1400px] flex gap-0 md:gap-8 px-0 md:px-6 lg:px-8">
          {/* Desktop sidebar */}
          <aside className="hidden md:block w-[240px] shrink-0 border-r border-border min-h-[calc(100vh-56px)] py-8 pr-6">
            <div className="sticky top-[76px]">
              <DocsSidebar />
            </div>
          </aside>

          {/* Mobile drawer */}
          {drawerOpen && (
            <div
              className="md:hidden fixed inset-0 top-[56px] z-40 bg-dark/95 backdrop-blur-sm overflow-y-auto pt-4 pb-12 px-6"
              role="dialog"
              aria-label="Documentation navigation"
            >
              <DocsSidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          )}

          {/* Main content area */}
          <main
            data-docs-content
            className="min-w-0 flex-1 py-8 md:py-12 px-4 md:px-0"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </MDXProvider>
  );
}
