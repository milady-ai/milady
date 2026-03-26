/**
 * Plugins view — single unified plugin management surface.
 */

import { PluginsView } from "./PluginsView";

export function PluginsPageView({ inModal }: { inModal?: boolean } = {}) {
  return <PluginsView mode="all-social" inModal={inModal ?? false} />;
}
