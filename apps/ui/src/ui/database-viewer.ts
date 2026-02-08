/**
 * Database Viewer & Editor component for the Milaidy local app.
 *
 * Provides:
 * - Provider configurator (PGLite vs remote Postgres)
 * - Connection testing for Postgres
 * - Table browser sidebar
 * - Paginated data grid with inline editing
 * - Raw SQL query runner
 * - Agent restart prompt when config changes
 */

import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  client,
  type DatabaseStatus,
  type DatabaseConfigResponse,
  type DatabaseProviderType,
  type TableInfo,
  type TableRowsResponse,
  type ConnectionTestResult,
  type QueryResult,
} from "./api-client.js";

type DatabaseView = "tables" | "query";

@customElement("milaidy-database")
export class MilaidyDatabase extends LitElement {
  @state() private dbStatus: DatabaseStatus | null = null;
  @state() private dbConfig: DatabaseConfigResponse | null = null;
  @state() private tables: TableInfo[] = [];
  @state() private selectedTable = "";
  @state() private tableData: TableRowsResponse | null = null;
  @state() private tableSearch = "";
  @state() private sidebarSearch = "";
  @state() private view: DatabaseView = "tables";
  @state() private loading = false;
  @state() private configLoading = false;
  @state() private errorMessage = "";
  @state() private successMessage = "";
  @state() private needsRestart = false;
  @state() private configProvider: DatabaseProviderType = "pglite";
  @state() private pgHost = "";
  @state() private pgPort = "5432";
  @state() private pgDatabase = "";
  @state() private pgUser = "";
  @state() private pgPassword = "";
  @state() private pgSsl = false;
  @state() private pgConnectionString = "";
  @state() private useConnectionString = false;
  @state() private testResult: ConnectionTestResult | null = null;
  @state() private testing = false;
  @state() private pgliteDataDir = "";
  @state() private currentPage = 0;
  @state() private pageSize = 50;
  @state() private sortColumn = "";
  @state() private sortOrder: "asc" | "desc" = "asc";
  @state() private editingCell: { row: number; col: string } | null = null;
  @state() private editValue = "";
  @state() private sqlQuery = "";
  @state() private queryResult: QueryResult | null = null;
  @state() private queryRunning = false;
  private _searchTimer = 0;

  static styles = css`
    :host { display:flex; flex-direction:column; gap:16px; width:100%; min-height:0; flex:1; }
    .db-layout { display:flex; flex:1; min-height:0; gap:12px; }
    .config-panel { padding:16px; border:1px solid var(--border); border-radius:10px; background:var(--card,var(--bg)); }
    .config-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .config-title { font-size:14px; font-weight:600; color:var(--text-strong,var(--text)); }
    .config-status { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); }
    .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
    .status-dot.connected { background:var(--ok,#4ade80); }
    .status-dot.disconnected { background:var(--error,#f87171); }
    .provider-toggle { display:flex; gap:0; border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:12px; }
    .provider-btn { flex:1; padding:8px 16px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:13px; font-family:inherit; transition:all .15s; }
    .provider-btn.active { background:var(--accent,#6366f1); color:white; }
    .provider-btn:hover:not(.active) { background:var(--bg-muted,#f5f5f5); }
    .form-group { margin-bottom:10px; }
    .form-label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
    .form-input { width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-muted,var(--bg)); color:var(--text); font-size:13px; font-family:inherit; box-sizing:border-box; }
    .form-input:focus { outline:none; border-color:var(--accent,#6366f1); }
    .form-row { display:flex; gap:10px; }
    .form-row .form-group { flex:1; }
    .form-check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--text); cursor:pointer; }
    .form-check input { accent-color:var(--accent,#6366f1); }
    .btn { padding:8px 16px; border:1px solid var(--border); border-radius:6px; background:transparent; color:var(--text); font-size:13px; font-family:inherit; cursor:pointer; transition:all .15s; }
    .btn:hover { background:var(--bg-muted,#f5f5f5); }
    .btn:disabled { opacity:0.5; cursor:default; }
    .btn-primary { background:var(--accent,#6366f1); color:white; border-color:var(--accent,#6366f1); }
    .btn-primary:hover { opacity:0.9; }
    .btn-danger { color:var(--error,#f87171); border-color:var(--error,#f87171); }
    .btn-danger:hover { background:var(--error,#f87171); color:white; }
    .btn-sm { padding:4px 10px; font-size:12px; }
    .btn-group { display:flex; gap:8px; margin-top:12px; }
    .msg-success { padding:8px 12px; border-radius:6px; background:rgba(74,222,128,.1); border:1px solid var(--ok,#4ade80); color:var(--ok,#4ade80); font-size:12px; margin-top:8px; }
    .msg-error { padding:8px 12px; border-radius:6px; background:rgba(248,113,113,.1); border:1px solid var(--error,#f87171); color:var(--error,#f87171); font-size:12px; margin-top:8px; }
    .msg-warning { padding:8px 12px; border-radius:6px; background:rgba(251,191,36,.1); border:1px solid #fbbf24; color:#fbbf24; font-size:12px; }
    .sidebar { width:220px; min-width:220px; display:flex; flex-direction:column; border:1px solid var(--border); border-radius:10px; background:var(--card,var(--bg)); overflow:hidden; }
    .sidebar-header { padding:10px 12px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px; }
    .sidebar-tabs { display:flex; gap:0; }
    .sidebar-tab { flex:1; padding:6px 8px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:12px; font-family:inherit; border-bottom:2px solid transparent; }
    .sidebar-tab.active { color:var(--text-strong,var(--text)); border-bottom-color:var(--accent,#6366f1); }
    .sidebar-search { padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg-muted,var(--bg)); color:var(--text); font-size:12px; font-family:inherit; }
    .sidebar-search:focus { outline:none; border-color:var(--accent,#6366f1); }
    .table-list { flex:1; overflow-y:auto; padding:4px 0; }
    .table-item { padding:6px 12px; cursor:pointer; font-size:13px; color:var(--text); display:flex; justify-content:space-between; align-items:center; transition:background .1s; }
    .table-item:hover { background:var(--bg-muted,#f5f5f5); }
    .table-item.selected { background:var(--accent,#6366f1); color:white; }
    .table-item .row-count { font-size:11px; color:var(--muted); font-family:var(--mono,monospace); }
    .table-item.selected .row-count { color:rgba(255,255,255,.7); }
    .main-content { flex:1; min-width:0; display:flex; flex-direction:column; border:1px solid var(--border); border-radius:10px; background:var(--card,var(--bg)); overflow:hidden; }
    .main-header { padding:10px 14px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
    .main-title { font-size:14px; font-weight:600; color:var(--text-strong,var(--text)); font-family:var(--mono,monospace); }
    .main-toolbar { display:flex; align-items:center; gap:8px; }
    .search-input { padding:5px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-muted,var(--bg)); color:var(--text); font-size:12px; font-family:inherit; width:180px; }
    .search-input:focus { outline:none; border-color:var(--accent,#6366f1); }
    .data-grid-wrapper { flex:1; overflow:auto; min-height:0; }
    .data-grid { width:100%; border-collapse:collapse; font-size:12px; font-family:var(--mono,monospace); }
    .data-grid th { position:sticky; top:0; background:var(--bg-muted,#f5f5f5); border-bottom:1px solid var(--border); padding:6px 10px; text-align:left; font-weight:600; color:var(--text-strong,var(--text)); cursor:pointer; white-space:nowrap; user-select:none; z-index:1; }
    .data-grid th:hover { color:var(--accent,#6366f1); }
    .data-grid th .sort-ind { margin-left:4px; font-size:10px; opacity:.4; }
    .data-grid th .sort-ind.active { opacity:1; }
    .data-grid td { padding:5px 10px; border-bottom:1px solid var(--border); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); }
    .data-grid tr:hover td { background:var(--bg-muted,#f5f5f5); }
    .data-grid td.editing { padding:2px; }
    .cell-edit-input { width:100%; padding:3px 6px; border:1px solid var(--accent,#6366f1); border-radius:3px; background:var(--bg); color:var(--text); font-size:12px; font-family:var(--mono,monospace); box-sizing:border-box; }
    .cell-null { color:var(--muted); font-style:italic; }
    .cell-bool { color:var(--accent,#6366f1); }
    .cell-number { color:#c084fc; }
    .cell-json { color:#fbbf24; cursor:pointer; }
    .row-actions { display:flex; gap:4px; }
    .row-action-btn { padding:2px 6px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:11px; border-radius:3px; }
    .row-action-btn:hover { background:var(--bg-muted,#f5f5f5); color:var(--text); }
    .row-action-btn.delete:hover { color:var(--error,#f87171); }
    .pagination { padding:8px 14px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted); }
    .pagination-controls { display:flex; gap:4px; align-items:center; }
    .query-panel { display:flex; flex-direction:column; flex:1; min-height:0; }
    .query-editor { padding:12px; border-bottom:1px solid var(--border); }
    .query-textarea { width:100%; min-height:100px; padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--bg-muted,var(--bg)); color:var(--text); font-size:13px; font-family:var(--mono,monospace); resize:vertical; box-sizing:border-box; }
    .query-textarea:focus { outline:none; border-color:var(--accent,#6366f1); }
    .query-toolbar { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
    .query-info { font-size:12px; color:var(--muted); font-family:var(--mono,monospace); }
    .query-results { flex:1; overflow:auto; min-height:0; }
    .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px; color:var(--muted); gap:8px; }
    .empty-state-text { font-size:13px; }
    .loading-overlay { display:flex; align-items:center; justify-content:center; padding:20px; color:var(--muted); font-size:13px; }
    .version-label { font-size:11px; color:var(--muted); font-family:var(--mono,monospace); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    @media(max-width:700px) { .db-layout{flex-direction:column;} .sidebar{width:100%;min-width:0;max-height:200px;} }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    this.errorMessage = "";
    const [statusRes, configRes, tablesRes] = await Promise.allSettled([
      client.getDatabaseStatus(),
      client.getDatabaseConfig(),
      client.getDatabaseTables(),
    ]);
    if (statusRes.status === "fulfilled") this.dbStatus = statusRes.value;
    if (configRes.status === "fulfilled") {
      this.dbConfig = configRes.value;
      this.needsRestart = configRes.value.needsRestart;
      this.populateConfigForm(configRes.value);
    }
    if (tablesRes.status === "fulfilled") this.tables = tablesRes.value.tables;
    else this.tables = [];
    this.loading = false;
  }

  private populateConfigForm(cfg: DatabaseConfigResponse): void {
    const c = cfg.config;
    this.configProvider = c.provider ?? "pglite";
    this.pgHost = c.postgres?.host ?? "";
    this.pgPort = String(c.postgres?.port ?? 5432);
    this.pgDatabase = c.postgres?.database ?? "";
    this.pgUser = c.postgres?.user ?? "";
    this.pgPassword = "";
    this.pgSsl = c.postgres?.ssl ?? false;
    this.pgConnectionString = c.postgres?.connectionString ?? "";
    this.useConnectionString = Boolean(c.postgres?.connectionString);
    this.pgliteDataDir = c.pglite?.dataDir ?? "";
  }

  private clearMessages(): void {
    this.errorMessage = "";
    this.successMessage = "";
  }

  /**
   * Run an async UI action, surfacing any thrown error to this.errorMessage.
   * Returns false if the action failed, true if it succeeded.
   */
  private async run(action: () => Promise<void>): Promise<boolean> {
    this.clearMessages();
    try {
      await action();
      return true;
    } catch (err: unknown) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  private async handleTestConnection(): Promise<void> {
    this.testing = true;
    this.testResult = null;
    this.clearMessages();
    const creds = this.useConnectionString
      ? { connectionString: this.pgConnectionString }
      : { host: this.pgHost, port: Number(this.pgPort) || 5432, database: this.pgDatabase, user: this.pgUser, password: this.pgPassword, ssl: this.pgSsl };
    await this.run(async () => {
      this.testResult = await client.testDatabaseConnection(creds);
    });
    this.testing = false;
  }

  private async handleSaveConfig(): Promise<void> {
    this.configLoading = true;
    this.clearMessages();
    const config: Record<string, unknown> = { provider: this.configProvider };
    if (this.configProvider === "postgres") {
      if (this.useConnectionString) config.postgres = { connectionString: this.pgConnectionString };
      else config.postgres = { host: this.pgHost, port: Number(this.pgPort) || 5432, database: this.pgDatabase, user: this.pgUser, ...(this.pgPassword ? { password: this.pgPassword } : {}), ssl: this.pgSsl };
    } else if (this.pgliteDataDir) {
      config.pglite = { dataDir: this.pgliteDataDir };
    }
    const ok = await this.run(async () => {
      const result = await client.saveDatabaseConfig(config as Parameters<typeof client.saveDatabaseConfig>[0]);
      if (result.saved) {
        this.successMessage = "Configuration saved.";
        this.needsRestart = result.needsRestart;
        const configRes = await client.getDatabaseConfig();
        this.dbConfig = configRes;
        this.populateConfigForm(configRes);
      }
    });
    this.configLoading = false;
    if (!ok) this.configLoading = false;
  }

  private handleRestart(): void {
    this.dispatchEvent(new CustomEvent("request-restart", { bubbles: true, composed: true }));
  }

  private async selectTable(name: string): Promise<void> {
    this.clearMessages();
    this.selectedTable = name;
    this.currentPage = 0;
    this.sortColumn = "";
    this.sortOrder = "asc";
    this.tableSearch = "";
    this.editingCell = null;
    await this.loadTableData();
  }

  private async loadTableData(): Promise<void> {
    if (!this.selectedTable) return;
    this.loading = true;
    await this.run(async () => {
      this.tableData = await client.getDatabaseRows(this.selectedTable, {
        offset: this.currentPage * this.pageSize, limit: this.pageSize,
        sort: this.sortColumn || undefined, order: this.sortColumn ? this.sortOrder : undefined,
        search: this.tableSearch || undefined,
      });
    });
    this.loading = false;
  }

  private handleSort(col: string): void {
    if (this.sortColumn === col) this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    else { this.sortColumn = col; this.sortOrder = "asc"; }
    this.currentPage = 0;
    this.loadTableData();
  }

  private handlePageChange(delta: number): void {
    const newPage = this.currentPage + delta;
    if (newPage < 0) return;
    if (this.tableData && newPage * this.pageSize >= this.tableData.total) return;
    this.currentPage = newPage;
    this.loadTableData();
  }

  private handleTableSearch(value: string): void {
    this.tableSearch = value;
    this.currentPage = 0;
    clearTimeout(this._searchTimer);
    this._searchTimer = window.setTimeout(() => this.loadTableData(), 300);
  }

  private startEdit(rowIdx: number, colName: string, currentValue: unknown): void {
    this.editingCell = { row: rowIdx, col: colName };
    this.editValue = currentValue === null || currentValue === undefined ? ""
      : typeof currentValue === "object" ? JSON.stringify(currentValue)
      : String(currentValue);
  }

  private async commitEdit(row: Record<string, unknown>): Promise<void> {
    if (!this.editingCell || !this.selectedTable) return;
    const tableInfo = this.tables.find((t) => t.name === this.selectedTable);
    const pkCols = tableInfo?.columns.filter((c) => c.isPrimaryKey) ?? [];
    const where: Record<string, unknown> = {};
    if (pkCols.length > 0) { for (const pk of pkCols) where[pk.name] = row[pk.name]; }
    else Object.assign(where, row);
    const col = this.editingCell.col;
    let newValue: unknown = this.editValue;
    const colInfo = tableInfo?.columns.find((c) => c.name === col);
    if (colInfo && (colInfo.type === "jsonb" || colInfo.type === "json")) {
      try { newValue = JSON.parse(this.editValue); }
      catch { this.errorMessage = "Invalid JSON value"; this.editingCell = null; return; }
    }
    else if (this.editValue === "") newValue = null;
    else if (colInfo?.type === "integer" || colInfo?.type === "bigint" || colInfo?.type === "numeric") {
      const num = Number(this.editValue);
      if (!Number.isNaN(num)) newValue = num;
    } else if (colInfo?.type === "boolean") newValue = this.editValue.toLowerCase() === "true" || this.editValue === "1";
    const ok = await this.run(async () => {
      await client.updateDatabaseRow(this.selectedTable, where, { [col]: newValue });
    });
    this.editingCell = null;
    if (ok) await this.loadTableData();
  }

  private cancelEdit(): void { this.editingCell = null; }

  private async deleteRow(row: Record<string, unknown>): Promise<void> {
    if (!this.selectedTable) return;
    const tableInfo = this.tables.find((t) => t.name === this.selectedTable);
    const pkCols = tableInfo?.columns.filter((c) => c.isPrimaryKey) ?? [];
    const where: Record<string, unknown> = {};
    if (pkCols.length > 0) { for (const pk of pkCols) where[pk.name] = row[pk.name]; }
    else Object.assign(where, row);
    const ok = await this.run(async () => {
      await client.deleteDatabaseRow(this.selectedTable, where);
    });
    if (ok) {
      await this.loadTableData();
      const tablesRes = await client.getDatabaseTables();
      this.tables = tablesRes.tables;
    }
  }

  private async executeQuery(): Promise<void> {
    if (!this.sqlQuery.trim()) return;
    this.queryRunning = true;
    this.queryResult = null;
    this.clearMessages();
    await this.run(async () => {
      this.queryResult = await client.executeDatabaseQuery(this.sqlQuery, true);
    });
    this.queryRunning = false;
  }

  private async executeMutation(): Promise<void> {
    if (!this.sqlQuery.trim()) return;
    this.queryRunning = true;
    this.queryResult = null;
    this.clearMessages();
    const ok = await this.run(async () => {
      this.queryResult = await client.executeDatabaseQuery(this.sqlQuery, false);
    });
    this.queryRunning = false;
    if (ok) {
      const tablesRes = await client.getDatabaseTables();
      this.tables = tablesRes.tables;
      if (this.selectedTable) await this.loadTableData();
    }
  }

  private handleQueryKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); this.executeQuery(); }
  }


  render() {
    return html`
      ${this.renderConfigPanel()}
      ${this.needsRestart
        ? html`<div class="msg-warning">
            Database provider has changed. Restart the agent to apply.
            <button class="btn btn-primary btn-sm" style="margin-left:8px"
              @click=${this.handleRestart}>Restart Agent</button>
          </div>`
        : nothing}
      ${this.errorMessage ? html`<div class="msg-error">${this.errorMessage}</div>` : nothing}
      ${this.successMessage ? html`<div class="msg-success">${this.successMessage}</div>` : nothing}
      <div class="db-layout">
        ${this.renderSidebar()}
        ${this.renderMainContent()}
      </div>
    `;
  }

  private renderConfigPanel() {
    const s = this.dbStatus;
    return html`
      <div class="config-panel">
        <div class="config-header">
          <span class="config-title">Database Provider</span>
          <div class="config-status">
            <span class="status-dot ${s?.connected ? "connected" : "disconnected"}"></span>
            ${s?.connected ? "Connected" : "Not connected"}
            ${s?.serverVersion ? html`<span class="version-label">${s.serverVersion}</span>` : nothing}
          </div>
        </div>
        <div class="provider-toggle">
          <button class="provider-btn ${this.configProvider === "pglite" ? "active" : ""}"
            @click=${() => { this.configProvider = "pglite"; this.testResult = null; }}>PGLite (Local)</button>
          <button class="provider-btn ${this.configProvider === "postgres" ? "active" : ""}"
            @click=${() => { this.configProvider = "postgres"; this.testResult = null; }}>PostgreSQL (Remote)</button>
        </div>
        ${this.configProvider === "postgres" ? this.renderPostgresForm() : this.renderPgliteForm()}
        <div class="btn-group">
          ${this.configProvider === "postgres"
            ? html`<button class="btn" @click=${this.handleTestConnection} ?disabled=${this.testing}>
                ${this.testing ? "Testing..." : "Test Connection"}</button>`
            : nothing}
          <button class="btn btn-primary" @click=${this.handleSaveConfig} ?disabled=${this.configLoading}>
            ${this.configLoading ? "Saving..." : "Save Configuration"}</button>
        </div>
        ${this.testResult
          ? this.testResult.success
            ? html`<div class="msg-success">Connection successful (${this.testResult.durationMs}ms).
                ${this.testResult.serverVersion ? html`<br/><span class="version-label">${this.testResult.serverVersion}</span>` : nothing}</div>`
            : html`<div class="msg-error">Connection failed: ${this.testResult.error}</div>`
          : nothing}
      </div>
    `;
  }

  private renderPgliteForm() {
    return html`
      <div class="form-group">
        <label class="form-label">Data Directory (optional, leave empty for default)</label>
        <input class="form-input" type="text" placeholder="~/.milaidy/workspace/.eliza/.elizadb"
          .value=${this.pgliteDataDir}
          @input=${(e: Event) => { this.pgliteDataDir = (e.target as HTMLInputElement).value; }} />
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">
        PGLite runs a full PostgreSQL database locally using WebAssembly. No external server required.
      </div>
    `;
  }

  private renderPostgresForm() {
    return html`
      <div class="form-check" style="margin-bottom:10px;">
        <input type="checkbox" id="use-conn-str" .checked=${this.useConnectionString}
          @change=${(e: Event) => { this.useConnectionString = (e.target as HTMLInputElement).checked; }} />
        <label for="use-conn-str">Use connection string</label>
      </div>
      ${this.useConnectionString
        ? html`<div class="form-group">
            <label class="form-label">Connection String</label>
            <input class="form-input" type="text" placeholder="postgresql://user:password@host:5432/database"
              .value=${this.pgConnectionString}
              @input=${(e: Event) => { this.pgConnectionString = (e.target as HTMLInputElement).value; }} />
          </div>`
        : html`
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label class="form-label">Host</label>
              <input class="form-input" type="text" placeholder="localhost" .value=${this.pgHost}
                @input=${(e: Event) => { this.pgHost = (e.target as HTMLInputElement).value; }} />
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label">Port</label>
              <input class="form-input" type="text" placeholder="5432" .value=${this.pgPort}
                @input=${(e: Event) => { this.pgPort = (e.target as HTMLInputElement).value; }} />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Database</label>
            <input class="form-input" type="text" placeholder="postgres" .value=${this.pgDatabase}
              @input=${(e: Event) => { this.pgDatabase = (e.target as HTMLInputElement).value; }} />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">User</label>
              <input class="form-input" type="text" placeholder="postgres" .value=${this.pgUser}
                @input=${(e: Event) => { this.pgUser = (e.target as HTMLInputElement).value; }} />
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input class="form-input" type="password" placeholder="Enter password" .value=${this.pgPassword}
                @input=${(e: Event) => { this.pgPassword = (e.target as HTMLInputElement).value; }} />
            </div>
          </div>
          <div class="form-check">
            <input type="checkbox" id="pg-ssl" .checked=${this.pgSsl}
              @change=${(e: Event) => { this.pgSsl = (e.target as HTMLInputElement).checked; }} />
            <label for="pg-ssl">Enable SSL</label>
          </div>`}
    `;
  }

  private renderSidebar() {
    const filtered = this.sidebarSearch
      ? this.tables.filter((t) => t.name.toLowerCase().includes(this.sidebarSearch.toLowerCase()))
      : this.tables;
    return html`
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-tabs">
            <button class="sidebar-tab ${this.view === "tables" ? "active" : ""}"
              @click=${() => { this.view = "tables"; }}>Tables</button>
            <button class="sidebar-tab ${this.view === "query" ? "active" : ""}"
              @click=${() => { this.view = "query"; }}>SQL</button>
          </div>
          ${this.view === "tables"
            ? html`<input class="sidebar-search" type="text" placeholder="Filter tables..."
                .value=${this.sidebarSearch}
                @input=${(e: Event) => { this.sidebarSearch = (e.target as HTMLInputElement).value; }} />`
            : nothing}
        </div>
        ${this.view === "tables"
          ? html`<div class="table-list">
              ${filtered.length === 0
                ? html`<div class="empty-state" style="padding:16px"><span class="empty-state-text">No tables found</span></div>`
                : filtered.map((t) => html`
                    <div class="table-item ${this.selectedTable === t.name ? "selected" : ""}"
                      @click=${() => this.selectTable(t.name)}>
                      <span>${t.name}</span>
                      <span class="row-count">${t.rowCount}</span>
                    </div>`)}
            </div>`
          : html`<div class="table-list"><div style="padding:10px;font-size:12px;color:var(--muted)">Write SQL queries in the editor panel.</div></div>`}
      </div>
    `;
  }

  private renderMainContent() {
    if (this.view === "query") return this.renderQueryPanel();
    if (!this.selectedTable) {
      return html`<div class="main-content"><div class="empty-state" style="flex:1">
        <span class="empty-state-text">Select a table to browse its data</span></div></div>`;
    }
    return this.renderDataGrid();
  }

  private renderDataGrid() {
    const data = this.tableData;
    if (!data) return html`<div class="main-content"><div class="loading-overlay">Loading...</div></div>`;
    const tableInfo = this.tables.find((t) => t.name === this.selectedTable);
    const cols = data.columns.length > 0 ? data.columns : (tableInfo?.columns.map((c) => c.name) ?? []);
    const totalPages = Math.ceil(data.total / this.pageSize);
    return html`
      <div class="main-content">
        <div class="main-header">
          <span class="main-title">${this.selectedTable}</span>
          <div class="main-toolbar">
            <input class="search-input" type="text" placeholder="Search rows..."
              .value=${this.tableSearch}
              @input=${(e: Event) => this.handleTableSearch((e.target as HTMLInputElement).value)} />
            <button class="btn btn-sm" @click=${() => this.loadTableData()}>Refresh</button>
          </div>
        </div>
        <div class="data-grid-wrapper">
          ${data.rows.length === 0
            ? html`<div class="empty-state"><span class="empty-state-text">No rows</span></div>`
            : html`
              <table class="data-grid">
                <thead><tr>
                  ${cols.map((col) => html`<th @click=${() => this.handleSort(col)}>${col}
                    <span class="sort-ind ${this.sortColumn === col ? "active" : ""}">
                      ${this.sortColumn === col ? (this.sortOrder === "asc" ? "\u25B2" : "\u25BC") : ""}</span></th>`)}
                  <th style="width:60px"></th>
                </tr></thead>
                <tbody>
                  ${data.rows.map((row, rowIdx) => html`<tr>
                    ${cols.map((col) => {
                      const isEditing = this.editingCell?.row === rowIdx && this.editingCell?.col === col;
                      if (isEditing) {
                        return html`<td class="editing"><input class="cell-edit-input"
                          .value=${this.editValue}
                          @input=${(e: Event) => { this.editValue = (e.target as HTMLInputElement).value; }}
                          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.commitEdit(row); if (e.key === "Escape") this.cancelEdit(); }}
                          @blur=${() => this.commitEdit(row)} /></td>`;
                      }
                      return html`<td @dblclick=${() => this.startEdit(rowIdx, col, row[col])}>${this.renderCellValue(row[col])}</td>`;
                    })}
                    <td><div class="row-actions">
                      <button class="row-action-btn delete" title="Delete row" @click=${() => this.deleteRow(row)}>\u2715</button>
                    </div></td>
                  </tr>`)}
                </tbody>
              </table>`}
        </div>
        <div class="pagination">
          <span>${data.total} row${data.total !== 1 ? "s" : ""}</span>
          <div class="pagination-controls">
            <button class="btn btn-sm" ?disabled=${this.currentPage === 0} @click=${() => this.handlePageChange(-1)}>\u25C0 Prev</button>
            <span style="padding:4px 8px;font-size:12px">Page ${this.currentPage + 1}${totalPages > 0 ? ` of ${totalPages}` : ""}</span>
            <button class="btn btn-sm" ?disabled=${(this.currentPage + 1) * this.pageSize >= data.total}
              @click=${() => this.handlePageChange(1)}>Next \u25B6</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderCellValue(value: unknown) {
    if (value === null || value === undefined) return html`<span class="cell-null">NULL</span>`;
    if (typeof value === "boolean") return html`<span class="cell-bool">${value ? "true" : "false"}</span>`;
    if (typeof value === "number") return html`<span class="cell-number">${value}</span>`;
    if (typeof value === "object") {
      const jsonStr = JSON.stringify(value);
      const truncated = jsonStr.length > 80 ? jsonStr.slice(0, 77) + "..." : jsonStr;
      return html`<span class="cell-json" title=${jsonStr}>${truncated}</span>`;
    }
    const str = String(value);
    return str.length > 100 ? html`<span title=${str}>${str.slice(0, 97)}...</span>` : str;
  }

  private renderQueryPanel() {
    return html`
      <div class="main-content">
        <div class="query-panel">
          <div class="query-editor">
            <textarea class="query-textarea" placeholder="Enter SQL query... (Ctrl+Enter to execute)"
              .value=${this.sqlQuery}
              @input=${(e: Event) => { this.sqlQuery = (e.target as HTMLTextAreaElement).value; }}
              @keydown=${(e: KeyboardEvent) => this.handleQueryKeydown(e)}></textarea>
            <div class="query-toolbar">
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary btn-sm" @click=${this.executeQuery}
                  ?disabled=${this.queryRunning || !this.sqlQuery.trim()}>
                  ${this.queryRunning ? "Running..." : "Run Query"}</button>
                <button class="btn btn-danger btn-sm" @click=${this.executeMutation}
                  ?disabled=${this.queryRunning || !this.sqlQuery.trim()}>Run Mutation</button>
              </div>
              ${this.queryResult
                ? html`<span class="query-info">${this.queryResult.rowCount} row${this.queryResult.rowCount !== 1 ? "s" : ""} in ${this.queryResult.durationMs}ms</span>`
                : nothing}
            </div>
          </div>
          <div class="query-results">
            ${this.queryResult && this.queryResult.rows.length > 0
              ? html`<table class="data-grid">
                  <thead><tr>${this.queryResult.columns.map((c) => html`<th>${c}</th>`)}</tr></thead>
                  <tbody>${this.queryResult.rows.map((row) => html`<tr>
                    ${this.queryResult!.columns.map((col) => html`<td>${this.renderCellValue(row[col])}</td>`)}</tr>`)}</tbody>
                </table>`
              : this.queryResult
                ? html`<div class="empty-state"><span class="empty-state-text">Query returned no rows</span></div>`
                : html`<div class="empty-state"><span class="empty-state-text">Run a query to see results</span></div>`}
          </div>
        </div>
      </div>
    `;
  }
}
