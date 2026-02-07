/**
 * Main Milaidy App component.
 *
 * Single-agent dashboard with onboarding wizard, chat, plugins, skills,
 * config, and logs views.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  client,
  type AgentStatus,
  type ChatMessage,
  type PluginInfo,
  type SkillInfo,
  type LogEntry,
  type OnboardingOptions,
  type ExtensionStatus,
} from "./api-client.js";
import { tabFromPath, pathForTab, type Tab, TAB_GROUPS, titleForTab } from "./navigation.js";

const CHAT_STORAGE_KEY = "milaidy:chatMessages";

@customElement("milaidy-app")
export class MilaidyApp extends LitElement {
  // --- State ---
  @state() tab: Tab = "chat";
  @state() connected = false;
  @state() agentStatus: AgentStatus | null = null;
  @state() onboardingComplete = false;
  @state() onboardingLoading = true;
  @state() chatMessages: ChatMessage[] = [];
  @state() chatInput = "";
  @state() chatSending = false;
  @state() plugins: PluginInfo[] = [];
  @state() pluginFilter: "all" | "ai-provider" | "connector" | "database" | "feature" = "all";
  @state() skills: SkillInfo[] = [];
  @state() logs: LogEntry[] = [];

  // Chrome extension state
  @state() extensionStatus: ExtensionStatus | null = null;
  @state() extensionChecking = false;

  // Onboarding wizard state
  @state() onboardingStep = 0;
  @state() onboardingOptions: OnboardingOptions | null = null;
  @state() onboardingName = "";
  @state() onboardingStyle = "";
  @state() onboardingProvider = "";
  @state() onboardingApiKey = "";
  @state() onboardingTelegramToken = "";
  @state() onboardingDiscordToken = "";

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: var(--font-body);
      color: var(--text);
      background: var(--bg);
    }

    /* Layout */
    .app-shell {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Header */
    header {
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 18px;
      font-weight: bold;
      color: var(--text-strong);
      text-decoration: none;
    }

    .logo:hover {
      color: var(--accent);
      text-decoration: none;
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }

    .status-pill {
      padding: 2px 10px;
      border: 1px solid var(--border);
      font-size: 12px;
      font-family: var(--mono);
    }

    .status-pill.running { border-color: var(--ok); color: var(--ok); }
    .status-pill.paused { border-color: var(--warn); color: var(--warn); }
    .status-pill.stopped { border-color: var(--muted); color: var(--muted); }
    .status-pill.restarting { border-color: var(--warn); color: var(--warn); }
    .status-pill.error { border-color: var(--danger, #e74c3c); color: var(--danger, #e74c3c); }

    .lifecycle-btn {
      padding: 4px 12px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--mono);
    }

    .lifecycle-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Navigation */
    nav {
      border-bottom: 1px solid var(--border);
      padding: 8px 0;
    }

    nav a {
      display: inline-block;
      padding: 4px 12px;
      margin-right: 4px;
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      border-bottom: 2px solid transparent;
    }

    nav a:hover {
      color: var(--text);
      text-decoration: none;
    }

    nav a.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* Main content */
    main {
      padding: 24px 0;
      min-height: 60vh;
    }

    h2 {
      font-size: 18px;
      font-weight: normal;
      margin: 0 0 8px 0;
      color: var(--text-strong);
    }

    .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 20px;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--border);
      padding: 16px 0;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }

    /* Onboarding */
    .onboarding {
      max-width: 500px;
      margin: 40px auto;
      text-align: center;
    }

    .onboarding h1 {
      font-size: 24px;
      font-weight: normal;
      margin-bottom: 8px;
    }

    .onboarding p {
      color: var(--muted);
      margin-bottom: 24px;
    }

    .onboarding-avatar {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid var(--border);
      margin: 0 auto 20px;
      display: block;
    }

    .onboarding-welcome-title {
      font-family: var(--font-body);
      font-size: 28px;
      font-weight: normal;
      margin-bottom: 4px;
      color: var(--text-strong);
    }

    .onboarding-welcome-sub {
      font-style: italic;
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 32px;
    }

    .onboarding-speech {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 0 auto 24px;
      max-width: 360px;
      position: relative;
      font-size: 15px;
      color: var(--text);
      line-height: 1.5;
    }

    .onboarding-speech::after {
      content: "";
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 14px;
      height: 14px;
      background: var(--card);
      border-left: 1px solid var(--border);
      border-top: 1px solid var(--border);
    }

    .onboarding-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }

    .onboarding-option {
      padding: 12px 16px;
      border: 1px solid var(--border);
      cursor: pointer;
      background: var(--card);
    }

    .onboarding-option:hover {
      border-color: var(--accent);
    }

    .onboarding-option.selected {
      border-color: var(--accent);
      background: var(--accent-subtle);
    }

    .onboarding-option .label {
      font-weight: bold;
      font-size: 14px;
    }

    .onboarding-option .hint {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    .onboarding-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 14px;
      margin-top: 8px;
    }

    .onboarding-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .btn {
      padding: 8px 24px;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
      cursor: pointer;
      font-size: 14px;
      margin-top: 20px;
    }

    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-outline {
      background: transparent;
      color: var(--accent);
    }

    .btn-outline:hover {
      background: var(--accent-subtle);
    }

    .btn-row {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 20px;
    }

    /* Chat */
    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 200px);
      min-height: 400px;
    }

    .chat-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .clear-btn {
      padding: 4px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--mono);
    }

    .clear-btn:hover {
      border-color: var(--danger, #e74c3c);
      color: var(--danger, #e74c3c);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .chat-msg {
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .chat-msg .role {
      font-weight: bold;
      font-size: 13px;
      color: var(--muted-strong);
      margin-bottom: 2px;
    }

    .chat-msg.user .role { color: var(--text-strong); }
    .chat-msg.assistant .role { color: var(--accent); }

    .chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    .chat-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: none;
      overflow-y: hidden;
      min-height: 38px;
      max-height: 200px;
      box-sizing: border-box;
    }

    .chat-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .chat-send-btn {
      margin-top: 0;
      height: 38px;
      align-self: flex-end;
    }

    .start-agent-box {
      text-align: center;
      padding: 40px;
      border: 1px solid var(--border);
      margin-top: 20px;
    }

    .start-agent-box p {
      color: var(--muted);
      margin-bottom: 16px;
    }

    /* Plugin list */
    .plugin-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .plugin-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border: 1px solid var(--border);
      background: var(--card);
    }

    .plugin-item .plugin-name {
      font-weight: bold;
      font-size: 14px;
    }

    .plugin-item .plugin-desc {
      font-size: 12px;
      color: var(--muted);
    }

    .plugin-item .plugin-status {
      font-size: 12px;
      font-family: var(--mono);
      padding: 2px 8px;
      border: 1px solid var(--border);
    }

    .plugin-item .plugin-status.enabled {
      color: var(--ok);
      border-color: var(--ok);
    }

    /* Logs */
    .logs-container {
      font-family: var(--mono);
      font-size: 12px;
      max-height: 500px;
      overflow-y: auto;
      border: 1px solid var(--border);
      padding: 8px;
      background: var(--card);
    }

    .log-entry {
      padding: 2px 0;
      border-bottom: 1px solid var(--bg-muted);
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
      font-style: italic;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.initializeApp();
    window.addEventListener("popstate", this.handlePopState);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
    client.disconnectWs();
  }

  private handlePopState = (): void => {
    const tab = tabFromPath(window.location.pathname);
    if (tab) this.tab = tab;
  };

  private async initializeApp(): Promise<void> {
    // Check onboarding status.  In Electron the API base URL is injected
    // asynchronously after the agent runtime starts, so retry a few times
    // with exponential backoff.
    const MAX_RETRIES = 15;
    const BASE_DELAY_MS = 1000;
    const MAX_DELAY_MS = 5000;
    let serverReady = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { complete } = await client.getOnboardingStatus();
        this.onboardingComplete = complete;
        if (!complete) {
          const options = await client.getOnboardingOptions();
          this.onboardingOptions = options;
        }
        serverReady = true;
        if (attempt > 0) {
          console.info(`[milaidy] Server is ready (connected after ${attempt} ${attempt === 1 ? "retry" : "retries"}).`);
        }
        break; // success
      } catch {
        if (attempt === 0) {
          console.info("[milaidy] Server is starting up, waiting for it to become available...");
        }
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (!serverReady) {
      console.warn("[milaidy] Could not reach server after retries — continuing in offline mode.");
    }
    this.onboardingLoading = false;

    // Restore persisted chat messages
    this.loadChatMessages();

    // Connect WebSocket
    client.connectWs();
    client.onWsEvent("status", (data) => {
      this.agentStatus = data as unknown as AgentStatus;
    });
    // Chat is handled via the REST POST /api/chat endpoint (see
    // handleChatSend).  WebSocket is kept for status events only.

    // Load initial status
    try {
      this.agentStatus = await client.getStatus();
      this.connected = true;
    } catch {
      this.connected = false;
    }

    // Load tab from URL
    const tab = tabFromPath(window.location.pathname);
    if (tab) this.tab = tab;
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    const path = pathForTab(tab);
    window.history.pushState(null, "", path);

    // Load data for the tab
    if (tab === "plugins") this.loadPlugins();
    if (tab === "skills") this.loadSkills();
    if (tab === "config") this.checkExtensionStatus();
    if (tab === "logs") this.loadLogs();
  }

  private async loadPlugins(): Promise<void> {
    try {
      const { plugins } = await client.getPlugins();
      this.plugins = plugins;
    } catch { /* ignore */ }
  }

  private async loadSkills(): Promise<void> {
    try {
      const { skills } = await client.getSkills();
      this.skills = skills;
    } catch { /* ignore */ }
  }

  private async refreshSkills(): Promise<void> {
    try {
      const { skills } = await client.refreshSkills();
      this.skills = skills;
    } catch {
      // Fall back to a normal load if refresh endpoint not available
      await this.loadSkills();
    }
  }


  // --- Agent lifecycle ---

  private async handleStart(): Promise<void> {
    try {
      this.agentStatus = await client.startAgent();
    } catch { /* ignore */ }
  }

  private async handleStop(): Promise<void> {
    try {
      this.agentStatus = await client.stopAgent();
    } catch { /* ignore */ }
  }

  private async handlePauseResume(): Promise<void> {
    if (!this.agentStatus) return;
    try {
      if (this.agentStatus.state === "running") {
        this.agentStatus = await client.pauseAgent();
      } else if (this.agentStatus.state === "paused") {
        this.agentStatus = await client.resumeAgent();
      }
    } catch { /* ignore */ }
  }

  private async handleRestart(): Promise<void> {
    try {
      this.agentStatus = { ...(this.agentStatus ?? { agentName: "Milaidy", model: undefined, uptime: undefined, startedAt: undefined }), state: "restarting" };
      this.agentStatus = await client.restartAgent();
    } catch {
      // Fall back to polling status after a delay (restart may have killed the connection)
      setTimeout(async () => {
        try {
          this.agentStatus = await client.getStatus();
        } catch { /* ignore */ }
      }, 3000);
    }
  }

  private async handleReset(): Promise<void> {
    // Double-confirm: this is destructive
    const confirmed = window.confirm(
      "This will completely reset the agent — wiping all config, memory, and data.\n\n" +
      "You will be taken back to the onboarding wizard.\n\n" +
      "Are you sure?",
    );
    if (!confirmed) return;

    try {
      await client.resetAgent();

      // Reset local UI state and show onboarding
      this.agentStatus = null;
      this.onboardingComplete = false;
      this.onboardingStep = 0;
      this.onboardingName = "";
      this.onboardingStyle = "";
      this.onboardingProvider = "";
      this.onboardingApiKey = "";
      this.onboardingTelegramToken = "";
      this.onboardingDiscordToken = "";
      this.chatMessages = [];
      localStorage.removeItem(CHAT_STORAGE_KEY);
      this.configRaw = {};
      this.configText = "";
      this.plugins = [];
      this.skills = [];
      this.logs = [];

      // Re-fetch onboarding options for the wizard
      try {
        const options = await client.getOnboardingOptions();
        this.onboardingOptions = options;
      } catch { /* ignore */ }
    } catch {
      window.alert("Reset failed. Check the console for details.");
    }
  }

  // --- Chat ---

  private handleChatSend(): void {
    const text = this.chatInput.trim();
    if (!text || this.chatSending) return;

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", text, timestamp: Date.now() },
    ];
    this.chatInput = "";
    this.chatSending = true;
    this.saveChatMessages();

    // Use REST endpoint — reliable and always reaches the server (WebSocket
    // chat silently drops messages when the connection is not established).
    client.sendChatRest(text).then(
      (data) => {
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", text: data.text, timestamp: Date.now() },
        ];
        this.chatSending = false;
        this.saveChatMessages();
      },
      () => {
        this.chatSending = false;
      },
    );

    // Reset textarea height after clearing
    const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>(".chat-input");
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.overflowY = "hidden";
    }
  }

  private handleChatInput(e: Event): void {
    const textarea = e.target as HTMLTextAreaElement;
    this.chatInput = textarea.value;

    // Auto-resize: reset to single row then expand to content
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 200 ? "auto" : "hidden";
  }

  private handleChatKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleChatSend();
    }
  }

  private saveChatMessages(): void {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.chatMessages));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  private loadChatMessages(): void {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed: ChatMessage[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.chatMessages = parsed;
        }
      }
    } catch {
      // Corrupt data — start fresh
    }
  }

  private handleChatClear(): void {
    this.chatMessages = [];
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  // --- Onboarding ---

  private async handleOnboardingNext(): Promise<void> {
    this.onboardingStep += 1;
  }

  private async handleOnboardingFinish(): Promise<void> {
    if (!this.onboardingOptions) return;

    const style = this.onboardingOptions.styles.find(
      (s) => s.catchphrase === this.onboardingStyle,
    );

    const systemPrompt = style?.system
      ? style.system.replace(/\{name\}/g, this.onboardingName)
      : `You are ${this.onboardingName}, an autonomous AI agent powered by ElizaOS. ${this.onboardingOptions.sharedStyleRules}`;

    await client.submitOnboarding({
      name: this.onboardingName,
      bio: style?.bio ?? ["An autonomous AI agent."],
      systemPrompt,
      style: style?.style,
      adjectives: style?.adjectives,
      topics: style?.topics,
      messageExamples: style?.messageExamples,
      provider: this.onboardingProvider || undefined,
      providerApiKey: this.onboardingApiKey || undefined,
      telegramBotToken: this.onboardingTelegramToken || undefined,
      discordBotToken: this.onboardingDiscordToken || undefined,
    });

    this.onboardingComplete = true;

    // Restart the agent so the runtime picks up the new config
    // (name, provider keys, etc.) that was just saved by submitOnboarding.
    try {
      this.agentStatus = await client.restartAgent();
    } catch { /* ignore */ }
  }

  // --- Render ---

  render() {
    if (this.onboardingLoading) {
      return html`<div class="app-shell"><div class="empty-state">Loading...</div></div>`;
    }

    if (!this.onboardingComplete) {
      return this.renderOnboarding();
    }

    return html`
      <div class="app-shell">
        ${this.renderHeader()}
        ${this.renderNav()}
        <main>${this.renderView()}</main>
        <footer>milaidy</footer>
      </div>
    `;
  }

  private renderHeader() {
    const status = this.agentStatus;
    const state = status?.state ?? "not_started";
    const name = status?.agentName ?? "Milaidy";

    return html`
      <header>
        <span class="logo">${name}</span>
        <div class="status-bar">
          <span class="status-pill ${state}">${state}</span>
          ${state === "not_started" || state === "stopped"
            ? html`<button class="lifecycle-btn" @click=${this.handleStart}>Start</button>`
            : state === "restarting"
              ? html`<span class="lifecycle-btn" style="opacity:0.6;cursor:default;">Restarting…</span>`
              : html`
                <button class="lifecycle-btn" @click=${this.handlePauseResume}>
                  ${state === "running" ? "Pause" : "Resume"}
                </button>
                <button class="lifecycle-btn" @click=${this.handleStop}>Stop</button>
              `}
          <button class="lifecycle-btn" @click=${this.handleRestart} ?disabled=${state === "restarting" || state === "not_started"} title="Restart the agent (reload code, config, plugins)">Restart</button>
        </div>
      </header>
    `;
  }

  private renderNav() {
    return html`
      <nav>
        ${TAB_GROUPS.map(
          (group) => html`
            ${group.tabs.map(
              (t) => html`
                <a
                  href=${pathForTab(t)}
                  class=${this.tab === t ? "active" : ""}
                  @click=${(e: Event) => {
                    e.preventDefault();
                    this.setTab(t);
                  }}
                >${titleForTab(t)}</a>
              `,
            )}
          `,
        )}
      </nav>
    `;
  }

  private renderView() {
    switch (this.tab) {
      case "chat": return this.renderChat();
      case "plugins": return this.renderPlugins();
      case "skills": return this.renderSkills();
      case "config": return this.renderConfig();
      case "logs": return this.renderLogs();
      default: return this.renderChat();
    }
  }

  private renderChat() {
    const state = this.agentStatus?.state ?? "not_started";

    if (state === "not_started" || state === "stopped") {
      return html`
        <h2>Chat</h2>
        <div class="start-agent-box">
          <p>Agent is not running. Start it to begin chatting.</p>
          <button class="btn" @click=${this.handleStart}>Start Agent</button>
        </div>
      `;
    }

    return html`
      <div class="chat-container">
        <div class="chat-header-row">
          <h2 style="margin:0;">Chat</h2>
          ${this.chatMessages.length > 0
            ? html`<button class="clear-btn" @click=${this.handleChatClear}>Clear</button>`
            : ""}
        </div>
        <div class="chat-messages">
          ${this.chatMessages.length === 0
            ? html`<div class="empty-state">Send a message to start chatting.</div>`
            : this.chatMessages.map(
                (msg) => html`
                  <div class="chat-msg ${msg.role}">
                    <div class="role">${msg.role === "user" ? "You" : this.agentStatus?.agentName ?? "Agent"}</div>
                    <div>${msg.text}</div>
                  </div>
                `,
              )}
        </div>
        <div class="chat-input-row">
          <textarea
            class="chat-input"
            rows="1"
            placeholder="Type a message..."
            .value=${this.chatInput}
            @input=${this.handleChatInput}
            @keydown=${this.handleChatKeydown}
            ?disabled=${this.chatSending}
          ></textarea>
          <button class="chat-send-btn btn" @click=${this.handleChatSend} ?disabled=${this.chatSending}>
            ${this.chatSending ? "..." : "Send"}
          </button>
        </div>
      </div>
    `;
  }

  private renderPlugins() {
    const categories = ["all", "ai-provider", "connector", "database", "feature"] as const;
    const categoryLabels: Record<string, string> = {
      "all": "All",
      "ai-provider": "AI Provider",
      "connector": "Connector",
      "database": "Database",
      "feature": "Feature",
    };
    const filtered = this.pluginFilter === "all"
      ? this.plugins
      : this.plugins.filter((p) => p.category === this.pluginFilter);

    return html`
      <h2>Plugins</h2>
      <p class="subtitle">Manage plugins and integrations. ${this.plugins.length} plugins discovered.</p>
      <div class="plugin-filters" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        ${categories.map(
          (cat) => html`
            <button
              class="filter-btn ${this.pluginFilter === cat ? "active" : ""}"
              data-category=${cat}
              @click=${() => { this.pluginFilter = cat; }}
              style="
                padding: 4px 12px;
                border-radius: 12px;
                border: 1px solid var(--border);
                background: ${this.pluginFilter === cat ? "var(--accent)" : "var(--surface)"};
                color: ${this.pluginFilter === cat ? "#fff" : "var(--text)"};
                cursor: pointer;
                font-size: 12px;
              "
            >${cat === "all" ? `All (${this.plugins.length})` : `${categoryLabels[cat]} (${this.plugins.filter((p) => p.category === cat).length})`}</button>
          `,
        )}
      </div>
      ${filtered.length === 0
        ? html`<div class="empty-state">No plugins in this category.</div>`
        : html`
            <div class="plugin-list">
              ${filtered.map(
                (p) => html`
                  <div class="plugin-item" data-plugin-id=${p.id} style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <div class="plugin-name">${p.name}</div>
                          <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--muted);">${
                            p.category === "ai-provider" ? "ai provider"
                            : p.category === "connector" ? "connector"
                            : p.category === "database" ? "database"
                            : "feature"
                          }</span>
                        </div>
                        <div class="plugin-desc">${p.description || "No description"}</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <label class="toggle-switch" style="position:relative;display:inline-block;width:40px;height:22px;">
                          <input
                            type="checkbox"
                            .checked=${p.enabled}
                            data-plugin-toggle=${p.id}
                            @change=${(e: Event) => this.handlePluginToggle(p.id, (e.target as HTMLInputElement).checked)}
                            style="opacity:0;width:0;height:0;"
                          />
                          <span class="toggle-slider" style="
                            position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
                            background:${p.enabled ? "var(--accent)" : "var(--muted)"};
                            border-radius:22px;transition:0.2s;
                          ">
                            <span style="
                              position:absolute;content:'';height:16px;width:16px;left:${p.enabled ? "20px" : "3px"};
                              bottom:3px;background:#fff;border-radius:50%;transition:0.2s;
                            "></span>
                          </span>
                        </label>
                      </div>
                    </div>
                    ${p.enabled && p.parameters && p.parameters.length > 0
                      ? html`
                          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">
                            ${p.parameters.map(
                              (param) => html`
                                <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
                                  <div style="display:flex;align-items:center;gap:6px;">
                                    <code style="font-size:11px;font-weight:600;color:var(--text-strong);">${param.key}</code>
                                    ${param.required ? html`<span style="font-size:10px;color:var(--danger, #e74c3c);">required</span>` : ""}
                                    ${param.isSet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : ""}
                                  </div>
                                  <div style="color:var(--muted);font-size:11px;">${param.description}${param.default ? ` (default: ${param.default})` : ""}</div>
                                  <input
                                    type="${param.sensitive ? "password" : "text"}"
                                    .value=${param.isSet && !param.sensitive ? (param.currentValue ?? "") : (param.isSet ? "" : (param.default ?? ""))}
                                    placeholder="${param.sensitive && param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}"
                                    data-plugin-param="${p.id}:${param.key}"
                                    style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);"
                                  />
                                </div>
                              `,
                            )}
                            <button
                              class="btn"
                              style="align-self:flex-end;font-size:11px;padding:4px 14px;margin-top:4px;"
                              @click=${() => this.handlePluginConfigSave(p.id)}
                            >Save Settings</button>
                          </div>
                        `
                      : ""
                    }
                    ${p.enabled && p.validationErrors && p.validationErrors.length > 0
                      ? html`
                          <div style="margin-top:6px;padding:6px 8px;border:1px solid var(--danger);background:var(--accent-subtle);font-size:12px;">
                            ${p.validationErrors.map(
                              (err) => html`<div style="color:var(--danger);">${err.field}: ${err.message}</div>`,
                            )}
                          </div>
                        `
                      : ""
                    }
                    ${p.enabled && p.validationWarnings && p.validationWarnings.length > 0
                      ? html`
                          <div style="margin-top:4px;font-size:11px;">
                            ${p.validationWarnings.map(
                              (w) => html`<div style="color:var(--warn);">${w.message}</div>`,
                            )}
                          </div>
                        `
                      : ""
                    }
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }

  private async handlePluginConfigSave(pluginId: string): Promise<void> {
    // Collect all input values for this plugin from the DOM
    const inputs = this.shadowRoot?.querySelectorAll(`input[data-plugin-param^="${pluginId}:"]`);
    if (!inputs) return;

    const config: Record<string, string> = {};
    for (const input of inputs) {
      const attr = input.getAttribute("data-plugin-param") ?? "";
      const key = attr.split(":").slice(1).join(":");
      const value = (input as HTMLInputElement).value.trim();
      if (value) {
        config[key] = value;
      }
    }

    if (Object.keys(config).length === 0) return;

    try {
      await client.updatePlugin(pluginId, { config });
      // Reload plugins to get updated validation and current values
      await this.loadPlugins();
    } catch (err) {
      console.error("Failed to save plugin config:", err);
    }
  }

  private async handlePluginToggle(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);

    // Block enabling if there are validation errors (missing required params)
    if (enabled && plugin?.validationErrors && plugin.validationErrors.length > 0) {
      // Revert the checkbox
      this.requestUpdate();
      return;
    }

    try {
      await client.updatePlugin(pluginId, { enabled });
      if (plugin) {
        plugin.enabled = enabled;
        this.requestUpdate();
      }
    } catch (err) {
      console.error("Failed to toggle plugin:", err);
    }
  }

  private renderSkills() {
    return html`
      <h2>Skills</h2>
      <p class="subtitle">View available agent skills. ${this.skills.length > 0 ? `${this.skills.length} skills loaded.` : ""}</p>
      <div style="margin-bottom:8px;">
        <button class="btn" data-action="refresh-skills" @click=${this.refreshSkills} style="font-size:12px;padding:4px 12px;">Refresh</button>
      </div>
      ${this.skills.length === 0
        ? html`<div class="empty-state">No skills loaded yet. Click Refresh to re-scan.</div>`
        : html`
            <div class="plugin-list">
              ${this.skills.map(
                (s) => html`
                  <div class="plugin-item" data-skill-id=${s.id}>
                    <div style="flex:1;min-width:0;">
                      <div class="plugin-name">${s.name}</div>
                      <div class="plugin-desc">${s.description || "No description"}</div>
                    </div>
                    <span class="plugin-status ${s.enabled ? "enabled" : ""}">${s.enabled ? "active" : "inactive"}</span>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }

  private async checkExtensionStatus(): Promise<void> {
    this.extensionChecking = true;
    try {
      this.extensionStatus = await client.getExtensionStatus();
    } catch {
      this.extensionStatus = { relayReachable: false, relayPort: 18792, extensionPath: null };
    }
    this.extensionChecking = false;
  }

  private handleOpenExtensionsPage(): void {
    window.open("chrome://extensions", "_blank");
  }

  private renderConfig() {
    const ext = this.extensionStatus;
    const relayOk = ext?.relayReachable === true;

    return html`
      <h2>Settings</h2>
      <p class="subtitle">Agent settings and configuration.</p>

      <!-- Chrome Extension Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Chrome Extension</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Connect the Milaidy Browser Relay extension so the agent can automate Chrome tabs.
            </div>
          </div>
          <button
            class="btn"
            style="white-space:nowrap;margin-top:0;font-size:12px;padding:6px 14px;"
            @click=${this.checkExtensionStatus}
            ?disabled=${this.extensionChecking}
          >${this.extensionChecking ? "Checking..." : "Check Connection"}</button>
        </div>

        ${ext
          ? html`
              <div style="padding:12px;border:1px solid var(--border);background:var(--bg-muted);margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span style="
                    display:inline-block;width:8px;height:8px;border-radius:50%;
                    background:${relayOk ? "var(--ok, #16a34a)" : "var(--danger, #e74c3c)"};
                  "></span>
                  <span style="font-size:13px;font-weight:bold;">
                    Relay Server: ${relayOk ? "Connected" : "Not Reachable"}
                  </span>
                </div>
                <div style="font-size:12px;color:var(--muted);font-family:var(--mono);">
                  ws://127.0.0.1:${ext.relayPort}/extension
                </div>
                ${!relayOk
                  ? html`<div style="font-size:12px;color:var(--danger, #e74c3c);margin-top:6px;">
                      The browser relay server is not running. Start the agent with browser control enabled,
                      then check again.
                    </div>`
                  : ""}
              </div>
            `
          : ""}

        <div style="margin-top:12px;">
          <div style="font-weight:bold;font-size:13px;margin-bottom:8px;">Install Chrome Extension</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;">
            <ol style="margin:0;padding-left:20px;">
              <li style="margin-bottom:6px;">
                Open Chrome and navigate to
                <code style="font-size:11px;padding:1px 4px;border:1px solid var(--border);background:var(--bg-muted);">chrome://extensions</code>
              </li>
              <li style="margin-bottom:6px;">
                Enable <strong>Developer mode</strong> (toggle in the top-right corner)
              </li>
              <li style="margin-bottom:6px;">
                Click <strong>"Load unpacked"</strong> and select the extension folder:
                ${ext?.extensionPath
                  ? html`<br/><code style="font-size:11px;padding:2px 6px;border:1px solid var(--border);background:var(--bg-muted);display:inline-block;margin-top:4px;word-break:break-all;">${ext.extensionPath}</code>`
                  : html`<br/><code style="font-size:11px;padding:2px 6px;border:1px solid var(--border);background:var(--bg-muted);display:inline-block;margin-top:4px;">apps/chrome-extension/</code>
                    <span style="font-style:italic;"> (relative to milaidy package root)</span>`}
              </li>
              <li style="margin-bottom:6px;">
                Pin the extension icon in Chrome's toolbar
              </li>
              <li>
                Click the extension icon on any tab to attach/detach the Milaidy browser relay
              </li>
            </ol>
          </div>
        </div>

        ${ext?.extensionPath
          ? html`
              <div style="margin-top:12px;padding:8px 12px;border:1px solid var(--border);background:var(--bg-muted);font-family:var(--mono);font-size:11px;word-break:break-all;">
                Extension path: ${ext.extensionPath}
              </div>
            `
          : ""}
      </div>

      <div style="margin-top:48px;padding-top:24px;border-top:1px solid var(--border);">
        <h2 style="color:var(--danger, #e74c3c);">Danger Zone</h2>
        <p class="subtitle">Irreversible actions. Proceed with caution.</p>
        <div style="border:1px solid var(--danger, #e74c3c);padding:16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Reset Agent</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Wipe all config, memory, and data. Returns to the onboarding wizard.</div>
          </div>
          <button
            class="btn"
            style="background:var(--danger, #e74c3c);border-color:var(--danger, #e74c3c);white-space:nowrap;margin-top:0;"
            @click=${this.handleReset}
          >Reset Everything</button>
        </div>
      </div>
    `;
  }

  private renderLogs() {
    return html`
      <h2>Logs</h2>
      <p class="subtitle">Agent log output. ${this.logs.length > 0 ? `${this.logs.length} entries.` : ""}</p>
      <div style="margin-bottom:8px;">
        <button class="btn" data-action="refresh-logs" @click=${this.loadLogs} style="font-size:12px;padding:4px 12px;">Refresh</button>
      </div>
      <div class="logs-container">
        ${this.logs.length === 0
          ? html`<div class="empty-state">No log entries yet.</div>`
          : html`
              ${this.logs.map(
                (entry) => html`
                  <div class="log-entry" style="
                    font-family: var(--font-mono, monospace);
                    font-size: 12px;
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    gap: 8px;
                  ">
                    <span style="color:var(--muted);white-space:nowrap;">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span style="
                      font-weight:600;
                      width:48px;
                      text-transform:uppercase;
                      color: ${entry.level === "error" ? "var(--danger)" : entry.level === "warn" ? "var(--warn)" : "var(--muted)"};
                    ">${entry.level}</span>
                    <span style="color:var(--muted);width:60px;overflow:hidden;text-overflow:ellipsis;">[${entry.source}]</span>
                    <span style="flex:1;word-break:break-all;">${entry.message}</span>
                  </div>
                `,
              )}
            `}
      </div>
    `;
  }

  private async loadLogs(): Promise<void> {
    try {
      const data = await client.getLogs();
      this.logs = data.entries;
    } catch {
      // silent
    }
  }

  // --- Onboarding ---

  private renderOnboarding() {
    const opts = this.onboardingOptions;
    if (!opts) {
      return html`<div class="app-shell"><div class="empty-state">Loading onboarding...</div></div>`;
    }

    return html`
      <div class="app-shell">
        <div class="onboarding">
          ${this.onboardingStep === 0 ? this.renderOnboardingWelcome() : ""}
          ${this.onboardingStep === 1 ? this.renderOnboardingName(opts) : ""}
          ${this.onboardingStep === 2 ? this.renderOnboardingStyle(opts) : ""}
          ${this.onboardingStep === 3 ? this.renderOnboardingProvider(opts) : ""}
          ${this.onboardingStep === 4 ? this.renderOnboardingChannels() : ""}
        </div>
      </div>
    `;
  }

  private renderOnboardingWelcome() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" />
      <h1 class="onboarding-welcome-title">Welcome to milAIdy!</h1>
      <p class="onboarding-welcome-sub">The agent of choice for network spiritualists</p>
      <button class="btn" @click=${this.handleOnboardingNext}>Continue</button>
    `;
  }

  private renderOnboardingName(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">errr, what was my name again...?</div>
      <div class="onboarding-options">
        ${opts.names.map(
          (name) => html`
            <div
              class="onboarding-option ${this.onboardingName === name ? "selected" : ""}"
              @click=${() => { this.onboardingName = name; }}
            >
              <div class="label">${name}</div>
            </div>
          `,
        )}
        <div
          class="onboarding-option ${this.onboardingName && !opts.names.includes(this.onboardingName) ? "selected" : ""}"
          @click=${(e: Event) => {
            const input = (e.currentTarget as HTMLElement).querySelector("input");
            if (input) input.focus();
          }}
        >
          <input
            type="text"
            placeholder="Or type a custom name..."
            .value=${opts.names.includes(this.onboardingName) ? "" : this.onboardingName}
            @input=${(e: Event) => { this.onboardingName = (e.target as HTMLInputElement).value; }}
            @focus=${() => { /* clear preset selection when typing custom */ }}
            style="
              border: none;
              background: transparent;
              font-size: 14px;
              font-weight: bold;
              width: 100%;
              padding: 0;
              outline: none;
              color: inherit;
              font-family: inherit;
            "
          />
        </div>
      </div>
      <button
        class="btn"
        @click=${this.handleOnboardingNext}
        ?disabled=${!this.onboardingName.trim()}
      >Next</button>
    `;
  }

  private renderOnboardingStyle(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">so what's the vibe here?</div>
      <div class="onboarding-options">
        ${opts.styles.map(
          (style) => html`
            <div
              class="onboarding-option ${this.onboardingStyle === style.catchphrase ? "selected" : ""}"
              @click=${() => { this.onboardingStyle = style.catchphrase; }}
            >
              <div class="label">${style.catchphrase}</div>
              <div class="hint">${style.hint}</div>
            </div>
          `,
        )}
      </div>
      <button
        class="btn"
        @click=${this.handleOnboardingNext}
        ?disabled=${!this.onboardingStyle}
      >Next</button>
    `;
  }

  private renderOnboardingProvider(opts: OnboardingOptions) {
    const selected = opts.providers.find((p) => p.id === this.onboardingProvider);
    const needsKey = selected && selected.envKey && selected.id !== "elizacloud" && selected.id !== "ollama";

    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">which AI provider do you want to use?</div>
      <div class="onboarding-options">
        ${opts.providers.map(
          (provider) => html`
            <div
              class="onboarding-option ${this.onboardingProvider === provider.id ? "selected" : ""}"
              @click=${() => { this.onboardingProvider = provider.id; this.onboardingApiKey = ""; }}
            >
              <div class="label">${provider.name}</div>
              <div class="hint">${provider.description}</div>
            </div>
          `,
        )}
      </div>
      ${needsKey
        ? html`
            <input
              class="onboarding-input"
              type="password"
              placeholder="API Key"
              .value=${this.onboardingApiKey}
              @input=${(e: Event) => { this.onboardingApiKey = (e.target as HTMLInputElement).value; }}
            />
          `
        : ""}
      <button
        class="btn"
        @click=${this.handleOnboardingNext}
        ?disabled=${!this.onboardingProvider || (needsKey && !this.onboardingApiKey.trim())}
      >Next</button>
    `;
  }

  private renderOnboardingChannels() {
    return html`
      <h1>Connect to messaging</h1>
      <p>Optionally connect Telegram and/or Discord. You can skip this.</p>

      <div style="text-align: left; margin-bottom: 16px;">
        <label style="font-size: 13px; color: var(--muted-strong);">Telegram Bot Token</label>
        <input
          class="onboarding-input"
          type="password"
          placeholder="Paste token from @BotFather"
          .value=${this.onboardingTelegramToken}
          @input=${(e: Event) => { this.onboardingTelegramToken = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div style="text-align: left; margin-bottom: 16px;">
        <label style="font-size: 13px; color: var(--muted-strong);">Discord Bot Token</label>
        <input
          class="onboarding-input"
          type="password"
          placeholder="Paste token from Discord Developer Portal"
          .value=${this.onboardingDiscordToken}
          @input=${(e: Event) => { this.onboardingDiscordToken = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" @click=${this.handleOnboardingFinish}>Skip</button>
        <button class="btn" @click=${this.handleOnboardingFinish}>Finish</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "milaidy-app": MilaidyApp;
  }
}
