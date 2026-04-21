/**
 * ContentLayout — single-pane layout shell for views without a sidebar.
 *
 * Mirrors PageLayout's padding, contentHeader placement, and scroll
 * behavior but without the sidebar column. Every single-pane page
 * (Logs, FineTuning, Desktop, Security, Database SQL mode) should
 * use this instead of a bare `<div>`.
 */

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { PageLayoutHeader } from "../page-layout/page-layout-header";

export interface ContentLayoutProps {
  /** Optional header rendered above the content (e.g. SegmentedControl nav). */
  contentHeader?: ReactNode;
  /** Content body. */
  children: ReactNode;
  /** When true, strips outer padding for modal embedding. */
  inModal?: boolean;
  /** Additional classes on the outer scroll container. */
  className?: string;
  /** Additional classes on the inner content wrapper. */
  contentClassName?: string;
}

const CONTENT_PADDING =
  "px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3 lg:px-7 lg:pb-7 lg:pt-4";

export function ContentLayout({
  contentHeader,
  children,
  inModal,
  className,
  contentClassName,
}: ContentLayoutProps) {
  return (
    <div
      className={cn(
        "chat-native-scrollbar relative flex flex-1 min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto bg-transparent",
        !inModal && CONTENT_PADDING,
        className,
      )}
    >
      {contentHeader ? (
        <PageLayoutHeader>{contentHeader}</PageLayoutHeader>
      ) : null}
      <div className={cn("flex flex-1 flex-col min-h-0", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
