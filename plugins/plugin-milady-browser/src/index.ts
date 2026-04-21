import type { Plugin } from "@elizaos/core";
import { manageMiladyBrowserWorkspaceAction } from "./action";
import { miladyBrowserWorkspaceProvider } from "./provider";
import { MiladyBrowserWorkspaceService } from "./service";
import {
  approveMiladyWalletRequestAction,
  rejectMiladyWalletRequestAction,
  signWithMiladyWalletAction,
} from "./wallet-action";

export const miladyBrowserPlugin: Plugin = {
  name: "@miladyai/plugin-milady-browser",
  description:
    "Controls Milady browser workspace tabs and Steward wallet signing requests across the desktop bridge and web iframe workspace.",
  actions: [
    manageMiladyBrowserWorkspaceAction,
    signWithMiladyWalletAction,
    approveMiladyWalletRequestAction,
    rejectMiladyWalletRequestAction,
  ],
  providers: [miladyBrowserWorkspaceProvider],
  services: [MiladyBrowserWorkspaceService],
};

export {
  approveMiladyWalletRequestAction,
  MiladyBrowserWorkspaceService,
  manageMiladyBrowserWorkspaceAction,
  miladyBrowserWorkspaceProvider,
  rejectMiladyWalletRequestAction,
  signWithMiladyWalletAction,
};

export default miladyBrowserPlugin;
