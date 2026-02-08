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
  type SkillMarketplaceResult,
  type InstalledMarketplaceSkill,
  type LogEntry,
  type OnboardingOptions,
  type ExtensionStatus,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletNftsResponse,
  type WalletConfigStatus,
  type WalletExportResult,
  type WorkbenchOverview,
  type WorkbenchGoal,
  type WorkbenchTodo,
  type ShareIngestPayload,
  type ShareIngestItem,
  type RegistryPluginInfo,
  type InstalledRegistryPlugin,
  type McpMarketplaceResult,
  type McpServerConfig,
  type McpRegistryServerDetail,
  type McpServerStatus,
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
  @state() pluginSearch = "";
  @state() pluginSettingsOpen: Set<string> = new Set();
  @state() marketplacePlugins: RegistryPluginInfo[] = [];
  @state() marketplaceInstalled: InstalledRegistryPlugin[] = [];
  @state() marketplaceLoading = false;
  @state() marketplaceSearch = "";
  @state() marketplaceAction = "";
  @state() marketplaceSubTab: "plugins" | "skills" | "mcp" = "plugins";
  @state() mcpMarketplaceResults: McpMarketplaceResult[] = [];
  @state() mcpMarketplaceQuery = "";
  @state() mcpMarketplaceLoading = false;
  @state() mcpConfiguredServers: Record<string, McpServerConfig> = {};
  @state() mcpConfigLoading = false;
  @state() mcpAction = "";
  @state() mcpManualName = "";
  @state() mcpManualType: "stdio" | "http" | "streamable-http" | "sse" = "stdio";
  @state() mcpManualCommand = "";
  @state() mcpManualArgs = "";
  @state() mcpManualUrl = "";
  @state() mcpManualEnvPairs: Array<{ key: string; value: string }> = [];
  @state() mcpAddingServer: McpRegistryServerDetail | null = null;
  @state() mcpAddingResult: McpMarketplaceResult | null = null;
  @state() mcpEnvInputs: Record<string, string> = {};
  @state() mcpHeaderInputs: Record<string, string> = {};
  @state() mcpServerStatuses: McpServerStatus[] = [];
  @state() workbench: WorkbenchOverview | null = null;
  @state() workbenchLoading = false;
  @state() workbenchGoalName = "";
  @state() workbenchGoalDescription = "";
  @state() workbenchGoalTags = "";
  @state() workbenchGoalPriority = "3";
  @state() workbenchEditingGoalId: string | null = null;
  @state() workbenchTodoName = "";
  @state() workbenchTodoDescription = "";
  @state() workbenchTodoPriority = "3";
  @state() workbenchTodoUrgent = false;
  @state() shareIngestNotice = "";
  @state() commandPaletteOpen = false;
  @state() commandQuery = "";
  @state() commandActiveIndex = 0;
  @state() droppedFiles: string[] = [];
  @state() actionNotice: { tone: "info" | "success" | "error"; text: string } | null = null;
  @state() nativeDesktopAvailable = false;
  @state() nativeTrayEnabled = false;
  @state() nativeShortcutEnabled = false;
  @state() nativeEvents: string[] = [];
  @state() skills: SkillInfo[] = [];
  @state() skillsMarketplaceResults: SkillMarketplaceResult[] = [];
  @state() skillsMarketplaceInstalled: InstalledMarketplaceSkill[] = [];
  @state() skillsMarketplaceQuery = "";
  @state() skillsMarketplaceLoading = false;
  @state() skillsMarketplaceAction = "";
  @state() skillsMarketplaceManualGithubUrl = "";
  @state() skillsMarketplaceError = "";
  @state() skillsMarketplaceApiKeySet = false;
  @state() skillsMarketplaceApiKeyInput = "";
  @state() skillsMarketplaceApiKeySaving = false;
  @state() skillToggleAction = "";
  @state() logs: LogEntry[] = [];

  private nativeListenerHandles: Array<{ remove: () => Promise<void> }> = [];
  private actionNoticeTimer: number | null = null;

  // Chrome extension state
  @state() extensionStatus: ExtensionStatus | null = null;
  @state() extensionChecking = false;

  // Wallet / Inventory state
  @state() walletAddresses: WalletAddresses | null = null;
  @state() walletConfig: WalletConfigStatus | null = null;
  @state() walletBalances: WalletBalancesResponse | null = null;
  @state() walletNfts: WalletNftsResponse | null = null;
  @state() walletLoading = false;
  @state() walletNftsLoading = false;
  @state() inventoryView: "tokens" | "nfts" = "tokens";
  @state() walletExportData: WalletExportResult | null = null;
  @state() walletExportVisible = false;
  @state() walletApiKeySaving = false;
  @state() inventorySort: "chain" | "symbol" | "value" = "value";
  @state() walletError: string | null = null;

  // Onboarding wizard state
  @state() onboardingStep = 0;
  @state() onboardingOptions: OnboardingOptions | null = null;
  @state() onboardingName = "";
  @state() onboardingStyle = "";
  @state() onboardingProvider = "";
  @state() onboardingApiKey = "";
  @state() onboardingTelegramToken = "";
  @state() onboardingDiscordToken = "";
  @state() onboardingSkillsmpApiKey = "";

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

    /* Wallet icon */
    .wallet-wrapper {
      position: relative;
      display: inline-flex;
    }

    .wallet-btn {
      padding: 4px 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .wallet-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .wallet-tooltip {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 6px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      z-index: 100;
      min-width: 280px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    .wallet-wrapper:hover .wallet-tooltip {
      display: block;
    }

    .wallet-addr-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      padding: 4px 0;
    }

    .wallet-addr-row + .wallet-addr-row {
      border-top: 1px solid var(--border);
    }

    .chain-label {
      font-weight: bold;
      font-size: 11px;
      min-width: 30px;
      font-family: var(--mono);
    }

    .wallet-addr-row code {
      font-size: 11px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--mono);
    }

    .copy-btn {
      padding: 2px 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 10px;
      font-family: var(--mono);
    }

    .copy-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Inventory */
    .inv-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .inventory-subtab {
      display: inline-block;
      padding: 4px 16px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--bg);
      font-size: 13px;
      font-family: var(--mono);
    }

    .inventory-subtab.active {
      border-color: var(--accent);
      color: var(--accent);
      font-weight: bold;
    }

    .inventory-subtab:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .sort-btn {
      padding: 3px 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 11px;
      font-family: var(--mono);
    }

    .sort-btn.active {
      border-color: var(--accent);
      color: var(--accent);
    }

    .sort-btn:hover { border-color: var(--accent); color: var(--accent); }

    /* Scrollable token table */
    .token-table-wrap {
      margin-top: 12px;
      border: 1px solid var(--border);
      max-height: 60vh;
      overflow-y: auto;
      background: var(--card);
    }

    .token-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .token-table thead {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--bg);
    }

    .token-table th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .token-table th:hover { color: var(--text); }
    .token-table th.sorted { color: var(--accent); }
    .token-table th.r { text-align: right; }

    .token-table td {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .token-table tr:last-child td {
      border-bottom: none;
    }

    .token-table .chain-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      text-align: center;
      line-height: 16px;
      font-size: 9px;
      font-weight: bold;
      font-family: var(--mono);
      flex-shrink: 0;
      vertical-align: middle;
    }

    .chain-icon.eth { background: #627eea; color: #fff; }
    .chain-icon.base { background: #0052ff; color: #fff; }
    .chain-icon.arb { background: #28a0f0; color: #fff; }
    .chain-icon.op { background: #ff0420; color: #fff; }
    .chain-icon.pol { background: #8247e5; color: #fff; }
    .chain-icon.sol { background: #9945ff; color: #fff; }

    .td-symbol {
      font-weight: bold;
      font-family: var(--mono);
    }

    .td-name {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
    }

    .td-balance {
      font-family: var(--mono);
      text-align: right;
      white-space: nowrap;
    }

    .td-value {
      font-family: var(--mono);
      text-align: right;
      color: var(--muted);
      white-space: nowrap;
    }

    /* NFTs */
    .nft-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 12px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .nft-card {
      border: 1px solid var(--border);
      background: var(--card);
      overflow: hidden;
    }

    .nft-card img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      display: block;
      background: var(--bg-muted);
    }

    .nft-card .nft-info {
      padding: 6px 8px;
    }

    .nft-card .nft-name {
      font-size: 11px;
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nft-card .nft-collection {
      font-size: 10px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nft-card .nft-chain {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: var(--muted);
      margin-top: 2px;
    }

    /* Setup cards */
    .setup-card {
      border: 1px solid var(--border);
      background: var(--card);
      padding: 20px;
      margin-top: 16px;
    }

    .setup-card h3 {
      margin: 0 0 8px 0;
      font-size: 15px;
    }

    .setup-card p {
      font-size: 12px;
      color: var(--muted);
      margin: 0 0 12px 0;
      line-height: 1.5;
    }

    .setup-card ol {
      margin: 0 0 14px 0;
      padding-left: 20px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
    }

    .setup-card a {
      color: var(--accent);
    }

    .setup-input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .setup-input-row input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      font-size: 12px;
      font-family: var(--mono);
    }

    .key-export-box {
      margin-top: 12px;
      padding: 12px;
      border: 1px solid var(--danger, #e74c3c);
      background: var(--bg-muted);
      font-family: var(--mono);
      font-size: 11px;
      word-break: break-all;
      line-height: 1.6;
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

    /* Plugin search */
    .plugin-search {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 13px;
      font-family: var(--font-body);
      margin-bottom: 12px;
    }

    .plugin-search::placeholder {
      color: var(--muted);
    }

    /* Plugin list */
    .plugin-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .plugin-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
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
      margin-top: 2px;
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

    /* Collapsible settings */
    .plugin-settings-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }

    .plugin-settings-toggle:hover {
      opacity: 0.8;
    }

    .plugin-settings-toggle .settings-chevron {
      display: inline-block;
      transition: transform 0.15s ease;
      font-size: 10px;
    }

    .plugin-settings-toggle .settings-chevron.open {
      transform: rotate(90deg);
    }

    .plugin-settings-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .plugin-settings-dot.all-set {
      background: #2ecc71;
    }

    .plugin-settings-dot.missing {
      background: #e74c3c;
    }

    .plugin-settings-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
    }

    .plugin-settings-body input {
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 12px;
      font-family: var(--mono);
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
    window.addEventListener("keydown", this.handleGlobalKeydown);
    document.addEventListener("milaidy:command-palette", this.handleExternalCommandPalette as EventListener);
    document.addEventListener("milaidy:tray-action", this.handleExternalTrayAction as EventListener);
    document.addEventListener("milaidy:share-target", this.handleExternalShareTarget as EventListener);
    document.addEventListener("milaidy:app-resume", this.handleAppResume as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("keydown", this.handleGlobalKeydown);
    document.removeEventListener("milaidy:command-palette", this.handleExternalCommandPalette as EventListener);
    document.removeEventListener("milaidy:tray-action", this.handleExternalTrayAction as EventListener);
    document.removeEventListener("milaidy:share-target", this.handleExternalShareTarget as EventListener);
    document.removeEventListener("milaidy:app-resume", this.handleAppResume as EventListener);
    if (this.actionNoticeTimer != null) {
      window.clearTimeout(this.actionNoticeTimer);
      this.actionNoticeTimer = null;
    }
    client.disconnectWs();
    this.teardownNativeBindings();
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
      void this.configureNativeTrayMenu();
    });
    // Chat is handled via the REST POST /api/chat endpoint (see
    // handleChatSend).  WebSocket is kept for status events only.

    // Load initial status
    try {
      this.agentStatus = await client.getStatus();
      await this.configureNativeTrayMenu();
      this.connected = true;
    } catch {
      this.connected = false;
    }

    // Load wallet addresses for the header icon
    try {
      this.walletAddresses = await client.getWalletAddresses();
    } catch {
      // Wallet may not be configured yet
    }

    // Load tab from URL and trigger data loading for it
    const tab = tabFromPath(window.location.pathname);
    if (tab) {
      this.tab = tab;
      if (tab === "workbench") this.loadWorkbench();
      if (tab === "inventory") this.loadInventory();
      if (tab === "plugins") this.loadPlugins();
      if (tab === "marketplace") this.loadMarketplace();
      if (tab === "skills") this.loadSkills();
      if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); }
      if (tab === "logs") this.loadLogs();
    }

    await this.initializeNativeLayer();
    await this.pullShareIngest();
    this.consumePendingShareQueue();
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    const path = pathForTab(tab);
    window.history.pushState(null, "", path);

    // Load data for the tab
    if (tab === "workbench") this.loadWorkbench();
    if (tab === "inventory") this.loadInventory();
    if (tab === "plugins") this.loadPlugins();
    if (tab === "marketplace") { this.loadMarketplace(); this.loadSkills(); }
    if (tab === "skills") this.loadSkills();
    if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); }
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
    await this.loadInstalledMarketplaceSkills();
    await this.loadSkillsMarketplaceConfig();
  }

  private async refreshSkills(): Promise<void> {
    try {
      const { skills } = await client.refreshSkills();
      this.skills = skills;
    } catch {
      // Fall back to a normal load if refresh endpoint not available
      await this.loadSkills();
      return;
    }
    await this.loadInstalledMarketplaceSkills();
  }

  private async loadInstalledMarketplaceSkills(): Promise<void> {
    try {
      const { skills } = await client.getInstalledMarketplaceSkills();
      this.skillsMarketplaceInstalled = skills;
    } catch {
      this.skillsMarketplaceInstalled = [];
    }
  }

  private async searchSkillsMarketplace(): Promise<void> {
    const query = this.skillsMarketplaceQuery.trim();
    if (!query) {
      this.skillsMarketplaceResults = [];
      this.skillsMarketplaceError = "";
      return;
    }

    this.skillsMarketplaceLoading = true;
    this.skillsMarketplaceError = "";
    try {
      const { results } = await client.searchSkillsMarketplace(query, false, 20);
      this.skillsMarketplaceResults = results;
    } catch (err) {
      this.skillsMarketplaceResults = [];
      const message = err instanceof Error ? err.message : "unknown error";
      this.skillsMarketplaceError = message;
      this.setActionNotice(`Skill search failed: ${message}`, "error", 4200);
    } finally {
      this.skillsMarketplaceLoading = false;
    }
  }

  private async loadSkillsMarketplaceConfig(): Promise<void> {
    try {
      const { keySet } = await client.getSkillsMarketplaceConfig();
      this.skillsMarketplaceApiKeySet = keySet;
    } catch {
      this.skillsMarketplaceApiKeySet = false;
    }
  }

  private async handleSaveSkillsMarketplaceApiKey(): Promise<void> {
    const apiKey = this.skillsMarketplaceApiKeyInput.trim();
    if (!apiKey) return;

    this.skillsMarketplaceApiKeySaving = true;
    try {
      const { keySet } = await client.updateSkillsMarketplaceConfig(apiKey);
      this.skillsMarketplaceApiKeySet = keySet;
      this.skillsMarketplaceApiKeyInput = "";
      this.setActionNotice("Skills Marketplace API key saved.", "success");
    } catch (err) {
      this.setActionNotice(`Failed to save API key: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceApiKeySaving = false;
    }
  }


  private async installSkillFromMarketplace(item: SkillMarketplaceResult): Promise<void> {
    this.skillsMarketplaceAction = `install:${item.id}`;
    try {
      await client.installMarketplaceSkill({
        githubUrl: item.githubUrl,
        repository: item.repository,
        path: item.path ?? undefined,
        name: item.name,
        description: item.description,
        source: "skillsmp",
        autoRefresh: true,
      });
      await this.refreshSkills();
      this.setActionNotice(`Installed skill: ${item.name}`, "success");
    } catch (err) {
      this.setActionNotice(`Skill install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async installSkillFromGithubUrl(): Promise<void> {
    const githubUrl = this.skillsMarketplaceManualGithubUrl.trim();
    if (!githubUrl) return;

    this.skillsMarketplaceAction = "install:manual";
    try {
      let repository: string | undefined;
      let skillPath: string | undefined;
      let inferredName: string | undefined;
      try {
        const parsed = new URL(githubUrl);
        if (parsed.hostname === "github.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repository = `${parts[0]}/${parts[1]}`;
          }
          if (parts[2] === "tree" && parts.length >= 5) {
            skillPath = parts.slice(4).join("/");
            inferredName = parts[parts.length - 1];
          }
        }
      } catch {
        // Keep raw URL fallback handling on backend.
      }

      await client.installMarketplaceSkill({
        githubUrl,
        repository,
        path: skillPath,
        name: inferredName,
        source: "manual",
        autoRefresh: true,
      });
      this.skillsMarketplaceManualGithubUrl = "";
      await this.refreshSkills();
      this.setActionNotice("Skill installed from GitHub URL.", "success");
    } catch (err) {
      this.setActionNotice(`GitHub install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async uninstallMarketplaceSkill(skillId: string, name: string): Promise<void> {
    this.skillsMarketplaceAction = `uninstall:${skillId}`;
    try {
      await client.uninstallMarketplaceSkill(skillId, true);
      await this.refreshSkills();
      this.setActionNotice(`Uninstalled skill: ${name}`, "success");
    } catch (err) {
      this.setActionNotice(`Skill uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async handleSkillToggle(skillId: string, enabled: boolean): Promise<void> {
    this.skillToggleAction = skillId;
    try {
      const { skill } = await client.updateSkill(skillId, enabled);
      const next = this.skills.map((entry) => (entry.id === skillId ? { ...entry, enabled: skill.enabled } : entry));
      this.skills = next;
      this.setActionNotice(`${skill.name} ${skill.enabled ? "enabled" : "disabled"}.`, "success");
    } catch (err) {
      this.setActionNotice(`Failed to update skill: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillToggleAction = "";
    }
  }

  private getDesktopPlugin(): Record<string, (...args: unknown[]) => Promise<unknown>> | null {
    const bridge = (window as unknown as { Milaidy?: { pluginCapabilities?: { desktop?: { available?: boolean } }; plugins?: { desktop?: { plugin?: unknown } } } }).Milaidy;
    const available = Boolean(bridge?.pluginCapabilities?.desktop?.available);
    if (!available) return null;
    const plugin = bridge?.plugins?.desktop?.plugin;
    if (!plugin || typeof plugin !== "object") return null;
    return plugin as Record<string, (...args: unknown[]) => Promise<unknown>>;
  }

  private pushNativeEvent(message: string): void {
    const stamp = new Date().toLocaleTimeString();
    this.nativeEvents = [`${stamp} ${message}`, ...this.nativeEvents].slice(0, 8);
  }

  private setActionNotice(
    text: string,
    tone: "info" | "success" | "error" = "info",
    ttlMs = 2800,
  ): void {
    this.actionNotice = { tone, text };
    if (this.actionNoticeTimer != null) {
      window.clearTimeout(this.actionNoticeTimer);
      this.actionNoticeTimer = null;
    }
    this.actionNoticeTimer = window.setTimeout(() => {
      this.actionNotice = null;
      this.actionNoticeTimer = null;
    }, ttlMs);
  }

  private lifecycleTrayActionLabel(): string {
    const state = this.agentStatus?.state ?? "not_started";
    if (state === "running") return "Pause Agent";
    if (state === "paused") return "Resume Agent";
    return "Start Agent";
  }

  private async initializeNativeLayer(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    this.nativeDesktopAvailable = Boolean(desktop);
    if (!desktop) return;

    try {
      const isRegistered = await desktop.isShortcutRegistered?.({ accelerator: "CommandOrControl+K" }) as { registered: boolean } | undefined;
      if (!isRegistered?.registered) {
        const registered = await desktop.registerShortcut?.({
          id: "command-palette",
          accelerator: "CommandOrControl+K",
        }) as { success: boolean } | undefined;
        this.nativeShortcutEnabled = Boolean(registered?.success);
      } else {
        this.nativeShortcutEnabled = true;
      }

      const shortcutListener = await desktop.addListener?.("shortcutPressed", (event: { id: string }) => {
        if (event.id === "command-palette") this.openCommandPalette();
      }) as { remove: () => Promise<void> } | undefined;
      if (shortcutListener) this.nativeListenerHandles.push(shortcutListener);

      const trayClickListener = await desktop.addListener?.("trayMenuClick", (event: { itemId: string }) => {
        this.handleTrayMenuAction(event.itemId);
      }) as { remove: () => Promise<void> } | undefined;
      if (trayClickListener) this.nativeListenerHandles.push(trayClickListener);

      const notificationActionListener = await desktop.addListener?.("notificationAction", (event: { action?: string }) => {
        const action = event.action ?? "";
        if (action.toLowerCase().includes("pause")) {
          void this.handlePauseResume();
        }
        if (action.toLowerCase().includes("workbench")) {
          this.setTab("workbench");
          void this.loadWorkbench();
        }
      }) as { remove: () => Promise<void> } | undefined;
      if (notificationActionListener) this.nativeListenerHandles.push(notificationActionListener);

      await this.configureNativeTrayMenu();
    } catch (err) {
      this.pushNativeEvent(`Native init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async teardownNativeBindings(): Promise<void> {
    for (const handle of this.nativeListenerHandles) {
      try {
        await handle.remove();
      } catch {
        // ignore cleanup errors
      }
    }
    this.nativeListenerHandles = [];
  }

  private async configureNativeTrayMenu(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    if (!desktop) return;
    try {
      const lifecycleLabel = this.lifecycleTrayActionLabel();
      await desktop.setTrayMenu?.({
        menu: [
          { id: "tray-open-chat", label: "Open Chat" },
          { id: "tray-open-workbench", label: "Open Workbench" },
          { id: "tray-toggle-pause", label: lifecycleLabel },
          { id: "tray-restart", label: "Restart Agent" },
          { id: "tray-notify", label: "Send Test Notification" },
          { id: "tray-sep-1", type: "separator" },
          { id: "tray-show-window", label: "Show Window" },
          { id: "tray-hide-window", label: "Hide Window" },
        ],
      });
      this.nativeTrayEnabled = true;
      this.pushNativeEvent("Tray menu configured");
    } catch (err) {
      this.pushNativeEvent(`Tray setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleTrayMenuAction(itemId: string): void {
    switch (itemId) {
      case "tray-open-chat":
        this.setTab("chat");
        break;
      case "tray-open-workbench":
        this.setTab("workbench");
        void this.loadWorkbench();
        break;
      case "tray-toggle-pause":
        void this.handlePauseResume();
        break;
      case "tray-restart":
        void this.handleRestart();
        break;
      case "tray-notify":
        void this.sendNativeNotification();
        break;
      case "tray-show-window":
        void this.getDesktopPlugin()?.showWindow?.();
        break;
      case "tray-hide-window":
        void this.getDesktopPlugin()?.hideWindow?.();
        break;
      default:
        break;
    }
  }

  private async sendNativeNotification(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    if (!desktop) return;
    try {
      await desktop.showNotification?.({
        title: "Milaidy",
        body: "Agent control actions are available from this notification.",
        actions: [
          { type: "button", text: "Open Workbench" },
          { type: "button", text: "Pause Agent" },
        ],
      });
      this.pushNativeEvent("Notification sent");
    } catch (err) {
      this.pushNativeEvent(`Notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleExternalCommandPalette = (): void => {
    this.openCommandPalette();
  };

  private handleExternalTrayAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ itemId?: string }>).detail;
    if (detail?.itemId) {
      this.handleTrayMenuAction(detail.itemId);
    }
  };

  private handleExternalShareTarget = (event: Event): void => {
    const detail = (event as CustomEvent<ShareIngestPayload>).detail;
    if (!detail) return;
    void this.ingestSharePayload(detail);
  };

  private handleAppResume = (): void => {
    void this.pullShareIngest();
  };

  private consumePendingShareQueue(): void {
    const global = window as unknown as { __MILAIDY_SHARE_QUEUE__?: ShareIngestPayload[] };
    const queue = Array.isArray(global.__MILAIDY_SHARE_QUEUE__) ? [...global.__MILAIDY_SHARE_QUEUE__] : [];
    global.__MILAIDY_SHARE_QUEUE__ = [];
    for (const payload of queue) {
      void this.ingestSharePayload(payload);
    }
  }

  private applySharePrompt(prompt: string, files: Array<{ name: string }>): void {
    if (!prompt.trim()) return;
    this.chatInput = `${this.chatInput.trim()}\n\n${prompt}`.trim();
    this.droppedFiles = files.map((file) => file.name);
    this.shareIngestNotice = `Share ingested (${files.length} file${files.length === 1 ? "" : "s"})`;
    this.setTab("chat");
    this.requestUpdate();
    setTimeout(() => {
      this.shareIngestNotice = "";
    }, 5000);
  }

  private async ingestSharePayload(payload: ShareIngestPayload): Promise<void> {
    try {
      const result = await client.ingestShare(payload);
      const consumed = await client.consumeShareIngest().catch(() => null);
      if (consumed?.items && consumed.items.length > 0) {
        const latest = consumed.items[consumed.items.length - 1];
        this.applySharePrompt(latest.suggestedPrompt, latest.files);
      } else {
        this.applySharePrompt(result.item.suggestedPrompt, result.item.files);
      }
    } catch {
      const fileNames = (payload.files ?? []).map((file) => file.name).filter(Boolean);
      const lines: string[] = [];
      lines.push("Shared content:");
      if (payload.title) lines.push(`Title: ${payload.title}`);
      if (payload.url) lines.push(`URL: ${payload.url}`);
      if (payload.text) lines.push(payload.text);
      if (fileNames.length > 0) {
        lines.push("Files:");
        for (const fileName of fileNames) lines.push(`- ${fileName}`);
      }
      this.applySharePrompt(lines.join("\n"), fileNames.map((name) => ({ name })));
    }
  }

  private async pullShareIngest(): Promise<void> {
    try {
      const inbox = await client.consumeShareIngest();
      if (!Array.isArray(inbox.items) || inbox.items.length === 0) return;
      const latest = inbox.items[inbox.items.length - 1] as ShareIngestItem;
      this.applySharePrompt(latest.suggestedPrompt, latest.files);
    } catch {
      // Endpoint may be unavailable in older runtimes.
    }
  }

  private handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (this.commandPaletteOpen) {
      const items = this.filteredCommandItems();
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeCommandPalette();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (items.length > 0) this.commandActiveIndex = (this.commandActiveIndex + 1) % items.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length > 0) this.commandActiveIndex = (this.commandActiveIndex - 1 + items.length) % items.length;
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selected = items[this.commandActiveIndex] ?? items[0];
        if (selected) void this.executeCommand(selected.id);
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }
  };

  private openCommandPalette(): void {
    this.commandQuery = "";
    this.commandActiveIndex = 0;
    this.commandPaletteOpen = true;
    window.setTimeout(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("[data-command-input]");
      input?.focus();
      input?.select();
    }, 0);
  }

  private closeCommandPalette(): void {
    this.commandPaletteOpen = false;
  }

  private async executeCommand(commandId: string): Promise<void> {
    this.closeCommandPalette();
    switch (commandId) {
      case "agent-start":
        await this.handleStart();
        break;
      case "agent-toggle-pause":
        await this.handlePauseResume();
        break;
      case "agent-stop":
        await this.handleStop();
        break;
      case "agent-restart":
        await this.handleRestart();
        break;
      case "open-chat":
        this.setTab("chat");
        break;
      case "open-workbench":
        this.setTab("workbench");
        await this.loadWorkbench();
        break;
      case "open-inventory":
        this.setTab("inventory");
        await this.loadInventory();
        break;
      case "open-marketplace":
        this.setTab("marketplace");
        await this.loadMarketplace();
        break;
      case "open-plugins":
        this.setTab("plugins");
        await this.loadPlugins();
        break;
      case "open-skills":
        this.setTab("skills");
        await this.loadSkills();
        break;
      case "open-config":
        this.setTab("config");
        await this.loadWalletConfig();
        break;
      case "open-logs":
        this.setTab("logs");
        await this.loadLogs();
        break;
      case "refresh-marketplace":
        await this.loadMarketplace(true);
        break;
      case "refresh-workbench":
        await this.loadWorkbench();
        break;
      case "refresh-plugins":
        await this.loadPlugins();
        break;
      case "refresh-skills":
        await this.refreshSkills();
        break;
      case "refresh-logs":
        await this.loadLogs();
        break;
      case "chat-clear":
        this.handleChatClear();
        break;
      case "native-notify":
        await this.sendNativeNotification();
        break;
      case "native-tray":
        await this.configureNativeTrayMenu();
        break;
      default:
        break;
    }
  }

  private commandItems(): Array<{ id: string; label: string; hint: string }> {
    const state = this.agentStatus?.state ?? "not_started";
    return [
      { id: "agent-start", label: "Start Agent", hint: "Lifecycle" },
      { id: "agent-toggle-pause", label: state === "running" ? "Pause Agent" : "Resume Agent", hint: "Lifecycle" },
      { id: "agent-stop", label: "Stop Agent", hint: "Lifecycle" },
      { id: "agent-restart", label: "Restart Agent", hint: "Lifecycle" },
      { id: "open-chat", label: "Open Chat", hint: "Navigation" },
      { id: "open-workbench", label: "Open Workbench", hint: "Navigation" },
      { id: "open-inventory", label: "Open Inventory", hint: "Navigation" },
      { id: "open-marketplace", label: "Open Marketplace", hint: "Navigation" },
      { id: "open-plugins", label: "Open Plugins", hint: "Navigation" },
      { id: "open-skills", label: "Open Skills", hint: "Navigation" },
      { id: "open-config", label: "Open Config", hint: "Navigation" },
      { id: "open-logs", label: "Open Logs", hint: "Navigation" },
      { id: "refresh-workbench", label: "Refresh Workbench", hint: "Data" },
      { id: "refresh-marketplace", label: "Refresh Marketplace", hint: "Data" },
      { id: "refresh-plugins", label: "Refresh Plugins", hint: "Data" },
      { id: "refresh-skills", label: "Refresh Skills", hint: "Data" },
      { id: "refresh-logs", label: "Refresh Logs", hint: "Data" },
      { id: "chat-clear", label: "Clear Chat Transcript", hint: "Chat" },
      { id: "native-tray", label: "Configure Tray Menu", hint: "Native" },
      { id: "native-notify", label: "Send Native Notification", hint: "Native" },
    ];
  }

  private filteredCommandItems(): Array<{ id: string; label: string; hint: string }> {
    const q = this.commandQuery.trim().toLowerCase();
    const items = !q
      ? this.commandItems()
      : this.commandItems().filter((item) => (
        item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q) || item.id.includes(q)
      ));
    if (items.length === 0) {
      this.commandActiveIndex = 0;
    } else if (this.commandActiveIndex >= items.length) {
      this.commandActiveIndex = items.length - 1;
    } else if (this.commandActiveIndex < 0) {
      this.commandActiveIndex = 0;
    }
    return items;
  }

  private async loadWorkbench(): Promise<void> {
    this.workbenchLoading = true;
    try {
      this.workbench = await client.getWorkbenchOverview();
    } catch {
      this.workbench = null;
    } finally {
      this.workbenchLoading = false;
    }
  }

  private goalPriority(goal: WorkbenchGoal): number | null {
    const raw = goal.metadata?.priority;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    return null;
  }

  private workbenchGoalSorted(goals: WorkbenchGoal[]): WorkbenchGoal[] {
    return [...goals].sort((a, b) => {
      const aPriority = this.goalPriority(a) ?? 3;
      const bPriority = this.goalPriority(b) ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });
  }

  private workbenchTodoSorted(todos: WorkbenchTodo[]): WorkbenchTodo[] {
    return [...todos].sort((a, b) => {
      const aPriority = a.priority ?? 3;
      const bPriority = b.priority ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private resetWorkbenchGoalForm(): void {
    this.workbenchEditingGoalId = null;
    this.workbenchGoalName = "";
    this.workbenchGoalDescription = "";
    this.workbenchGoalTags = "";
    this.workbenchGoalPriority = "3";
  }

  private startWorkbenchGoalEdit(goal: WorkbenchGoal): void {
    this.workbenchEditingGoalId = goal.id;
    this.workbenchGoalName = goal.name;
    this.workbenchGoalDescription = goal.description ?? "";
    this.workbenchGoalTags = goal.tags.join(", ");
    this.workbenchGoalPriority = String(this.goalPriority(goal) ?? 3);
  }

  private async submitWorkbenchGoalForm(): Promise<void> {
    const name = this.workbenchGoalName.trim();
    if (!name) return;
    const description = this.workbenchGoalDescription.trim();
    const tags = this.workbenchGoalTags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);
    const priority = Number.parseInt(this.workbenchGoalPriority, 10);
    const normalizedPriority = Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3;

    try {
      if (this.workbenchEditingGoalId) {
        await client.updateWorkbenchGoal(this.workbenchEditingGoalId, {
          name,
          description,
          tags,
          priority: normalizedPriority,
        });
      } else {
        await client.createWorkbenchGoal({
          name,
          description,
          tags,
          priority: normalizedPriority,
        });
      }
      this.resetWorkbenchGoalForm();
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async reprioritizeGoal(goalId: string, nextPriority: number): Promise<void> {
    try {
      await client.updateWorkbenchGoal(goalId, { priority: nextPriority });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleWorkbenchGoal(goalId: string, isCompleted: boolean): Promise<void> {
    try {
      await client.setWorkbenchGoalCompleted(goalId, isCompleted);
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleWorkbenchTodo(todoId: string, isCompleted: boolean): Promise<void> {
    try {
      await client.setWorkbenchTodoCompleted(todoId, isCompleted);
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async reprioritizeTodo(todoId: string, nextPriority: number): Promise<void> {
    try {
      await client.updateWorkbenchTodo(todoId, { priority: nextPriority });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleTodoUrgent(todoId: string, isUrgent: boolean): Promise<void> {
    try {
      await client.updateWorkbenchTodo(todoId, { isUrgent });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async createWorkbenchTodoQuick(): Promise<void> {
    const name = this.workbenchTodoName.trim();
    if (!name) return;
    const description = this.workbenchTodoDescription.trim();
    const priority = Number.parseInt(this.workbenchTodoPriority, 10);
    const normalizedPriority = Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3;

    try {
      await client.createWorkbenchTodo({
        name,
        description,
        priority: normalizedPriority,
        isUrgent: this.workbenchTodoUrgent,
        type: "one-off",
      });
      this.workbenchTodoName = "";
      this.workbenchTodoDescription = "";
      this.workbenchTodoPriority = "3";
      this.workbenchTodoUrgent = false;
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async loadMarketplace(forceRefresh = false): Promise<void> {
    this.marketplaceLoading = true;
    try {
      if (forceRefresh) {
        await client.refreshRegistry();
      }
      const [registry, installed] = await Promise.all([
        client.getRegistryPlugins(),
        client.getInstalledRegistryPlugins(),
      ]);
      this.marketplacePlugins = registry.plugins;
      this.marketplaceInstalled = installed.plugins;
    } catch {
      this.marketplacePlugins = [];
      this.marketplaceInstalled = [];
    } finally {
      this.marketplaceLoading = false;
    }
    // Pre-load skills marketplace config so API key section hides when already set
    void this.loadSkillsMarketplaceConfig();
    void this.loadInstalledMarketplaceSkills();
  }

  private async installFromMarketplace(pluginName: string): Promise<void> {
    this.marketplaceAction = `install:${pluginName}`;
    try {
      await client.installRegistryPlugin(pluginName, true);
      await this.loadMarketplace();
      await this.loadPlugins();
      await this.loadLogs();
      this.setActionNotice(`Installed ${pluginName}.`, "success");
    } catch (err) {
      this.setActionNotice(`Install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.marketplaceAction = "";
    }
  }

  private async uninstallFromMarketplace(pluginName: string): Promise<void> {
    this.marketplaceAction = `uninstall:${pluginName}`;
    try {
      await client.uninstallRegistryPlugin(pluginName, true);
      await this.loadMarketplace();
      await this.loadPlugins();
      await this.loadLogs();
      this.setActionNotice(`Uninstalled ${pluginName}.`, "success");
    } catch (err) {
      this.setActionNotice(`Uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.marketplaceAction = "";
    }
  }

  // --- MCP Marketplace ---

  private async loadMcpConfig(): Promise<void> {
    this.mcpConfigLoading = true;
    try {
      const { servers } = await client.getMcpConfig();
      this.mcpConfiguredServers = servers || {};
    } catch {
      this.mcpConfiguredServers = {};
    } finally {
      this.mcpConfigLoading = false;
    }
    void this.loadMcpStatus();
  }

  private async loadMcpStatus(): Promise<void> {
    try {
      const { servers } = await client.getMcpStatus();
      this.mcpServerStatuses = servers || [];
    } catch {
      this.mcpServerStatuses = [];
    }
  }

  private async searchMcpMarketplace(): Promise<void> {
    const query = this.mcpMarketplaceQuery.trim();
    if (!query) {
      this.mcpMarketplaceResults = [];
      return;
    }
    this.mcpMarketplaceLoading = true;
    this.mcpAction = "";
    try {
      const { results } = await client.searchMcpMarketplace(query, 30);
      this.mcpMarketplaceResults = results;
    } catch (err) {
      this.mcpMarketplaceResults = [];
      this.setActionNotice(`MCP search failed: ${err instanceof Error ? err.message : "network error"}`, "error", 3800);
    } finally {
      this.mcpMarketplaceLoading = false;
    }
  }

  private async addMcpFromMarketplace(result: McpMarketplaceResult): Promise<void> {
    this.mcpAction = `add:${result.name}`;
    try {
      // Fetch full details to check for env vars / headers
      const { server } = await client.getMcpServerDetails(result.name);

      // Check if server requires configuration
      const envVars = server.packages?.[0]?.environmentVariables || [];
      const headers = server.remotes?.[0]?.headers || [];
      const hasRequiredConfig = envVars.length > 0 || headers.length > 0;

      if (hasRequiredConfig) {
        // Show configuration form — pre-fill defaults
        const envDefaults: Record<string, string> = {};
        for (const v of envVars) {
          envDefaults[v.name] = v.default || "";
        }
        const headerDefaults: Record<string, string> = {};
        for (const h of headers) {
          headerDefaults[h.name] = "";
        }
        this.mcpAddingServer = server;
        this.mcpAddingResult = result;
        this.mcpEnvInputs = envDefaults;
        this.mcpHeaderInputs = headerDefaults;
        this.mcpAction = "";
        return;
      }

      // No config needed — add directly
      await this.addMcpServerDirect(result, server);
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      if (!this.mcpAddingServer) {
        this.mcpAction = "";
      }
    }
  }

  private async addMcpServerDirect(
    result: McpMarketplaceResult,
    server: McpRegistryServerDetail,
    envValues?: Record<string, string>,
    headerValues?: Record<string, string>,
  ): Promise<void> {
    let config: McpServerConfig;

    // Build config from full server details
    if (server.remotes && server.remotes.length > 0) {
      const remote = server.remotes[0];
      config = {
        type: (remote.type as McpServerConfig["type"]) || "streamable-http",
        url: remote.url,
      };
      if (headerValues && Object.keys(headerValues).length > 0) {
        config.headers = { ...headerValues };
      }
    } else if (result.connectionType === "stdio" && result.npmPackage) {
      config = { type: "stdio", command: "npx", args: ["-y", result.npmPackage] };
      // Append packageArguments defaults
      const pkgArgs = server.packages?.[0]?.packageArguments;
      if (pkgArgs) {
        for (const arg of pkgArgs) {
          if (arg.default) config.args!.push(arg.default);
        }
      }
      if (envValues && Object.keys(envValues).length > 0) {
        config.env = { ...envValues };
      }
    } else if (result.connectionType === "stdio" && result.dockerImage) {
      config = { type: "stdio", command: "docker", args: ["run", "-i", "--rm", result.dockerImage] };
      if (envValues && Object.keys(envValues).length > 0) {
        config.env = { ...envValues };
      }
    } else {
      this.setActionNotice("Cannot auto-configure this server. Use manual config.", "error", 4000);
      return;
    }

    const configName = result.name.includes("/") ? result.name.split("/").pop()! : result.name;
    await client.addMcpServer(configName, config);
    this.setActionNotice(`Added MCP server: ${configName}. Restarting...`, "info");
    await this.loadMcpConfig();

    // Restart agent to pick up new MCP server
    try {
      await client.restartAgent();
      this.setActionNotice(`Added MCP server: ${configName}`, "success");
      // Poll status after restart settles
      setTimeout(() => { void this.loadMcpStatus(); }, 3000);
    } catch {
      this.setActionNotice(`Added ${configName} — restart agent to activate`, "info", 5000);
    }
  }

  private async confirmMcpAdd(): Promise<void> {
    if (!this.mcpAddingServer || !this.mcpAddingResult) return;

    // Validate required env vars
    const envVars = this.mcpAddingServer.packages?.[0]?.environmentVariables || [];
    for (const v of envVars) {
      if (v.isRequired && !this.mcpEnvInputs[v.name]?.trim()) {
        this.setActionNotice(`${v.name} is required`, "error", 3000);
        return;
      }
    }

    // Validate required headers
    const headers = this.mcpAddingServer.remotes?.[0]?.headers || [];
    for (const h of headers) {
      if (h.isRequired && !this.mcpHeaderInputs[h.name]?.trim()) {
        this.setActionNotice(`${h.name} header is required`, "error", 3000);
        return;
      }
    }

    // Filter out empty values
    const envValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.mcpEnvInputs)) {
      if (v.trim()) envValues[k] = v.trim();
    }
    const headerValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.mcpHeaderInputs)) {
      if (v.trim()) headerValues[k] = v.trim();
    }

    this.mcpAction = `add:${this.mcpAddingResult.name}`;
    try {
      await this.addMcpServerDirect(this.mcpAddingResult, this.mcpAddingServer, envValues, headerValues);
      this.cancelMcpAdd();
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  private cancelMcpAdd(): void {
    this.mcpAddingServer = null;
    this.mcpAddingResult = null;
    this.mcpEnvInputs = {};
    this.mcpHeaderInputs = {};
  }

  private async addMcpManual(): Promise<void> {
    const name = this.mcpManualName.trim();
    if (!name) {
      this.setActionNotice("Server name is required.", "error", 3000);
      return;
    }

    const config: McpServerConfig = { type: this.mcpManualType };

    if (this.mcpManualType === "stdio") {
      const cmd = this.mcpManualCommand.trim();
      if (!cmd) {
        this.setActionNotice("Command is required for stdio servers.", "error", 3000);
        return;
      }
      config.command = cmd;
      const argsStr = this.mcpManualArgs.trim();
      if (argsStr) {
        config.args = argsStr.includes("\n")
          ? argsStr.split(/\r?\n/).map((a) => a.trim()).filter(Boolean)
          : argsStr.split(/\s+/);
      }
    } else {
      const url = this.mcpManualUrl.trim();
      if (!url) {
        this.setActionNotice("URL is required for remote servers.", "error", 3000);
        return;
      }
      config.url = url;
    }

    const envPairs = this.mcpManualEnvPairs.filter((p) => p.key.trim());
    if (envPairs.length > 0) {
      config.env = {};
      for (const pair of envPairs) {
        config.env[pair.key.trim()] = pair.value;
      }
    }

    this.mcpAction = `add-manual:${name}`;
    try {
      await client.addMcpServer(name, config);
      this.setActionNotice(`Added MCP server: ${name}. Restarting...`, "info");
      await this.loadMcpConfig();
      this.mcpManualName = "";
      this.mcpManualCommand = "";
      this.mcpManualArgs = "";
      this.mcpManualUrl = "";
      this.mcpManualEnvPairs = [];
      try {
        await client.restartAgent();
        this.setActionNotice(`Added MCP server: ${name}`, "success");
        setTimeout(() => { void this.loadMcpStatus(); }, 3000);
      } catch {
        this.setActionNotice(`Added ${name} — restart agent to activate`, "info", 5000);
      }
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  private async removeMcpServer(name: string): Promise<void> {
    this.mcpAction = `remove:${name}`;
    try {
      await client.removeMcpServer(name);
      this.setActionNotice(`Removed MCP server: ${name}. Restarting...`, "info");
      await this.loadMcpConfig();
      try {
        await client.restartAgent();
        this.setActionNotice(`Removed MCP server: ${name}`, "success");
        setTimeout(() => { void this.loadMcpStatus(); }, 3000);
      } catch {
        this.setActionNotice(`Removed ${name} — restart agent to activate`, "info", 5000);
      }
    } catch (err) {
      this.setActionNotice(`Failed to remove server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  // --- Agent lifecycle ---

  private async handleStart(): Promise<void> {
    try {
      this.agentStatus = await client.startAgent();
      this.setActionNotice("Agent started.", "success");
      await this.configureNativeTrayMenu();
    } catch {
      this.setActionNotice("Failed to start agent.", "error");
    }
  }

  private async handleStop(): Promise<void> {
    try {
      this.agentStatus = await client.stopAgent();
      this.setActionNotice("Agent stopped.", "info");
      await this.configureNativeTrayMenu();
    } catch {
      this.setActionNotice("Failed to stop agent.", "error");
    }
  }

  private async handlePauseResume(): Promise<void> {
    if (!this.agentStatus) return;
    try {
      if (this.agentStatus.state === "running") {
        this.agentStatus = await client.pauseAgent();
        this.setActionNotice("Agent paused.", "info");
      } else if (this.agentStatus.state === "paused") {
        this.agentStatus = await client.resumeAgent();
        this.setActionNotice("Agent resumed.", "success");
      } else {
        this.agentStatus = await client.startAgent();
        this.setActionNotice("Agent started.", "success");
      }
      await this.configureNativeTrayMenu();
    } catch {
      this.setActionNotice("Failed to change agent state.", "error");
    }
  }

  private async handleRestart(): Promise<void> {
    try {
      this.agentStatus = { ...(this.agentStatus ?? { agentName: "Milaidy", model: undefined, uptime: undefined, startedAt: undefined }), state: "restarting" };
      this.agentStatus = await client.restartAgent();
      this.setActionNotice("Agent restarted.", "success");
      await this.configureNativeTrayMenu();
    } catch {
      this.setActionNotice("Restart requested — waiting for runtime status...", "info", 4200);
      // Fall back to polling status after a delay (restart may have killed the connection)
      setTimeout(async () => {
        try {
          this.agentStatus = await client.getStatus();
          await this.configureNativeTrayMenu();
        } catch { /* ignore */ }
      }, 3000);
    }
  }

  private async handleExportKeys(): Promise<void> {
    if (this.walletExportVisible) {
      this.walletExportVisible = false;
      this.walletExportData = null;
      return;
    }
    const confirmed = window.confirm(
      "This will reveal your private keys.\n\n" +
      "NEVER share your private keys with anyone.\n" +
      "Anyone with your private keys can steal all funds in your wallets.\n\n" +
      "Continue?",
    );
    if (!confirmed) return;

    try {
      this.walletExportData = await client.exportWalletKeys();
      this.walletExportVisible = true;
      // Auto-hide after 60 seconds for security
      setTimeout(() => {
        this.walletExportVisible = false;
        this.walletExportData = null;
      }, 60_000);
    } catch (err) {
      this.walletError = `Failed to export keys: ${err instanceof Error ? err.message : "network error"}`;
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
      this.onboardingSkillsmpApiKey = "";
      this.chatMessages = [];
      localStorage.removeItem(CHAT_STORAGE_KEY);
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
    this.droppedFiles = [];
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

  private handleChatDrop = (event: DragEvent): void => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const names = files.map((file) => file.name);
    this.droppedFiles = names;
    const bulletList = names.map((name) => `- ${name}`).join("\n");
    this.chatInput = `${this.chatInput.trim()}\n\nAttached files:\n${bulletList}`.trim();
    this.requestUpdate();
  };

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
      skillsmpApiKey: this.onboardingSkillsmpApiKey || undefined,
    });

    this.onboardingComplete = true;

    // Restart the agent so the runtime picks up the new config
    // (name, provider keys, etc.) that was just saved by submitOnboarding.
    try {
      this.agentStatus = await client.restartAgent();
    } catch { /* ignore */ }
  }

  // --- Render ---

  private renderCommandPalette() {
    if (!this.commandPaletteOpen) return html``;
    const items = this.filteredCommandItems();
    const selected = Math.min(this.commandActiveIndex, Math.max(0, items.length - 1));
    return html`
      <div
        style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:999;"
        @click=${this.closeCommandPalette}
      >
        <div
          style="max-width:720px;margin:8vh auto 0;border:1px solid var(--border);background:var(--card);padding:12px;"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div style="display:flex;align-items:center;gap:8px;">
            <input
              data-command-input="true"
              style="flex:1;padding:8px 10px;border:1px solid var(--border);background:var(--bg);font-family:var(--mono);"
              placeholder="Type a command..."
              .value=${this.commandQuery}
              @input=${(e: Event) => {
        this.commandQuery = (e.target as HTMLInputElement).value;
        this.commandActiveIndex = 0;
      }}
            />
            <button class="btn" @click=${this.closeCommandPalette}>Close</button>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--muted);font-family:var(--mono);">
            ↑/↓ navigate • Enter run • Esc close
          </div>
          <div style="margin-top:10px;max-height:45vh;overflow:auto;border:1px solid var(--border);">
            ${items.length === 0
        ? html`<div style="padding:12px;color:var(--muted);">No matching commands.</div>`
        : items.map((item, index) => html`
                  <button
                    style="display:flex;justify-content:space-between;align-items:center;width:100%;padding:10px 12px;border:none;border-bottom:1px solid var(--bg-muted);background:${index === selected ? "var(--bg-muted)" : "var(--card)"};cursor:pointer;text-align:left;"
                    @mouseenter=${() => { this.commandActiveIndex = index; }}
                    @click=${() => this.executeCommand(item.id)}
                  >
                    <span>${item.label}</span>
                    <span style="font-size:11px;color:var(--muted);">${item.hint}</span>
                  </button>
                `)}
          </div>
        </div>
      </div>
    `;
  }

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
        ${this.actionNotice
        ? html`
              <div style="margin-top:10px;padding:8px 12px;border:1px solid ${this.actionNotice.tone === "error" ? "var(--danger, #e74c3c)" : this.actionNotice.tone === "success" ? "var(--ok)" : "var(--border)"};background:${this.actionNotice.tone === "error" ? "rgba(231,76,60,0.08)" : this.actionNotice.tone === "success" ? "rgba(22,163,74,0.08)" : "var(--bg-muted)"};font-size:12px;">
                ${this.actionNotice.text}
              </div>
            `
        : ""}
        ${this.renderNav()}
        <main>${this.renderView()}</main>
        <footer>milaidy</footer>
      </div>
      ${this.renderCommandPalette()}
    `;
  }

  private renderHeader() {
    const status = this.agentStatus;
    const state = status?.state ?? "not_started";
    const name = status?.agentName ?? "Milaidy";

    return html`
      <header>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="logo">${name}</span>
          ${this.renderWalletIcon()}
        </div>
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
          <button class="lifecycle-btn" @click=${this.openCommandPalette} title="Command palette (Cmd/Ctrl+K)">Cmd+K</button>
        </div>
      </header>
    `;
  }

  private renderWalletIcon() {
    const w = this.walletAddresses;
    if (!w || (!w.evmAddress && !w.solanaAddress)) return html``;

    const evmShort = w.evmAddress
      ? `${w.evmAddress.slice(0, 6)}...${w.evmAddress.slice(-4)}`
      : null;
    const solShort = w.solanaAddress
      ? `${w.solanaAddress.slice(0, 4)}...${w.solanaAddress.slice(-4)}`
      : null;

    return html`
      <div class="wallet-wrapper">
        <button class="wallet-btn" @click=${() => this.setTab("inventory")}
                title="View Inventory">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
          </svg>
        </button>
        <div class="wallet-tooltip">
          ${evmShort ? html`
            <div class="wallet-addr-row">
              <span class="chain-label">EVM</span>
              <code>${evmShort}</code>
              <button class="copy-btn" @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(w.evmAddress!); }}>copy</button>
            </div>
          ` : ""}
          ${solShort ? html`
            <div class="wallet-addr-row">
              <span class="chain-label">SOL</span>
              <code>${solShort}</code>
              <button class="copy-btn" @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(w.solanaAddress!); }}>copy</button>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
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
      case "workbench": return this.renderWorkbench();
      case "inventory": return this.renderInventory();
      case "plugins": return this.renderPlugins();
      case "marketplace": return this.renderMarketplace();
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
        ${this.shareIngestNotice
        ? html`<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--border);background:var(--bg-muted);font-size:12px;color:var(--muted-strong);">${this.shareIngestNotice}</div>`
        : ""}
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
        <div
          class="chat-input-row"
          @dragover=${(e: DragEvent) => e.preventDefault()}
          @drop=${this.handleChatDrop}
        >
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
        ${this.droppedFiles.length > 0
        ? html`
              <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                ${this.droppedFiles.map((file) => html`<span style="font-size:11px;border:1px solid var(--border);padding:2px 8px;background:var(--surface);">${file}</span>`)}
                <button class="copy-btn" @click=${() => { this.droppedFiles = []; }}>clear</button>
              </div>
            `
        : html`<div style="margin-top:8px;font-size:11px;color:var(--muted);">Tip: drag files into chat to attach context.</div>`}
      </div>
    `;
  }

  private renderWorkbench() {
    const wb = this.workbench;
    if (this.workbenchLoading) {
      return html`
        <h2>Workbench</h2>
        <div class="empty-state">Loading goals and todos...</div>
      `;
    }

    if (!wb) {
      return html`
        <h2>Workbench</h2>
        <p class="subtitle">Task + Goal workspace for autonomous execution.</p>
        <div style="margin-bottom:8px;">
          <button class="btn" @click=${this.loadWorkbench}>Reload</button>
        </div>
        <div class="empty-state">No workbench data yet. Start the agent and try again.</div>
      `;
    }

    const openGoals = this.workbenchGoalSorted(wb.goals.filter((goal) => !goal.isCompleted));
    const openTodos = this.workbenchTodoSorted(wb.todos.filter((todo) => !todo.isCompleted));
    const dueSoonTodos = openTodos.filter((todo) => {
      if (!todo.dueDate) return false;
      const dueAt = Date.parse(todo.dueDate);
      if (Number.isNaN(dueAt)) return false;
      const now = Date.now();
      return dueAt >= now && dueAt <= now + 24 * 60 * 60 * 1000;
    });

    return html`
      <h2>Workbench</h2>
      <p class="subtitle">Task + Goal workspace for autonomous execution.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button class="btn" @click=${this.loadWorkbench}>Refresh</button>
        <button class="btn" @click=${() => this.executeCommand("agent-toggle-pause")}>
          ${this.agentStatus?.state === "running" ? "Pause Agent" : "Resume Agent"}
        </button>
        <button class="btn" @click=${() => this.executeCommand("agent-restart")}>Restart Agent</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;">
        <div style="border:1px solid var(--border);padding:10px;background:var(--card);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Open Goals</div>
          <div style="font-size:22px;font-weight:bold;">${wb.summary.openGoals}</div>
        </div>
        <div style="border:1px solid var(--border);padding:10px;background:var(--card);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Open Todos</div>
          <div style="font-size:22px;font-weight:bold;">${wb.summary.openTodos}</div>
        </div>
        <div style="border:1px solid var(--border);padding:10px;background:var(--card);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Due Soon</div>
          <div style="font-size:22px;font-weight:bold;">${wb.summary.dueSoonTodos}</div>
        </div>
        <div style="border:1px solid var(--border);padding:10px;background:var(--card);">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Autonomy Loop</div>
          <div style="font-size:16px;font-weight:bold;">${wb.autonomy.loopRunning ? "Running" : "Idle"}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <section style="border:1px solid var(--border);background:var(--card);padding:12px;">
          <div style="font-weight:bold;margin-bottom:8px;">${this.workbenchEditingGoalId ? "Edit Goal" : "Create Goal"}</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input
              class="plugin-search"
              placeholder="Goal name"
              .value=${this.workbenchGoalName}
              @input=${(e: Event) => { this.workbenchGoalName = (e.target as HTMLInputElement).value; }}
            />
            <textarea
              class="chat-input"
              rows="3"
              placeholder="Goal description"
              .value=${this.workbenchGoalDescription}
              @input=${(e: Event) => { this.workbenchGoalDescription = (e.target as HTMLTextAreaElement).value; }}
            ></textarea>
            <input
              class="plugin-search"
              placeholder="Tags (comma separated)"
              .value=${this.workbenchGoalTags}
              @input=${(e: Event) => { this.workbenchGoalTags = (e.target as HTMLInputElement).value; }}
            />
            <div style="display:flex;gap:8px;align-items:center;">
              <label style="font-size:12px;color:var(--muted);">Priority</label>
              <select
                style="padding:6px 8px;border:1px solid var(--border);background:var(--bg);"
                .value=${this.workbenchGoalPriority}
                @change=${(e: Event) => { this.workbenchGoalPriority = (e.target as HTMLSelectElement).value; }}
              >
                <option value="1">P1</option>
                <option value="2">P2</option>
                <option value="3">P3</option>
                <option value="4">P4</option>
                <option value="5">P5</option>
              </select>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn" @click=${this.submitWorkbenchGoalForm} ?disabled=${!this.workbenchGoalName.trim()}>
                ${this.workbenchEditingGoalId ? "Save Goal" : "Add Goal"}
              </button>
              ${this.workbenchEditingGoalId
        ? html`<button class="btn btn-outline" @click=${this.resetWorkbenchGoalForm}>Cancel</button>`
        : ""}
            </div>
          </div>
        </section>

        <section style="border:1px solid var(--border);background:var(--card);padding:12px;">
          <div style="font-weight:bold;margin-bottom:8px;">Quick Todo</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input
              class="plugin-search"
              placeholder="Todo name"
              .value=${this.workbenchTodoName}
              @input=${(e: Event) => { this.workbenchTodoName = (e.target as HTMLInputElement).value; }}
            />
            <textarea
              class="chat-input"
              rows="3"
              placeholder="Todo description"
              .value=${this.workbenchTodoDescription}
              @input=${(e: Event) => { this.workbenchTodoDescription = (e.target as HTMLTextAreaElement).value; }}
            ></textarea>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <label style="font-size:12px;color:var(--muted);">Priority</label>
              <select
                style="padding:6px 8px;border:1px solid var(--border);background:var(--bg);"
                .value=${this.workbenchTodoPriority}
                @change=${(e: Event) => { this.workbenchTodoPriority = (e.target as HTMLSelectElement).value; }}
              >
                <option value="1">P1</option>
                <option value="2">P2</option>
                <option value="3">P3</option>
                <option value="4">P4</option>
                <option value="5">P5</option>
              </select>
              <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);">
                <input
                  type="checkbox"
                  .checked=${this.workbenchTodoUrgent}
                  @change=${(e: Event) => { this.workbenchTodoUrgent = (e.target as HTMLInputElement).checked; }}
                />
                urgent
              </label>
            </div>
            <button class="btn" @click=${this.createWorkbenchTodoQuick} ?disabled=${!this.workbenchTodoName.trim()}>Add Todo</button>
          </div>
        </section>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <section style="border:1px solid var(--border);background:var(--card);">
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:bold;">Goals (${openGoals.length} open)</div>
          ${openGoals.length === 0
        ? html`<div style="padding:12px;color:var(--muted);">No open goals.</div>`
        : html`
                ${openGoals.map((goal) => html`
                  <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--bg-muted);">
                    <input
                      type="checkbox"
                      .checked=${goal.isCompleted}
                      @change=${(e: Event) => this.toggleWorkbenchGoal(goal.id, (e.target as HTMLInputElement).checked)}
                    />
                    <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
                      <span style="font-weight:600;">${goal.name}</span>
                      ${goal.description ? html`<span style="font-size:12px;color:var(--muted);">${goal.description}</span>` : ""}
                      ${goal.tags.length > 0 ? html`<span style="font-size:11px;color:var(--muted);">#${goal.tags.join(" #")}</span>` : ""}
                    </span>
                    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                      <select
                        style="padding:3px 6px;border:1px solid var(--border);background:var(--bg);font-size:11px;"
                        .value=${String(this.goalPriority(goal) ?? 3)}
                        @change=${(e: Event) => {
            const next = Number.parseInt((e.target as HTMLSelectElement).value, 10);
            if (!Number.isNaN(next)) void this.reprioritizeGoal(goal.id, next);
          }}
                      >
                        <option value="1">P1</option>
                        <option value="2">P2</option>
                        <option value="3">P3</option>
                        <option value="4">P4</option>
                        <option value="5">P5</option>
                      </select>
                      <button class="copy-btn" @click=${() => this.startWorkbenchGoalEdit(goal)}>edit</button>
                    </div>
                  </div>
                `)}
              `}
        </section>

        <section style="border:1px solid var(--border);background:var(--card);">
          <div style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:bold;">Todos (${openTodos.length} open)</div>
          ${openTodos.length === 0
        ? html`<div style="padding:12px;color:var(--muted);">No open todos.</div>`
        : html`
                ${openTodos.map((todo) => {
          const dueSoon = dueSoonTodos.some((entry) => entry.id === todo.id);
          return html`
                    <div style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--bg-muted);">
                      <input
                        type="checkbox"
                        .checked=${todo.isCompleted}
                        @change=${(e: Event) => this.toggleWorkbenchTodo(todo.id, (e.target as HTMLInputElement).checked)}
                      />
                      <span style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                        <span style="font-weight:600;">
                          ${todo.name}
                          ${todo.isUrgent ? html`<span style="font-size:11px;color:var(--danger);margin-left:4px;">urgent</span>` : ""}
                        </span>
                        <span style="font-size:12px;color:var(--muted);">
                          ${todo.type}
                          ${todo.priority != null ? ` • P${todo.priority}` : ""}
                          ${todo.dueDate ? ` • due ${new Date(todo.dueDate).toLocaleString()}` : ""}
                        </span>
                        ${dueSoon ? html`<span style="font-size:11px;color:var(--warn);">Due within 24h</span>` : ""}
                      </span>
                      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                        <select
                          style="padding:3px 6px;border:1px solid var(--border);background:var(--bg);font-size:11px;"
                          .value=${String(todo.priority ?? 3)}
                          @change=${(e: Event) => {
              const next = Number.parseInt((e.target as HTMLSelectElement).value, 10);
              if (!Number.isNaN(next)) void this.reprioritizeTodo(todo.id, next);
            }}
                        >
                          <option value="1">P1</option>
                          <option value="2">P2</option>
                          <option value="3">P3</option>
                          <option value="4">P4</option>
                          <option value="5">P5</option>
                        </select>
                        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);">
                          <input
                            type="checkbox"
                            .checked=${todo.isUrgent}
                            @change=${(e: Event) => this.toggleTodoUrgent(todo.id, (e.target as HTMLInputElement).checked)}
                          />
                          urgent
                        </label>
                      </div>
                    </div>
                  `;
        })}
              `}
        </section>
      </div>
    `;
  }

  private renderMarketplace() {
    return html`
      <h2>Marketplace</h2>
      <p class="subtitle">Install plugins, skills, and MCP servers from the community.</p>
      
      <!-- Sub-tab navigation -->
      <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:8px;">
        <button
          class="btn ${this.marketplaceSubTab === "plugins" ? "" : "secondary"}"
          style="padding:6px 16px;border-radius:4px 4px 0 0;${this.marketplaceSubTab === "plugins" ? "background:var(--accent);color:#fff;" : ""}"
          @click=${() => { this.marketplaceSubTab = "plugins"; }}
        >Plugins</button>
        <button
          class="btn ${this.marketplaceSubTab === "skills" ? "" : "secondary"}"
          style="padding:6px 16px;border-radius:4px 4px 0 0;${this.marketplaceSubTab === "skills" ? "background:var(--accent);color:#fff;" : ""}"
          @click=${() => { this.marketplaceSubTab = "skills"; void this.loadSkillsMarketplaceConfig(); void this.loadInstalledMarketplaceSkills(); }}
        >Skills</button>
        <button
          class="btn ${this.marketplaceSubTab === "mcp" ? "" : "secondary"}"
          style="padding:6px 16px;border-radius:4px 4px 0 0;${this.marketplaceSubTab === "mcp" ? "background:var(--accent);color:#fff;" : ""}"
          @click=${() => { this.marketplaceSubTab = "mcp"; void this.loadMcpConfig(); }}
        >MCP Servers</button>
      </div>

      ${this.marketplaceSubTab === "plugins" ? this.renderMarketplacePlugins() : ""}
      ${this.marketplaceSubTab === "skills" ? this.renderMarketplaceSkills() : ""}
      ${this.marketplaceSubTab === "mcp" ? this.renderMarketplaceMcp() : ""}
    `;
  }

  private renderMarketplacePlugins() {
    const installedSet = new Set(this.marketplaceInstalled.map((plugin) => plugin.name));
    const query = this.marketplaceSearch.trim().toLowerCase();
    const plugins = this.marketplacePlugins.filter((plugin) => {
      if (!query) return true;
      return (
        plugin.name.toLowerCase().includes(query)
        || (plugin.description || "").toLowerCase().includes(query)
        || plugin.topics.some((topic) => topic.toLowerCase().includes(query))
      );
    });

    return html`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <input
          class="plugin-search"
          placeholder="Search registry plugins..."
          .value=${this.marketplaceSearch}
          @input=${(e: Event) => { this.marketplaceSearch = (e.target as HTMLInputElement).value; }}
        />
        <button class="btn" @click=${() => this.loadMarketplace(true)} ?disabled=${this.marketplaceLoading}>
          ${this.marketplaceLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      ${plugins.length === 0
        ? html`<div class="empty-state">${this.marketplaceLoading ? "Loading registry..." : "No registry plugins found."}</div>`
        : html`
            <div class="plugin-list">
              ${plugins.map((plugin) => {
          const isInstalled = installedSet.has(plugin.name);
          const actionKey = `${isInstalled ? "uninstall" : "install"}:${plugin.name}`;
          const isBusy = this.marketplaceAction === actionKey;
          const trustLevel = plugin.insights?.trustLevel ?? (plugin.stars >= 500 ? "high" : plugin.stars >= 100 ? "medium" : "guarded");
          const trustScore = plugin.insights?.trustScore ?? Math.min(95, Math.max(20, Math.round(Math.log10(plugin.stars + 1) * 30)));
          const maintenanceLabel = plugin.insights?.maintenance.label ?? "recency unknown";
          const compatibilityLabel = plugin.insights?.compatibility.label ?? (plugin.supports.v2 ? "v2 declared" : "compatibility unclear");
          const restartLabel = plugin.insights?.restartImpact.label ?? "restart required";
          return html`
                  <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                      <div style="min-width:0;flex:1;">
                        <div class="plugin-name">${plugin.name}</div>
                        <div class="plugin-desc">${plugin.description || "No description available."}</div>
                        <div style="font-size:11px;color:var(--muted);margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
                          <span>Stars: ${plugin.stars}</span>
                          <span>Language: ${plugin.language}</span>
                          <span>Trust: ${trustLevel} (${trustScore})</span>
                          <span>Supports v2: ${plugin.supports.v2 ? "yes" : "no"}</span>
                        </div>
                        <div style="font-size:11px;margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                          <span style="border:1px solid var(--border);padding:2px 6px;background:var(--bg-muted);">Maintenance: ${maintenanceLabel}</span>
                          <span style="border:1px solid var(--border);padding:2px 6px;background:var(--bg-muted);">Compatibility: ${compatibilityLabel}</span>
                          <span style="border:1px solid var(--border);padding:2px 6px;background:var(--bg-muted);">Restart: ${restartLabel}</span>
                        </div>
                        ${plugin.topics.length > 0 ? html`
                          <div style="font-size:11px;color:var(--muted);margin-top:4px;">Topics: ${plugin.topics.slice(0, 6).join(", ")}</div>
                        ` : ""}
                      </div>
                      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                        <span class="plugin-status ${isInstalled ? "enabled" : ""}">${isInstalled ? "installed" : "available"}</span>
                        ${isInstalled
              ? html`<button class="btn" ?disabled=${isBusy} @click=${() => this.uninstallFromMarketplace(plugin.name)}>${isBusy ? "Uninstalling..." : "Uninstall"}</button>`
              : html`<button class="btn" ?disabled=${isBusy} @click=${() => this.installFromMarketplace(plugin.name)}>${isBusy ? "Installing..." : "Install"}</button>`
            }
                      </div>
                    </div>
                  </div>
                `;
        })}
            </div>
          `}
    `;
  }

  private renderMarketplaceSkills() {
    const installedIds = new Set(this.skillsMarketplaceInstalled.map((skill) => skill.id));

    return html`
      <!-- Skills Marketplace API Key Configuration - only show when not configured -->
      ${!this.skillsMarketplaceApiKeySet ? html`
        <section style="border:1px solid var(--border);padding:12px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
            <div>
              <div style="font-weight:bold;font-size:13px;">Skills Marketplace API Key</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">
                Required for searching the <a href="https://skillsmp.com" target="_blank" rel="noopener" style="color:var(--accent);">skillsmp.com</a> marketplace.
                <a href="https://skillsmp.com/docs/api" target="_blank" rel="noopener" style="color:var(--accent);margin-left:4px;">Get API key →</a>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input
              type="password"
              class="plugin-search"
              style="flex:1;min-width:200px;font-family:var(--mono);font-size:12px;"
              placeholder="sk_live_skillsmp_..." 
              .value=${this.skillsMarketplaceApiKeyInput}
              @input=${(e: Event) => { this.skillsMarketplaceApiKeyInput = (e.target as HTMLInputElement).value; }}
            />
            <button
              class="btn"
              style="font-size:12px;padding:4px 12px;"
              @click=${this.handleSaveSkillsMarketplaceApiKey}
              ?disabled=${this.skillsMarketplaceApiKeySaving || !this.skillsMarketplaceApiKeyInput.trim()}
            >${this.skillsMarketplaceApiKeySaving ? "Saving..." : "Save Key"}</button>
          </div>
        </section>
      ` : ""}

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
        <input
          class="plugin-search"
          style="flex:1;min-width:220px;"
          placeholder="Search skills by keyword..."
          .value=${this.skillsMarketplaceQuery}
          @input=${(e: Event) => { this.skillsMarketplaceQuery = (e.target as HTMLInputElement).value; }}
          @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter") void this.searchSkillsMarketplace();
      }}
        />
        <button class="btn" @click=${this.searchSkillsMarketplace} ?disabled=${this.skillsMarketplaceLoading}>
          ${this.skillsMarketplaceLoading ? "Searching..." : "Search"}
        </button>
      </div>

      ${this.skillsMarketplaceError
        ? html`<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--danger, #e74c3c);font-size:12px;color:var(--danger, #e74c3c);">
              ${this.skillsMarketplaceError}
            </div>`
        : ""}

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
        <input
          class="plugin-search"
          style="flex:1;min-width:220px;"
          placeholder="Install via GitHub URL (repo or /tree/... path)"
          .value=${this.skillsMarketplaceManualGithubUrl}
          @input=${(e: Event) => { this.skillsMarketplaceManualGithubUrl = (e.target as HTMLInputElement).value; }}
          @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter") void this.installSkillFromGithubUrl();
      }}
        />
        <button class="btn" @click=${this.installSkillFromGithubUrl} ?disabled=${this.skillsMarketplaceAction.startsWith("install-url")}>
          ${this.skillsMarketplaceAction.startsWith("install-url") ? "Installing..." : "Install"}
        </button>
      </div>

      ${this.skillsMarketplaceResults.length > 0 ? html`
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Search results (${this.skillsMarketplaceResults.length})</div>
        <div class="plugin-list">
          ${this.skillsMarketplaceResults.map((skill) => {
        const isInstalled = installedIds.has(skill.id);
        const actionKey = `install:${skill.id}`;
        const isBusy = this.skillsMarketplaceAction === actionKey;
        return html`
              <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                  <div style="min-width:0;flex:1;">
                    <div class="plugin-name">${skill.name}</div>
                    <div class="plugin-desc">${skill.description || "No description."}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px;">
                      <a href="${skill.githubUrl}" target="_blank" rel="noopener" style="color:var(--accent);">${skill.repository}</a>
                      ${skill.path ? html` <span style="margin-left:6px;">Path: ${skill.path}</span>` : ""}
                    </div>
                    ${skill.tags.length > 0 ? html`
                      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Tags: ${skill.tags.slice(0, 6).join(", ")}</div>
                    ` : ""}
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span class="plugin-status ${isInstalled ? "enabled" : ""}">${isInstalled ? "installed" : "available"}</span>
                    ${!isInstalled ? html`
                      <button class="btn" ?disabled=${isBusy} @click=${() => this.installSkillFromMarketplace(skill)}>
                        ${isBusy ? "Installing..." : "Install"}
                      </button>
                    ` : ""}
                  </div>
                </div>
              </div>
            `;
      })}
        </div>
      ` : ""}

      ${this.skillsMarketplaceInstalled.length > 0 ? html`
        <div style="font-size:12px;color:var(--muted);margin:16px 0 8px;">Installed from marketplace (${this.skillsMarketplaceInstalled.length})</div>
        <div class="plugin-list">
          ${this.skillsMarketplaceInstalled.map((skill) => {
        const actionKey = `uninstall:${skill.id}`;
        const isBusy = this.skillsMarketplaceAction === actionKey;
        return html`
              <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                  <div style="min-width:0;flex:1;">
                    <div class="plugin-name">${skill.name}</div>
                    <div class="plugin-desc">${skill.description || "No description."}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px;">
                      <a href="${skill.githubUrl}" target="_blank" rel="noopener" style="color:var(--accent);">${skill.repository}</a>
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span class="plugin-status enabled">installed</span>
                    <button class="btn" ?disabled=${isBusy} @click=${() => this.uninstallMarketplaceSkill(skill.id, skill.name)}>
                      ${isBusy ? "Uninstalling..." : "Uninstall"}
                    </button>
                  </div>
                </div>
              </div>
            `;
      })}
        </div>
      ` : ""}
    `;
  }

  private renderMarketplaceMcp() {
    const configuredEntries = Object.entries(this.mcpConfiguredServers);
    const configuredNames = new Set(configuredEntries.map(([name]) => name));

    return html`
      <!-- Env Var / Header Config Form (shown when adding a server that needs config) -->
      ${this.mcpAddingServer ? html`
        <section style="border:2px solid var(--accent);padding:16px;margin-bottom:16px;background:var(--surface);">
          <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">Configure: ${this.mcpAddingServer.title || this.mcpAddingServer.name}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">${this.mcpAddingServer.description}</div>

          ${(this.mcpAddingServer.packages?.[0]?.environmentVariables || []).length > 0 ? html`
            <div style="font-size:12px;font-weight:bold;margin-bottom:6px;">Environment Variables</div>
            ${(this.mcpAddingServer.packages?.[0]?.environmentVariables || []).map((v) => html`
              <div style="margin-bottom:8px;">
                <label style="font-size:11px;display:block;margin-bottom:2px;">
                  <span style="font-family:var(--mono);">${v.name}</span>
                  ${v.isRequired ? html`<span style="color:var(--danger, #e74c3c);">*</span>` : ""}
                  ${v.description ? html`<span style="color:var(--muted);margin-left:4px;">${v.description}</span>` : ""}
                </label>
                <input
                  class="plugin-search"
                  style="width:100%;font-size:12px;"
                  type="${v.isSecret ? "password" : "text"}"
                  placeholder="${v.default || v.name}"
                  .value=${this.mcpEnvInputs[v.name] || ""}
                  @input=${(e: Event) => {
        this.mcpEnvInputs = { ...this.mcpEnvInputs, [v.name]: (e.target as HTMLInputElement).value };
      }}
                />
              </div>
            `)}
          ` : ""}

          ${(this.mcpAddingServer.remotes?.[0]?.headers || []).length > 0 ? html`
            <div style="font-size:12px;font-weight:bold;margin-bottom:6px;margin-top:8px;">Headers</div>
            ${(this.mcpAddingServer.remotes?.[0]?.headers || []).map((h) => html`
              <div style="margin-bottom:8px;">
                <label style="font-size:11px;display:block;margin-bottom:2px;">
                  <span style="font-family:var(--mono);">${h.name}</span>
                  ${h.isRequired ? html`<span style="color:var(--danger, #e74c3c);">*</span>` : ""}
                  ${h.description ? html`<span style="color:var(--muted);margin-left:4px;">${h.description}</span>` : ""}
                </label>
                <input
                  class="plugin-search"
                  style="width:100%;font-size:12px;"
                  type="${h.isSecret ? "password" : "text"}"
                  placeholder="${h.name}"
                  .value=${this.mcpHeaderInputs[h.name] || ""}
                  @input=${(e: Event) => {
        this.mcpHeaderInputs = { ...this.mcpHeaderInputs, [h.name]: (e.target as HTMLInputElement).value };
      }}
                />
              </div>
            `)}
          ` : ""}

          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn" @click=${() => this.confirmMcpAdd()} ?disabled=${this.mcpAction.startsWith("add:")}>
              ${this.mcpAction.startsWith("add:") ? "Adding..." : "Add Server"}
            </button>
            <button class="btn secondary" @click=${() => this.cancelMcpAdd()}>Cancel</button>
          </div>
        </section>
      ` : ""}

      <!-- Search MCP Registry -->
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <input
          class="plugin-search"
          style="flex:1;"
          placeholder="Search MCP servers (e.g. web search, database, github)..."
          .value=${this.mcpMarketplaceQuery}
          @input=${(e: Event) => { this.mcpMarketplaceQuery = (e.target as HTMLInputElement).value; }}
          @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter") void this.searchMcpMarketplace();
      }}
        />
        <button class="btn" @click=${() => this.searchMcpMarketplace()} ?disabled=${this.mcpMarketplaceLoading}>
          ${this.mcpMarketplaceLoading ? "Searching..." : "Search"}
        </button>
      </div>

      <!-- Search Results -->
      ${this.mcpMarketplaceResults.length > 0 ? html`
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Registry results (${this.mcpMarketplaceResults.length})</div>
        <div class="plugin-list" style="margin-bottom:20px;">
          ${this.mcpMarketplaceResults.map((result) => {
        const shortName = result.name.includes("/") ? result.name.split("/").pop()! : result.name;
        const isConfigured = configuredNames.has(shortName);
        const actionKey = `add:${result.name}`;
        const isBusy = this.mcpAction === actionKey;
        return html`
              <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                  <div style="min-width:0;flex:1;">
                    <div class="plugin-name">${result.title}</div>
                    <div class="plugin-desc">${result.description}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;">
                      <span>v${result.version}</span>
                      <span>${result.connectionType === "remote" ? "Remote (HTTP)" : "Local (stdio)"}</span>
                      ${result.npmPackage ? html`<span>npm: ${result.npmPackage}</span>` : ""}
                      ${result.repositoryUrl ? html`<a href="${result.repositoryUrl}" target="_blank" rel="noopener" style="color:var(--accent);">Repository</a>` : ""}
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                    <span class="plugin-status ${isConfigured ? "enabled" : ""}">${isConfigured ? "configured" : "available"}</span>
                    ${!isConfigured ? html`
                      <button class="btn" ?disabled=${isBusy} @click=${() => this.addMcpFromMarketplace(result)}>
                        ${isBusy ? "Adding..." : "Add"}
                      </button>
                    ` : ""}
                  </div>
                </div>
              </div>
            `;
      })}
        </div>
      ` : this.mcpMarketplaceQuery && !this.mcpMarketplaceLoading ? html`
        <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">No results found.</div>
      ` : ""}

      <!-- Manual Configuration -->
      <section style="border:1px solid var(--border);padding:12px;margin-bottom:16px;">
        <div style="font-weight:bold;font-size:13px;margin-bottom:10px;">Add Custom MCP Server</div>

        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <input
            class="plugin-search"
            style="flex:1;min-width:160px;"
            placeholder="Server name"
            .value=${this.mcpManualName}
            @input=${(e: Event) => { this.mcpManualName = (e.target as HTMLInputElement).value; }}
          />
          <select
            style="padding:4px 8px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:12px;border-radius:4px;"
            .value=${this.mcpManualType}
            @change=${(e: Event) => { this.mcpManualType = (e.target as HTMLSelectElement).value as "stdio" | "http" | "streamable-http" | "sse"; }}
          >
            <option value="stdio">stdio</option>
            <option value="streamable-http">streamable-http</option>
            <option value="sse">sse</option>
            <option value="http">http</option>
          </select>
        </div>

        ${this.mcpManualType === "stdio" ? html`
          <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <input
              class="plugin-search"
              style="flex:1;min-width:160px;"
              placeholder="Command (e.g. npx, node, docker)"
              .value=${this.mcpManualCommand}
              @input=${(e: Event) => { this.mcpManualCommand = (e.target as HTMLInputElement).value; }}
            />
            <input
              class="plugin-search"
              style="flex:2;min-width:200px;"
              placeholder="Arguments (space-separated, or one per line for paths with spaces)"
              .value=${this.mcpManualArgs}
              @input=${(e: Event) => { this.mcpManualArgs = (e.target as HTMLInputElement).value; }}
            />
          </div>
        ` : html`
          <div style="margin-bottom:8px;">
            <input
              class="plugin-search"
              style="width:100%;"
              placeholder="Server URL (e.g. https://mcp.example.com/sse)"
              .value=${this.mcpManualUrl}
              @input=${(e: Event) => { this.mcpManualUrl = (e.target as HTMLInputElement).value; }}
            />
          </div>
        `}

        <!-- Environment Variables -->
        <div style="margin-bottom:8px;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Environment Variables (optional)</div>
          ${this.mcpManualEnvPairs.map((pair, i) => html`
            <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center;">
              <input
                class="plugin-search"
                style="flex:1;min-width:100px;font-size:11px;"
                placeholder="KEY"
                .value=${pair.key}
                @input=${(e: Event) => {
        const updated = [...this.mcpManualEnvPairs];
        updated[i] = { ...updated[i], key: (e.target as HTMLInputElement).value };
        this.mcpManualEnvPairs = updated;
      }}
              />
              <input
                class="plugin-search"
                style="flex:2;min-width:140px;font-size:11px;"
                placeholder="value"
                .value=${pair.value}
                @input=${(e: Event) => {
        const updated = [...this.mcpManualEnvPairs];
        updated[i] = { ...updated[i], value: (e.target as HTMLInputElement).value };
        this.mcpManualEnvPairs = updated;
      }}
              />
              <button
                class="btn secondary"
                style="padding:2px 8px;font-size:11px;"
                @click=${() => {
        this.mcpManualEnvPairs = this.mcpManualEnvPairs.filter((_, idx) => idx !== i);
      }}
              >Remove</button>
            </div>
          `)}
          <button
            class="btn secondary"
            style="font-size:11px;padding:2px 10px;"
            @click=${() => {
        this.mcpManualEnvPairs = [...this.mcpManualEnvPairs, { key: "", value: "" }];
      }}
          >+ Add Variable</button>
        </div>

        <button
          class="btn"
          style="font-size:12px;padding:4px 16px;"
          @click=${() => this.addMcpManual()}
          ?disabled=${this.mcpAction.startsWith("add-manual")}
        >${this.mcpAction.startsWith("add-manual") ? "Adding..." : "Add Server"}</button>
      </section>

      <!-- Configured Servers -->
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
        Configured servers (${configuredEntries.length})
        ${this.mcpConfigLoading ? " — loading..." : ""}
      </div>
      ${configuredEntries.length === 0
        ? html`<div class="empty-state">${this.mcpConfigLoading ? "Loading..." : "No MCP servers configured."}</div>`
        : html`
          <div class="plugin-list">
            ${configuredEntries.map(([name, cfg]) => {
        const isBusy = this.mcpAction === `remove:${name}`;
        const typeLabel = cfg.type || "unknown";
        const detail = cfg.type === "stdio"
          ? `${cfg.command || "?"}${cfg.args?.length ? " " + cfg.args.join(" ") : ""}`
          : cfg.url || "no URL";
        const envKeys = cfg.env ? Object.keys(cfg.env) : [];
        const serverStatus = this.mcpServerStatuses.find((s) => s.name === name);
        const statusColor = serverStatus?.status === "connected" ? "var(--ok)"
          : serverStatus?.status === "connecting" ? "var(--warn)"
            : "var(--muted)";
        const statusLabel = serverStatus?.status || "unknown";
        return html`
                <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                    <div style="min-width:0;flex:1;">
                      <div class="plugin-name">${name}</div>
                      <div class="plugin-desc" style="font-family:var(--mono);font-size:11px;">${detail}</div>
                      <div style="font-size:11px;color:var(--muted);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <span style="border:1px solid var(--border);padding:2px 6px;background:var(--bg-muted);">${typeLabel}</span>
                        <span style="display:inline-flex;align-items:center;gap:4px;">
                          <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
                          ${statusLabel}
                        </span>
                        ${serverStatus?.status === "connected" && (serverStatus.toolCount > 0 || serverStatus.resourceCount > 0) ? html`
                          <span>${serverStatus.toolCount} tools, ${serverStatus.resourceCount} resources</span>
                        ` : ""}
                        ${serverStatus?.error ? html`
                          <span style="color:var(--danger, #e74c3c);">${serverStatus.error}</span>
                        ` : ""}
                        ${envKeys.length > 0 ? html`<span>env: ${envKeys.join(", ")}</span>` : ""}
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                      <span class="plugin-status ${serverStatus?.status === "connected" ? "enabled" : ""}">${statusLabel}</span>
                      <button class="btn" ?disabled=${isBusy} @click=${() => this.removeMcpServer(name)}>
                        ${isBusy ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  </div>
                </div>
              `;
      })}
          </div>
        `}
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

    const searchLower = this.pluginSearch.toLowerCase();
    const filtered = this.plugins.filter((p) => {
      const matchesCategory = this.pluginFilter === "all" || p.category === this.pluginFilter;
      const matchesSearch = !searchLower
        || p.name.toLowerCase().includes(searchLower)
        || (p.description ?? "").toLowerCase().includes(searchLower)
        || p.id.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });

    const toggleSettings = (pluginId: string) => {
      const next = new Set(this.pluginSettingsOpen);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      this.pluginSettingsOpen = next;
    };

    return html`
      <h2>Plugins</h2>
      <p class="subtitle">Manage plugins and integrations. ${this.plugins.length} plugins discovered.</p>
      <div style="margin-bottom:10px;">
        <button class="btn" @click=${() => this.setTab("marketplace")} style="font-size:12px;padding:4px 12px;">
          Open Marketplace
        </button>
      </div>

      <input
        class="plugin-search"
        type="text"
        placeholder="Search plugins by name or description..."
        .value=${this.pluginSearch}
        @input=${(e: Event) => { this.pluginSearch = (e.target as HTMLInputElement).value; }}
      />

      <div class="plugin-filters" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
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
        ? html`<div class="empty-state">${this.pluginSearch ? "No plugins match your search." : "No plugins in this category."}</div>`
        : html`
            <div class="plugin-list">
              ${filtered.map((p) => {
          const hasParams = p.parameters && p.parameters.length > 0;
          const allParamsSet = hasParams ? p.parameters.every((param) => param.isSet) : true;
          const settingsOpen = this.pluginSettingsOpen.has(p.id);
          const setCount = hasParams ? p.parameters.filter((param) => param.isSet).length : 0;
          const totalCount = hasParams ? p.parameters.length : 0;

          return html`
                  <div class="plugin-item" data-plugin-id=${p.id} style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <div class="plugin-name">${p.name}</div>
                          <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--muted);">${p.category === "ai-provider" ? "ai provider"
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
                            @change=${(e: Event) => this.handlePluginToggle(
              p.id,
              (e.target as HTMLInputElement).checked,
              e.target as HTMLInputElement,
            )}
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

                    ${hasParams
              ? html`
                          <div
                            class="plugin-settings-toggle"
                            @click=${() => toggleSettings(p.id)}
                          >
                            <span class="settings-chevron ${settingsOpen ? "open" : ""}">&#9654;</span>
                            <span class="plugin-settings-dot ${allParamsSet ? "all-set" : "missing"}"></span>
                            <span>Settings</span>
                            <span style="color:var(--muted);font-weight:400;">(${setCount}/${totalCount} configured)</span>
                          </div>

                          ${settingsOpen
                  ? html`
                                <div class="plugin-settings-body">
                                  ${p.parameters.map(
                    (param) => html`
                                      <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
                                        <div style="display:flex;align-items:center;gap:6px;">
                                          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${param.isSet ? "#2ecc71" : (param.required ? "#e74c3c" : "var(--muted)")};flex-shrink:0;"></span>
                                          <code style="font-size:11px;font-weight:600;color:var(--text-strong);">${param.key}</code>
                                          ${param.required ? html`<span style="font-size:10px;color:#e74c3c;">required</span>` : ""}
                                          ${param.isSet ? html`<span style="font-size:10px;color:#2ecc71;">set</span>` : ""}
                                        </div>
                                        <div style="color:var(--muted);font-size:11px;padding-left:12px;">${param.description}${param.default ? ` (default: ${param.default})` : ""}</div>
                                        <input
                                          type="${param.sensitive ? "password" : "text"}"
                                          .value=${param.isSet && !param.sensitive ? (param.currentValue ?? "") : (param.isSet ? "" : (param.default ?? ""))}
                                          placeholder="${param.sensitive && param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}"
                                          data-plugin-param="${p.id}:${param.key}"
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
                        `
              : ""
            }

                    ${p.enabled && p.validationErrors && p.validationErrors.length > 0
              ? html`
                          <div style="margin-top:8px;padding:8px 10px;border:1px solid #e74c3c;background:rgba(231,76,60,0.06);font-size:12px;">
                            ${p.validationErrors.map(
                (err) => html`<div style="color:#e74c3c;">${err.field}: ${err.message}</div>`,
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
                `;
        })}
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

    if (Object.keys(config).length === 0) {
      this.setActionNotice("No config changes to save.", "info");
      return;
    }

    try {
      await client.updatePlugin(pluginId, { config });
      // Reload plugins to get updated validation and current values
      await this.loadPlugins();
      this.setActionNotice("Plugin settings saved.", "success");
    } catch (err) {
      console.error("Failed to save plugin config:", err);
      this.setActionNotice(`Failed to save plugin settings: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    }
  }

  private async handlePluginToggle(
    pluginId: string,
    enabled: boolean,
    inputEl?: HTMLInputElement,
  ): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);

    // Block enabling if there are validation errors (missing required params)
    if (enabled && plugin?.validationErrors && plugin.validationErrors.length > 0) {
      // Revert the checkbox
      if (inputEl) inputEl.checked = false;
      this.requestUpdate();
      const first = plugin.validationErrors[0];
      this.setActionNotice(`Cannot enable ${plugin.name}: ${first?.message ?? "missing required settings"}`, "error", 3800);
      return;
    }

    try {
      await client.updatePlugin(pluginId, { enabled });
      if (plugin) {
        plugin.enabled = enabled;
        this.requestUpdate();
        this.setActionNotice(`${plugin.name} ${enabled ? "enabled" : "disabled"}.`, "success");
      }
    } catch (err) {
      console.error("Failed to toggle plugin:", err);
      this.setActionNotice(`Failed to update plugin: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    }
  }

  private renderSkills() {
    const installedIds = new Set(this.skillsMarketplaceInstalled.map((skill) => skill.id));

    return html`
      <h2>Skills</h2>
      <p class="subtitle">View loaded skills and install more from GitHub/Skills marketplace.</p>

      <!-- Skills Marketplace API Key Configuration - only show when not configured -->
      ${!this.skillsMarketplaceApiKeySet ? html`
        <section style="border:1px solid var(--border);padding:12px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
            <div>
              <div style="font-weight:bold;font-size:13px;">Skills Marketplace API Key</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">
                Required for searching the <a href="https://skillsmp.com" target="_blank" rel="noopener" style="color:var(--accent);">skillsmp.com</a> marketplace.
                <a href="https://skillsmp.com/docs/api" target="_blank" rel="noopener" style="color:var(--accent);margin-left:4px;">Get API key →</a>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input
              type="password"
              class="plugin-search"
              style="flex:1;min-width:200px;font-family:var(--mono);font-size:12px;"
              placeholder="sk_live_skillsmp_..." 
              .value=${this.skillsMarketplaceApiKeyInput}
              @input=${(e: Event) => { this.skillsMarketplaceApiKeyInput = (e.target as HTMLInputElement).value; }}
            />
            <button
              class="btn"
              style="font-size:12px;padding:4px 12px;"
              @click=${this.handleSaveSkillsMarketplaceApiKey}
              ?disabled=${this.skillsMarketplaceApiKeySaving || !this.skillsMarketplaceApiKeyInput.trim()}
            >${this.skillsMarketplaceApiKeySaving ? "Saving..." : "Save Key"}</button>
          </div>
        </section>
      ` : ""}

      <section style="border:1px solid var(--border);padding:12px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">
          <div style="font-size:12px;color:var(--muted);">Skills marketplace</div>
          <button class="btn" data-action="refresh-skills" @click=${this.refreshSkills} style="font-size:12px;padding:4px 12px;">Refresh Loaded Skills</button>
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
          <input
            class="plugin-search"
            style="flex:1;min-width:220px;"
            placeholder="Search skills by keyword..."
            .value=${this.skillsMarketplaceQuery}
            @input=${(e: Event) => { this.skillsMarketplaceQuery = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter") void this.searchSkillsMarketplace();
      }}
          />
          <button class="btn" @click=${this.searchSkillsMarketplace} ?disabled=${this.skillsMarketplaceLoading}>
            ${this.skillsMarketplaceLoading ? "Searching..." : "Search"}
          </button>
        </div>

        ${this.skillsMarketplaceError
        ? html`<div style="margin-top:8px;padding:8px 10px;border:1px solid var(--danger, #e74c3c);font-size:12px;color:var(--danger, #e74c3c);">
              ${this.skillsMarketplaceError}
              ${this.skillsMarketplaceError.includes("SKILLSMP_API_KEY")
            ? html`<div style="margin-top:4px;color:var(--muted);">Set <code>SKILLSMP_API_KEY</code> to enable search, or install directly via GitHub URL below.</div>`
            : ""}
            </div>`
        : ""}

        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
          <input
            class="plugin-search"
            style="flex:1;min-width:220px;"
            placeholder="Install via GitHub URL (repo or /tree/... path)"
            .value=${this.skillsMarketplaceManualGithubUrl}
            @input=${(e: Event) => { this.skillsMarketplaceManualGithubUrl = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter") void this.installSkillFromGithubUrl();
      }}
          />
          <button
            class="btn"
            @click=${this.installSkillFromGithubUrl}
            ?disabled=${this.skillsMarketplaceAction === "install:manual" || !this.skillsMarketplaceManualGithubUrl.trim()}
          >
            ${this.skillsMarketplaceAction === "install:manual" ? "Installing..." : "Install URL"}
          </button>
        </div>

        ${this.skillsMarketplaceInstalled.length > 0 ? html`
          <div style="margin-top:10px;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Installed from marketplace</div>
            <div class="plugin-list">
              ${this.skillsMarketplaceInstalled.map((installed) => {
        const busy = this.skillsMarketplaceAction === `uninstall:${installed.id}`;
        return html`
                  <div class="plugin-item" style="justify-content:space-between;gap:8px;" data-installed-skill-id=${installed.id}>
                    <div style="min-width:0;flex:1;">
                      <div class="plugin-name">${installed.name}</div>
                      <div class="plugin-desc">${installed.repository}${installed.path ? ` • ${installed.path}` : ""}</div>
                    </div>
                    <button class="btn" ?disabled=${busy} @click=${() => this.uninstallMarketplaceSkill(installed.id, installed.name)}>
                      ${busy ? "Uninstalling..." : "Uninstall"}
                    </button>
                  </div>
                `;
      })}
            </div>
          </div>
        ` : ""}

        ${this.skillsMarketplaceResults.length === 0
        ? html`<div style="font-size:12px;color:var(--muted);margin-top:10px;">No marketplace results yet.</div>`
        : html`
              <div class="plugin-list" style="margin-top:10px;">
                ${this.skillsMarketplaceResults.map((item) => {
          const isInstalled = installedIds.has(item.id);
          const busyKey = `${isInstalled ? "uninstall" : "install"}:${item.id}`;
          const busy = this.skillsMarketplaceAction === busyKey;
          return html`
                    <div class="plugin-item" style="flex-direction:column;align-items:stretch;" data-skill-marketplace-id=${item.id}>
                      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
                        <div style="min-width:0;flex:1;">
                          <div class="plugin-name">${item.name}</div>
                          <div class="plugin-desc">${item.description || "No description provided."}</div>
                          <div style="font-size:11px;color:var(--muted);margin-top:6px;">
                            ${item.repository}${item.path ? ` • path: ${item.path}` : ""}
                            ${item.score != null ? ` • score: ${item.score.toFixed(2)}` : ""}
                          </div>
                          ${item.tags.length > 0 ? html`<div style="font-size:11px;color:var(--muted);margin-top:4px;">Tags: ${item.tags.slice(0, 6).join(", ")}</div>` : ""}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
                          <span class="plugin-status ${isInstalled ? "enabled" : ""}">${isInstalled ? "installed" : "available"}</span>
                          ${isInstalled
              ? html`<button class="btn" ?disabled=${busy} @click=${() => this.uninstallMarketplaceSkill(item.id, item.name)}>${busy ? "Uninstalling..." : "Uninstall"}</button>`
              : html`<button class="btn" ?disabled=${busy} @click=${() => this.installSkillFromMarketplace(item)}>${busy ? "Installing..." : "Install"}</button>`
            }
                        </div>
                      </div>
                    </div>
                  `;
        })}
              </div>
            `}
      </section>

      <p class="subtitle">${this.skills.length > 0 ? `${this.skills.length} loaded skills.` : "No skills loaded yet."}</p>
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
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="plugin-status ${s.enabled ? "enabled" : ""}">${s.enabled ? "active" : "inactive"}</span>
                      <label class="switch">
                        <input
                          type="checkbox"
                          data-skill-toggle=${s.id}
                          .checked=${s.enabled}
                          ?disabled=${this.skillToggleAction === s.id}
                          @change=${(e: Event) => this.handleSkillToggle(s.id, (e.target as HTMLInputElement).checked)}
                        />
                        <span class="slider"></span>
                      </label>
                    </div>
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

  // ═══════════════════════════════════════════════════════════════════════
  // Inventory
  // ═══════════════════════════════════════════════════════════════════════

  private async loadInventory(): Promise<void> {
    // Always load config first to know key status
    await this.loadWalletConfig();
    if (!this.walletConfig?.alchemyKeySet && !this.walletConfig?.heliusKeySet) return;
    await this.loadBalances();
  }

  private async loadWalletConfig(): Promise<void> {
    try {
      this.walletConfig = await client.getWalletConfig();
      this.walletError = null;
    } catch (err) {
      this.walletError = `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`;
    }
  }

  private async loadBalances(): Promise<void> {
    this.walletLoading = true;
    this.walletError = null;
    try {
      this.walletBalances = await client.getWalletBalances();
    } catch (err) {
      this.walletError = `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletLoading = false;
  }

  private async loadNfts(): Promise<void> {
    this.walletNftsLoading = true;
    this.walletError = null;
    try {
      this.walletNfts = await client.getWalletNfts();
    } catch (err) {
      this.walletError = `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletNftsLoading = false;
  }

  private async handleWalletApiKeySave(): Promise<void> {
    this.walletApiKeySaving = true;
    this.walletError = null;
    const inputs = this.shadowRoot?.querySelectorAll<HTMLInputElement>("[data-wallet-config]") ?? [];
    const config: Record<string, string> = {};
    for (const input of inputs) {
      const key = input.dataset.walletConfig;
      if (key && input.value.trim()) {
        config[key] = input.value.trim();
      }
    }
    if (Object.keys(config).length > 0) {
      try {
        await client.updateWalletConfig(config);
        await this.loadWalletConfig();
        // Clear inputs after save
        for (const input of inputs) input.value = "";
        // Reload balances now that keys are set
        await this.loadBalances();
      } catch (err) {
        this.walletError = `Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`;
      }
    }
    this.walletApiKeySaving = false;
  }

  private renderInventory() {
    const cfg = this.walletConfig;
    const needsSetup = !cfg || (!cfg.alchemyKeySet && !cfg.heliusKeySet);

    return html`
      <h2>Inventory</h2>
      <p class="subtitle">Tokens and NFTs across all your wallets.</p>

      ${this.walletError ? html`
        <div style="margin-top:12px;padding:10px 14px;border:1px solid var(--danger, #e74c3c);background:rgba(231,76,60,0.06);font-size:12px;color:var(--danger, #e74c3c);">
          ${this.walletError}
        </div>
      ` : ""}

      ${needsSetup ? this.renderInventorySetup() : this.renderInventoryContent()}
    `;
  }

  private renderInventorySetup() {
    const cfg = this.walletConfig;
    return html`
      <div style="margin-top:16px;">
        <p style="font-size:13px;line-height:1.6;">
          To view your balances, you need API keys from blockchain data providers.
          These are free to create and take about a minute to set up.
        </p>

        <!-- Alchemy setup -->
        <div class="setup-card">
          <h3>Alchemy ${cfg?.alchemyKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}</h3>
          <p>Alchemy provides EVM chain data (Ethereum, Base, Arbitrum, Optimism, Polygon).</p>
          <ol>
            <li>Go to <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener">dashboard.alchemy.com</a> and create a free account</li>
            <li>In your dashboard, click <strong>"Create new app"</strong></li>
            <li>Copy the <strong>API Key</strong> from your app settings</li>
            <li>Paste it below</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="ALCHEMY_API_KEY"
                   placeholder="${cfg?.alchemyKeySet ? "Already set — leave blank to keep" : "Paste your Alchemy API key"}" />
          </div>
        </div>

        <!-- Helius setup -->
        <div class="setup-card">
          <h3>Helius ${cfg?.heliusKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}</h3>
          <p>Helius provides Solana chain data (tokens, NFTs, enhanced RPC).</p>
          <ol>
            <li>Go to <a href="https://dev.helius.xyz/dashboard/app" target="_blank" rel="noopener">dev.helius.xyz</a> and create a free account</li>
            <li>You'll get an API key on your dashboard immediately</li>
            <li>Copy the <strong>API Key</strong></li>
            <li>Paste it below</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="HELIUS_API_KEY"
                   placeholder="${cfg?.heliusKeySet ? "Already set — leave blank to keep" : "Paste your Helius API key"}" />
          </div>
        </div>

        <!-- Birdeye setup (optional) -->
        <div class="setup-card">
          <h3>Birdeye <span style="color:var(--muted);font-size:11px;font-weight:normal;margin-left:8px;">optional</span>
            ${cfg?.birdeyeKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}
          </h3>
          <p>Birdeye provides USD price data for Solana tokens. Optional but recommended.</p>
          <ol>
            <li>Go to <a href="https://birdeye.so/user/api-management" target="_blank" rel="noopener">birdeye.so</a> and create a free account</li>
            <li>Navigate to the <strong>API</strong> section in your profile</li>
            <li>Copy your API key</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="BIRDEYE_API_KEY"
                   placeholder="${cfg?.birdeyeKeySet ? "Already set — leave blank to keep" : "Paste your Birdeye API key (optional)"}" />
          </div>
        </div>

        <div style="margin-top:16px;">
          <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                  ?disabled=${this.walletApiKeySaving}
                  style="padding:8px 24px;">
            ${this.walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>
    `;
  }

  private renderInventoryContent() {
    return html`
      <div class="inv-toolbar">
        <button class="inventory-subtab ${this.inventoryView === "tokens" ? "active" : ""}"
                @click=${() => { this.inventoryView = "tokens"; if (!this.walletBalances) this.loadBalances(); }}>
          Tokens
        </button>
        <button class="inventory-subtab ${this.inventoryView === "nfts" ? "active" : ""}"
                @click=${() => { this.inventoryView = "nfts"; if (!this.walletNfts) this.loadNfts(); }}>
          NFTs
        </button>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
          ${this.inventoryView === "tokens" ? html`
            <span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Sort:</span>
            <button class="sort-btn ${this.inventorySort === "value" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "value"; }}>Value</button>
            <button class="sort-btn ${this.inventorySort === "chain" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "chain"; }}>Chain</button>
            <button class="sort-btn ${this.inventorySort === "symbol" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "symbol"; }}>Name</button>
          ` : ""}
          <button class="btn" style="font-size:11px;padding:3px 10px;"
                  @click=${() => this.inventoryView === "tokens" ? this.loadBalances() : this.loadNfts()}>
            Refresh
          </button>
        </div>
      </div>

      ${this.inventoryView === "tokens" ? this.renderTokensView() : this.renderNftsView()}
    `;
  }

  /** Map chain name to short code for the icon badge. */
  private chainIcon(chain: string): { code: string; cls: string } {
    const c = chain.toLowerCase();
    if (c === "ethereum" || c === "mainnet") return { code: "E", cls: "eth" };
    if (c === "base") return { code: "B", cls: "base" };
    if (c === "arbitrum") return { code: "A", cls: "arb" };
    if (c === "optimism") return { code: "O", cls: "op" };
    if (c === "polygon") return { code: "P", cls: "pol" };
    if (c === "solana") return { code: "S", cls: "sol" };
    return { code: chain.charAt(0).toUpperCase(), cls: "eth" };
  }

  /**
   * Flatten all balances from all chains into a single sortable list.
   */
  private flattenBalances(): Array<{
    chain: string;
    symbol: string;
    name: string;
    balance: string;
    valueUsd: number;
    balanceRaw: number;
  }> {
    const rows: Array<{
      chain: string;
      symbol: string;
      name: string;
      balance: string;
      valueUsd: number;
      balanceRaw: number;
    }> = [];

    const b = this.walletBalances;
    if (!b) return rows;

    if (b.evm) {
      for (const chain of b.evm.chains) {
        // Native token
        rows.push({
          chain: chain.chain,
          symbol: chain.nativeSymbol,
          name: `${chain.chain} native`,
          balance: chain.nativeBalance,
          valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0,
          balanceRaw: Number.parseFloat(chain.nativeBalance) || 0,
        });
        // ERC-20s
        for (const t of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: t.symbol,
            name: t.name,
            balance: t.balance,
            valueUsd: Number.parseFloat(t.valueUsd) || 0,
            balanceRaw: Number.parseFloat(t.balance) || 0,
          });
        }
      }
    }

    if (b.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana native",
        balance: b.solana.solBalance,
        valueUsd: Number.parseFloat(b.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(b.solana.solBalance) || 0,
      });
      for (const t of b.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
        });
      }
    }

    return rows;
  }

  private sortedBalances() {
    const rows = this.flattenBalances();
    const s = this.inventorySort;
    if (s === "value") {
      rows.sort((a, b) => b.valueUsd - a.valueUsd || b.balanceRaw - a.balanceRaw);
    } else if (s === "chain") {
      rows.sort((a, b) => a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol));
    } else if (s === "symbol") {
      rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain));
    }
    return rows;
  }

  private renderTokensView() {
    if (this.walletLoading) {
      return html`<div class="empty-state" style="margin-top:24px;">Loading balances...</div>`;
    }
    if (!this.walletBalances) {
      return html`<div class="empty-state" style="margin-top:24px;">No balance data yet. Click Refresh.</div>`;
    }

    const rows = this.sortedBalances();

    if (rows.length === 0) {
      return html`
        <div class="empty-state" style="margin-top:24px;">
          No wallet data available. Make sure API keys are configured in
          <a href="/config" @click=${(e: Event) => { e.preventDefault(); this.setTab("config"); }}>Config</a>.
        </div>
      `;
    }

    return html`
      <div class="token-table-wrap">
        <table class="token-table">
          <thead>
            <tr>
              <th style="width:32px;"></th>
              <th class=${this.inventorySort === "symbol" ? "sorted" : ""}
                  @click=${() => { this.inventorySort = "symbol"; }}>Token</th>
              <th class=${this.inventorySort === "chain" ? "sorted" : ""}
                  @click=${() => { this.inventorySort = "chain"; }}>Chain</th>
              <th class="r ${this.inventorySort === "value" ? "sorted" : ""}"
                  @click=${() => { this.inventorySort = "value"; }}>Balance</th>
              <th class="r ${this.inventorySort === "value" ? "sorted" : ""}"
                  @click=${() => { this.inventorySort = "value"; }}>Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
      const icon = this.chainIcon(row.chain);
      return html`
                <tr>
                  <td><span class="chain-icon ${icon.cls}">${icon.code}</span></td>
                  <td>
                    <span class="td-symbol">${row.symbol}</span>
                    <span class="td-name" style="margin-left:8px;">${row.name}</span>
                  </td>
                  <td style="font-size:11px;color:var(--muted);">${row.chain}</td>
                  <td class="td-balance">${this.formatBalance(row.balance)}</td>
                  <td class="td-value">${row.valueUsd > 0 ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</td>
                </tr>
              `;
    })}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderNftsView() {
    if (this.walletNftsLoading) {
      return html`<div class="empty-state" style="margin-top:24px;">Loading NFTs...</div>`;
    }
    if (!this.walletNfts) {
      return html`<div class="empty-state" style="margin-top:24px;">No NFT data yet. Click Refresh.</div>`;
    }

    const n = this.walletNfts;
    // Flatten all NFTs into a single list with chain info
    type NftItem = { chain: string; name: string; imageUrl: string; collectionName: string };
    const allNfts: NftItem[] = [];

    for (const chainData of n.evm) {
      for (const nft of chainData.nfts) {
        allNfts.push({ chain: chainData.chain, name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName || nft.tokenType });
      }
    }
    if (n.solana) {
      for (const nft of n.solana.nfts) {
        allNfts.push({ chain: "Solana", name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName });
      }
    }

    if (allNfts.length === 0) {
      return html`<div class="empty-state" style="margin-top:24px;">No NFTs found across your wallets.</div>`;
    }

    return html`
      <div class="nft-grid">
        ${allNfts.map((nft) => {
      const icon = this.chainIcon(nft.chain);
      return html`
            <div class="nft-card">
              ${nft.imageUrl
          ? html`<img src="${nft.imageUrl}" alt="${nft.name}" loading="lazy" />`
          : html`<div style="width:100%;height:150px;background:var(--bg-muted);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);">No image</div>`
        }
              <div class="nft-info">
                <div class="nft-name">${nft.name}</div>
                <div class="nft-collection">${nft.collectionName}</div>
                <div class="nft-chain">
                  <span class="chain-icon ${icon.cls}" style="width:12px;height:12px;line-height:12px;font-size:7px;">${icon.code}</span>
                  ${nft.chain}
                </div>
              </div>
            </div>
          `;
    })}
      </div>
    `;
  }

  private formatBalance(balance: string): string {
    const num = Number.parseFloat(balance);
    if (Number.isNaN(num)) return balance;
    if (num === 0) return "0";
    if (num < 0.0001) return "<0.0001";
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Config
  // ═══════════════════════════════════════════════════════════════════════

  private renderConfig() {
    const ext = this.extensionStatus;
    const relayOk = ext?.relayReachable === true;

    return html`
      <h2>Settings</h2>
      <p class="subtitle">Agent settings and configuration.</p>

      <!-- Native Integrations -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Native Integrations</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Tray menu, global hotkey, and actionable notifications.
            </div>
          </div>
          <span class="status-pill ${this.nativeDesktopAvailable ? "running" : "stopped"}">
            ${this.nativeDesktopAvailable ? "desktop bridge ready" : "web mode"}
          </span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" @click=${this.configureNativeTrayMenu} ?disabled=${!this.nativeDesktopAvailable}>Configure Tray Menu</button>
          <button class="btn" @click=${this.sendNativeNotification} ?disabled=${!this.nativeDesktopAvailable}>Send Test Notification</button>
          <button class="btn" @click=${() => this.executeCommand("native-tray")} ?disabled=${!this.nativeDesktopAvailable}>Reapply Native Actions</button>
        </div>

        <div style="margin-top:10px;font-size:12px;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap;">
          <span>Tray: ${this.nativeTrayEnabled ? "configured" : "not configured"}</span>
          <span>Global shortcut: ${this.nativeShortcutEnabled ? "Cmd/Ctrl+K active" : "inactive"}</span>
        </div>

        ${this.nativeEvents.length > 0
        ? html`
              <div style="margin-top:10px;border:1px solid var(--border);padding:8px;background:var(--bg-muted);font-size:11px;font-family:var(--mono);">
                ${this.nativeEvents.map((line) => html`<div>${line}</div>`)}
              </div>
            `
        : ""}
      </div>

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

      <!-- Wallet API Keys Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Wallet API Keys</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Configure API keys for blockchain data providers (balance and NFT fetching).
            </div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">ALCHEMY_API_KEY</code>
              ${this.walletConfig?.alchemyKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">EVM chain data — <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="ALCHEMY_API_KEY"
                   placeholder="${this.walletConfig?.alchemyKeySet ? "Already set — leave blank to keep" : "Enter Alchemy API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">HELIUS_API_KEY</code>
              ${this.walletConfig?.heliusKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">Solana chain data — <a href="https://dev.helius.xyz/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="HELIUS_API_KEY"
                   placeholder="${this.walletConfig?.heliusKeySet ? "Already set — leave blank to keep" : "Enter Helius API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">BIRDEYE_API_KEY</code>
              <span style="font-size:10px;color:var(--muted);">optional</span>
              ${this.walletConfig?.birdeyeKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : ""}
            </div>
            <div style="color:var(--muted);font-size:11px;">Solana price data — <a href="https://birdeye.so/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="BIRDEYE_API_KEY"
                   placeholder="${this.walletConfig?.birdeyeKeySet ? "Already set — leave blank to keep" : "Enter Birdeye API key (optional)"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
          </div>
          <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                  ?disabled=${this.walletApiKeySaving}
                  style="align-self:flex-end;font-size:11px;padding:4px 14px;margin-top:4px;">
            ${this.walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>

      <div style="margin-top:48px;padding-top:24px;border-top:1px solid var(--border);">
        <h2 style="color:var(--danger, #e74c3c);">Danger Zone</h2>
        <p class="subtitle">Irreversible actions. Proceed with caution.</p>

        <!-- Export Private Keys -->
        <div style="border:1px solid var(--danger, #e74c3c);padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:bold;font-size:14px;">Export Private Keys</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">Reveal your EVM and Solana private keys. Never share these with anyone.</div>
            </div>
            <button
              class="btn"
              style="background:var(--danger, #e74c3c);border-color:var(--danger, #e74c3c);white-space:nowrap;margin-top:0;"
              @click=${() => this.handleExportKeys()}
            >${this.walletExportVisible ? "Hide Keys" : "Export Keys"}</button>
          </div>
          ${this.walletExportVisible && this.walletExportData ? html`
            <div class="key-export-box">
              ${this.walletExportData.evm ? html`
                <div style="margin-bottom:8px;">
                  <strong>EVM Private Key</strong> <span style="color:var(--muted);">(${this.walletExportData.evm.address})</span><br/>
                  <span>${this.walletExportData.evm.privateKey}</span>
                  <button class="copy-btn" style="margin-left:8px;" @click=${() => this.copyToClipboard(this.walletExportData!.evm!.privateKey)}>copy</button>
                </div>
              ` : ""}
              ${this.walletExportData.solana ? html`
                <div>
                  <strong>Solana Private Key</strong> <span style="color:var(--muted);">(${this.walletExportData.solana.address})</span><br/>
                  <span>${this.walletExportData.solana.privateKey}</span>
                  <button class="copy-btn" style="margin-left:8px;" @click=${() => this.copyToClipboard(this.walletExportData!.solana!.privateKey)}>copy</button>
                </div>
              ` : ""}
              ${!this.walletExportData.evm && !this.walletExportData.solana ? html`
                <div style="color:var(--muted);">No wallet keys configured.</div>
              ` : ""}
            </div>
          ` : ""}
        </div>

        <!-- Reset Agent -->
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
          ${this.onboardingStep === 4 ? this.renderOnboardingSkillsMarketplace() : ""}
          ${this.onboardingStep === 5 ? this.renderOnboardingChannels() : ""}
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

  private renderOnboardingSkillsMarketplace() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">want to connect to the Skills Marketplace?</div>
      <p style="font-size: 13px; color: var(--muted-strong); margin-bottom: 16px;">
        Add your <a href="https://skillsmp.com" target="_blank" rel="noopener" style="color: var(--accent);">skillsmp.com</a> API key to browse and install skills.
      </p>

      <div style="text-align: left; margin-bottom: 16px;">
        <label style="font-size: 13px; color: var(--muted-strong);">Skills Marketplace API Key</label>
        <input
          class="onboarding-input"
          type="password"
          placeholder="Paste your skillsmp.com API key"
          .value=${this.onboardingSkillsmpApiKey}
          @input=${(e: Event) => { this.onboardingSkillsmpApiKey = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" @click=${this.handleOnboardingNext}>Skip</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingSkillsmpApiKey.trim()}
        >Next</button>
      </div>
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
