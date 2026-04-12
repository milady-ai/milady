import type { Plugin } from "@elizaos/core";
import { manageLifeOpsBrowserAction } from "./action";
import { lifeOpsBrowserProvider } from "./provider";
import { LifeOpsBrowserPluginService } from "./service";

export const lifeOpsBrowserPlugin: Plugin = {
  name: "@miladyai/plugin-lifeops-browser",
  description:
    "Surfaces and controls the user's personal LifeOps Browser companions for Chrome and Safari, separate from the Milady browser workspace.",
  actions: [manageLifeOpsBrowserAction],
  providers: [lifeOpsBrowserProvider],
  services: [LifeOpsBrowserPluginService],
};

export {
  LifeOpsBrowserPluginService,
  lifeOpsBrowserProvider,
  manageLifeOpsBrowserAction,
};

export default lifeOpsBrowserPlugin;
