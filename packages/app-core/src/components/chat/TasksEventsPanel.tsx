/**
 * Chat workspace widget bar.
 *
 * Desktop: persistent right rail alongside /chat.
 * Mobile: sheet content toggled from the chat header.
 *
 * The panel only lays out widget modules. Widget behavior lives in
 * plugin-scoped widget definitions under ./widgets/plugins.
 */

import { useMemo } from "react";
import type { ActivityEvent } from "../../hooks/useActivityEvents";
import { useApp } from "../../state";
import { FavoriteAppsBar } from "./FavoriteAppsBar";
import { resolveChatSidebarWidgets } from "./widgets/registry";

interface TasksEventsPanelProps {
  open: boolean;
  /** Activity events from the parent — kept alive even when the panel unmounts. */
  events: ActivityEvent[];
  clearEvents: () => void;
  /** When true, renders as full-width content (inside a mobile DrawerSheet). */
  mobile?: boolean;
}

export function TasksEventsPanel({
  open,
  events,
  clearEvents,
  mobile = false,
}: TasksEventsPanelProps) {
  const { plugins } = useApp();
  const widgetDefinitions = useMemo(
    () => resolveChatSidebarWidgets(plugins ?? []),
    [plugins],
  );

  if (!open) return null;

  const rootClassName = mobile
    ? "flex flex-1 min-h-0 flex-col overflow-hidden bg-bg"
    : "flex min-h-0 w-[22rem] shrink-0 flex-col overflow-hidden border-l border-border bg-bg";

  return (
    <aside className={rootClassName} data-testid="chat-widgets-bar">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <FavoriteAppsBar />
        {widgetDefinitions.length === 0 ? (
          <div className="py-3 text-xs text-muted">
            No plugin widgets are enabled for this chat view.
          </div>
        ) : (
          widgetDefinitions.map(({ id, Component }) => (
            <Component key={id} events={events} clearEvents={clearEvents} />
          ))
        )}
      </div>
    </aside>
  );
}
