import { type IAgentRuntime, Service } from "@elizaos/core";

export class MiladyBrowserWorkspaceService extends Service {
  static serviceType = "milady_browser_workspace";

  capabilityDescription =
    "Controls Milady browser workspace tabs across the desktop bridge and web iframe workspace, alongside Steward wallet signing requests.";

  static override async start(
    runtime: IAgentRuntime,
  ): Promise<MiladyBrowserWorkspaceService> {
    return new MiladyBrowserWorkspaceService(runtime);
  }
}
