import type {
  BrowserWorkspaceSnapshot,
  BrowserWorkspaceTab,
  NavigateBrowserWorkspaceTabRequest,
  OpenBrowserWorkspaceTabRequest,
} from "@miladyai/agent/services/browser-workspace";
import { MiladyClient } from "./client-base";

declare module "./client-base" {
  interface MiladyClient {
    getBrowserWorkspace(): Promise<BrowserWorkspaceSnapshot>;
    openBrowserWorkspaceTab(request: OpenBrowserWorkspaceTabRequest): Promise<{
      tab: BrowserWorkspaceTab;
    }>;
    navigateBrowserWorkspaceTab(
      id: string,
      url: string,
    ): Promise<{ tab: BrowserWorkspaceTab }>;
    showBrowserWorkspaceTab(id: string): Promise<{ tab: BrowserWorkspaceTab }>;
    hideBrowserWorkspaceTab(id: string): Promise<{ tab: BrowserWorkspaceTab }>;
    closeBrowserWorkspaceTab(id: string): Promise<{ closed: boolean }>;
  }
}

MiladyClient.prototype.getBrowserWorkspace = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/browser-workspace");
};

MiladyClient.prototype.openBrowserWorkspaceTab = async function (
  this: MiladyClient,
  request,
) {
  return this.fetch("/api/browser-workspace/tabs", {
    method: "POST",
    body: JSON.stringify(request),
  });
};

MiladyClient.prototype.navigateBrowserWorkspaceTab = async function (
  this: MiladyClient,
  id,
  url,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/navigate`,
    {
      method: "POST",
      body: JSON.stringify({ url } satisfies Pick<
        NavigateBrowserWorkspaceTabRequest,
        "url"
      >),
    },
  );
};

MiladyClient.prototype.showBrowserWorkspaceTab = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/show`,
    {
      method: "POST",
    },
  );
};

MiladyClient.prototype.hideBrowserWorkspaceTab = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(
    `/api/browser-workspace/tabs/${encodeURIComponent(id)}/hide`,
    {
      method: "POST",
    },
  );
};

MiladyClient.prototype.closeBrowserWorkspaceTab = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/browser-workspace/tabs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};
