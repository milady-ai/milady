import * as React from "react";
import { cn } from "../../lib/utils";
import { PageLayoutHeader } from "./page-layout-header";
import { PageLayoutMobileDrawer } from "./page-layout-mobile-drawer";
import type { PageLayoutProps } from "./page-layout-types";

function usePageLayoutDesktopMode() {
  const [isDesktop, setIsDesktop] = React.useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return true;
    }
    return window.matchMedia("(min-width: 768px)").matches;
  });

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      setIsDesktop(true);
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mediaQuery.matches);

    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return isDesktop;
}

export function PageLayout({
  children,
  className,
  contentClassName,
  contentHeader,
  contentHeaderClassName,
  contentInnerClassName,
  contentRef,
  mobileSidebarLabel,
  mobileSidebarTriggerClassName,
  sidebarCollapsible = true,
  sidebar,
  ...props
}: PageLayoutProps) {
  const isDesktop = usePageLayoutDesktopMode();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    if (isDesktop) {
      setMobileSidebarOpen(false);
    }
  }, [isDesktop]);

  const desktopSidebarElement = React.cloneElement(sidebar, {
    className: cn("!mt-0 !h-full", sidebar.props.className),
    collapsible: sidebar.props.collapsible ?? (sidebarCollapsible && isDesktop),
    variant: sidebar.props.variant ?? "default",
  });

  return (
    <div
      className={cn(
        "flex flex-1 w-full min-h-0 min-w-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      {contentHeader ? (
        <div className="shrink-0 px-4 pt-2 sm:px-6 sm:pt-3 lg:px-7 lg:pt-4">
          <PageLayoutHeader className={contentHeaderClassName}>
            {contentHeader}
          </PageLayoutHeader>
        </div>
      ) : null}
      <div className="flex flex-1 w-full min-h-0 overflow-hidden flex-col md:flex-row">
        <div className="hidden min-h-0 w-full shrink-0 items-stretch px-0 pb-0 pt-2 sm:pt-3 md:flex md:w-auto lg:pt-4">
          {desktopSidebarElement}
        </div>
        <main
          ref={contentRef}
          className={cn(
            "chat-native-scrollbar relative flex flex-1 w-0 flex-col overflow-x-hidden overflow-y-auto bg-transparent px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-7 lg:pb-7 lg:pt-4",
            contentClassName,
          )}
        >
          <PageLayoutMobileDrawer
            isDesktop={isDesktop}
            mobileSidebarLabel={mobileSidebarLabel}
            mobileSidebarOpen={mobileSidebarOpen}
            mobileSidebarTriggerClassName={mobileSidebarTriggerClassName}
            onMobileSidebarOpenChange={setMobileSidebarOpen}
            sidebar={sidebar}
          />
        <div className={cn("flex flex-1 flex-col w-full min-h-0", contentInnerClassName)}>
          {children}
        </div>
        </main>
      </div>
    </div>
  );
}
