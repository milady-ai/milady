import type * as React from "react";

import type { SidebarProps } from "../../components/composites/sidebar";

export interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar: React.ReactElement<SidebarProps>;
  contentHeader?: React.ReactNode;
  contentHeaderClassName?: string;
  contentClassName?: string;
  contentInnerClassName?: string;
  contentRef?: React.Ref<HTMLElement>;
  sidebarCollapsible?: boolean;
  mobileSidebarLabel?: React.ReactNode;
  mobileSidebarTriggerClassName?: string;
}

export interface PageLayoutMobileDrawerProps {
  isDesktop: boolean;
  mobileSidebarLabel?: React.ReactNode;
  mobileSidebarOpen: boolean;
  mobileSidebarTriggerClassName?: string;
  onMobileSidebarOpenChange: (open: boolean) => void;
  sidebar: React.ReactElement<SidebarProps>;
}
