import { AGENT_ORCHESTRATOR_PLUGIN_WIDGETS } from "./plugins/agent-orchestrator";
import { LIFEOPS_OVERVIEW_WIDGETS } from "./plugins/lifeops-overview";
import { LIFEOPS_WIDGETS } from "./plugins/lifeops";
import type {
  ChatSidebarPluginState,
  ChatSidebarWidgetDefinition,
} from "./types";

const CHAT_SIDEBAR_WIDGETS: ChatSidebarWidgetDefinition[] = [
  ...LIFEOPS_OVERVIEW_WIDGETS,
  ...LIFEOPS_WIDGETS,
  ...AGENT_ORCHESTRATOR_PLUGIN_WIDGETS,
];

function isWidgetEnabled(
  widget: ChatSidebarWidgetDefinition,
  plugins: readonly ChatSidebarPluginState[],
): boolean {
  if (plugins.length === 0) {
    return widget.defaultEnabled;
  }

  const plugin = plugins.find((candidate) => candidate.id === widget.pluginId);
  if (!plugin) {
    return false;
  }

  return plugin.isActive === true || plugin.enabled !== false;
}

export function resolveChatSidebarWidgets(
  plugins: readonly ChatSidebarPluginState[],
): ChatSidebarWidgetDefinition[] {
  return CHAT_SIDEBAR_WIDGETS.filter((widget) =>
    isWidgetEnabled(widget, plugins),
  ).sort((left, right) => left.order - right.order);
}
