/**
 * Apps View — Lit component for browsing, installing, and launching ElizaOS apps.
 *
 * Displays a grid of app cards fetched from the registry, with install/launch
 * actions. Running apps show a "Playing" indicator and can be stopped.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  client,
  type RegistryAppInfo,
  type InstalledAppInfo,
  type RunningAppInfo,
} from "./api-client.js";

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
};

const LAUNCH_TYPE_LABELS: Record<string, string> = {
  url: "Web App",
  local: "Local Server",
  connect: "Remote Server",
};

@customElement("apps-view")
export class AppsView extends LitElement {
  @state() private registryApps: RegistryAppInfo[] = [];
  @state() private installedApps: InstalledAppInfo[] = [];
  @state() private runningApps: RunningAppInfo[] = [];
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private searchQuery = "";
  @state() private busyApp: string | null = null;
  @state() private busyAction: string | null = null;

  static styles = css`
    :host {
      display: block;
      padding: 0;
    }

    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .search-bar input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input-bg, var(--card));
      color: var(--text);
      font-size: 14px;
      outline: none;
    }

    .search-bar input:focus {
      border-color: var(--accent, #6366f1);
    }

    .apps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .app-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      background: var(--card);
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: border-color 0.15s;
    }

    .app-card:hover {
      border-color: var(--accent, #6366f1);
    }

    .app-card.running {
      border-color: #22c55e;
      box-shadow: 0 0 0 1px #22c55e33;
    }

    .app-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .app-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: var(--accent, #6366f1);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .app-icon img {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      object-fit: cover;
    }

    .app-title {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-strong, var(--text));
    }

    .app-meta {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      background: var(--badge-bg, #f1f5f9);
      color: var(--badge-text, #475569);
    }

    .badge.running {
      background: #dcfce7;
      color: #166534;
    }

    .badge.category {
      background: #ede9fe;
      color: #5b21b6;
    }

    .badge.launch-type {
      background: #e0f2fe;
      color: #0c4a6e;
    }

    .app-description {
      font-size: 13px;
      color: var(--text-muted, #64748b);
      line-height: 1.4;
      flex: 1;
    }

    .app-capabilities {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .capability-tag {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 4px;
      background: var(--tag-bg, #f8fafc);
      color: var(--tag-text, #64748b);
      border: 1px solid var(--border);
    }

    .app-actions {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .btn {
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s;
    }

    .btn:hover {
      background: var(--hover, #f1f5f9);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn.primary {
      background: var(--accent, #6366f1);
      color: white;
      border-color: var(--accent, #6366f1);
    }

    .btn.primary:hover {
      opacity: 0.9;
    }

    .btn.danger {
      color: #dc2626;
      border-color: #dc262644;
    }

    .btn.danger:hover {
      background: #fef2f2;
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
      color: var(--text-muted, #64748b);
    }

    .empty-state h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text);
    }

    .error-banner {
      padding: 12px 16px;
      border-radius: 8px;
      background: #fef2f2;
      color: #991b1b;
      margin-bottom: 16px;
      font-size: 13px;
    }

    .loading {
      text-align: center;
      padding: 48px;
      color: var(--text-muted, #64748b);
    }

    .stars {
      font-size: 11px;
      color: var(--text-muted, #64748b);
    }

    .app-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.loadApps();
  }

  private async loadApps() {
    this.loading = true;
    this.error = null;

    const [registryResult, installedResult, runningResult] = await Promise.allSettled([
      client.listApps(),
      client.listInstalledApps(),
      client.listRunningApps(),
    ]);

    if (registryResult.status === "fulfilled") {
      this.registryApps = registryResult.value;
    } else {
      this.error = `Failed to load apps: ${registryResult.reason instanceof Error ? registryResult.reason.message : String(registryResult.reason)}`;
    }

    if (installedResult.status === "fulfilled") {
      this.installedApps = installedResult.value;
    }

    if (runningResult.status === "fulfilled") {
      this.runningApps = runningResult.value;
    }

    this.loading = false;
  }

  private isInstalled(name: string): boolean {
    return this.installedApps.some((a) => a.name === name);
  }

  private isRunning(name: string): boolean {
    return this.runningApps.some((a) => a.name === name);
  }

  private getRunningUrl(name: string): string | null {
    const running = this.runningApps.find((a) => a.name === name);
    return running?.url ?? null;
  }

  private async handleInstall(name: string) {
    this.busyApp = name;
    this.busyAction = "installing";

    const result = await client.installApp(name);
    if (result.success) {
      await this.loadApps();
    } else {
      this.error = `Install failed: ${result.error ?? "unknown error"}`;
    }

    this.busyApp = null;
    this.busyAction = null;
  }

  private async handleLaunch(name: string) {
    this.busyApp = name;
    this.busyAction = "launching";

    const result = await client.launchApp(name);

    // For url and connect types, open in new tab
    if (result.launchType === "url" || result.launchType === "connect" || result.launchType === "tab") {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else if (result.launchType === "local") {
      // For local apps, open in new tab
      window.open(result.url, "_blank", "noopener,noreferrer");
    }

    await this.loadApps();
    this.busyApp = null;
    this.busyAction = null;
  }

  private async handleStop(name: string) {
    this.busyApp = name;
    this.busyAction = "stopping";

    await client.stopApp(name);
    await this.loadApps();

    this.busyApp = null;
    this.busyAction = null;
  }

  private async handleSearch(e: InputEvent) {
    const input = e.target as HTMLInputElement;
    this.searchQuery = input.value;

    if (!this.searchQuery.trim()) {
      await this.loadApps();
      return;
    }

    this.loading = true;
    const results = await client.searchApps(this.searchQuery);
    this.registryApps = results;
    this.loading = false;
  }

  private renderAppCard(app: RegistryAppInfo) {
    const installed = this.isInstalled(app.name);
    const running = this.isRunning(app.name);
    const isBusy = this.busyApp === app.name;
    const runningUrl = this.getRunningUrl(app.name);
    const initial = app.displayName.charAt(0).toUpperCase();

    return html`
      <div class="app-card ${running ? "running" : ""}">
        <div class="app-header">
          <div class="app-icon">
            ${app.icon
              ? html`<img src="${app.icon}" alt="${app.displayName}" />`
              : initial}
          </div>
          <div>
            <div class="app-title">${app.displayName}</div>
            <div class="app-meta">
              <span class="badge category">${CATEGORY_LABELS[app.category] ?? app.category}</span>
              <span class="badge launch-type">${LAUNCH_TYPE_LABELS[app.launchType] ?? app.launchType}</span>
              ${running ? html`<span class="badge running">Playing</span>` : ""}
            </div>
          </div>
        </div>

        <div class="app-description">
          ${app.description || "No description available."}
        </div>

        ${app.capabilities.length > 0
          ? html`
              <div class="app-capabilities">
                ${app.capabilities.map(
                  (c) => html`<span class="capability-tag">${c}</span>`
                )}
              </div>
            `
          : ""}

        <div class="app-footer">
          <span class="stars">${app.stars > 0 ? `${app.stars} stars` : ""}</span>
          <div class="app-actions">
            ${running
              ? html`
                  ${runningUrl
                    ? html`<button
                        class="btn primary"
                        @click=${() => window.open(runningUrl, "_blank", "noopener,noreferrer")}
                      >
                        Open
                      </button>`
                    : ""}
                  <button
                    class="btn danger"
                    ?disabled=${isBusy}
                    @click=${() => this.handleStop(app.name)}
                  >
                    ${isBusy && this.busyAction === "stopping" ? "Stopping..." : "Stop"}
                  </button>
                `
              : installed
                ? html`
                    <button
                      class="btn primary"
                      ?disabled=${isBusy}
                      @click=${() => this.handleLaunch(app.name)}
                    >
                      ${isBusy && this.busyAction === "launching" ? "Launching..." : "Launch"}
                    </button>
                  `
                : html`
                    <button
                      class="btn"
                      ?disabled=${isBusy}
                      @click=${() => this.handleInstall(app.name)}
                    >
                      ${isBusy && this.busyAction === "installing" ? "Installing..." : "Install"}
                    </button>
                  `}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">Loading apps...</div>`;
    }

    return html`
      ${this.error
        ? html`<div class="error-banner">${this.error}</div>`
        : ""}

      <div class="search-bar">
        <input
          type="text"
          placeholder="Search apps..."
          .value=${this.searchQuery}
          @input=${this.handleSearch}
        />
        <button class="btn" @click=${() => this.loadApps()}>Refresh</button>
      </div>

      ${this.registryApps.length === 0
        ? html`
            <div class="empty-state">
              <h3>No apps found</h3>
              <p>
                ${this.searchQuery
                  ? "No apps match your search. Try a different query."
                  : "No apps are registered yet. Apps will appear here once they are published to the ElizaOS registry."}
              </p>
            </div>
          `
        : html`
            <div class="apps-grid">
              ${this.registryApps.map((app) => this.renderAppCard(app))}
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "apps-view": AppsView;
  }
}
