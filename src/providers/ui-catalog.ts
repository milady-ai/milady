import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { COMPONENT_CATALOG } from "../shared/ui-catalog-prompt";

export const uiCatalogProvider: Provider = {
  name: "uiCatalog",
  get: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const catalogSummary = Object.entries(COMPONENT_CATALOG)
      .map(([name, meta]) => `- ${name}: ${meta.description}`)
      .join("\n");
    return `Available UI Components:\n${catalogSummary}`;
  },
};
