/**
 * Chat domain methods — chat, conversations, knowledge, memory, MCP,
 * share ingest, workbench, trajectories, database.
 */

import type { DatabaseProviderType } from "@miladyai/agent/contracts/config";
import type {
  ChatTokenUsage,
  ConnectionTestResult,
  ContentBlock,
  Conversation,
  ConversationChannelType,
  ConversationGreeting,
  ConversationMessage,
  ConversationMode,
  CreateConversationOptions,
  DatabaseConfigResponse,
  DatabaseStatus,
  ImageAttachment,
  KnowledgeBulkUploadResult,
  KnowledgeDocumentDetail,
  KnowledgeDocumentsResponse,
  KnowledgeFragmentsResponse,
  KnowledgeSearchResponse,
  KnowledgeStats,
  KnowledgeUploadResult,
  McpMarketplaceResult,
  McpRegistryServerDetail,
  McpServerConfig,
  McpServerStatus,
  MemoryRememberResponse,
  MemorySearchResponse,
  QueryResult,
  QuickContextResponse,
  ShareIngestItem,
  ShareIngestPayload,
  TableInfo,
  TableRowsResponse,
  TrajectoryConfig,
  TrajectoryDetailResult,
  TrajectoryExportOptions,
  TrajectoryListOptions,
  TrajectoryListResult,
  TrajectoryStats,
  WorkbenchOverview,
  WorkbenchTask,
  WorkbenchTodo,
} from "./client-types";
import { MiladyClient } from "./client-base";

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    sendChatRest(
      text: string,
      channelType?: ConversationChannelType,
      conversationMode?: ConversationMode,
    ): Promise<{ text: string; agentName: string }>;
    sendChatStream(
      text: string,
      onToken: (token: string, accumulatedText?: string) => void,
      channelType?: ConversationChannelType,
      signal?: AbortSignal,
      conversationMode?: ConversationMode,
    ): Promise<{
      text: string;
      agentName: string;
      completed: boolean;
      usage?: ChatTokenUsage;
    }>;
    listConversations(): Promise<{ conversations: Conversation[] }>;
    createConversation(
      title?: string,
      options?: CreateConversationOptions,
    ): Promise<{
      conversation: Conversation;
      greeting?: ConversationGreeting;
    }>;
    getConversationMessages(
      id: string,
    ): Promise<{ messages: ConversationMessage[] }>;
    truncateConversationMessages(
      id: string,
      messageId: string,
      options?: { inclusive?: boolean },
    ): Promise<{ ok: boolean; deletedCount: number }>;
    sendConversationMessage(
      id: string,
      text: string,
      channelType?: ConversationChannelType,
      images?: ImageAttachment[],
      conversationMode?: ConversationMode,
      metadata?: Record<string, unknown>,
    ): Promise<{
      text: string;
      agentName: string;
      blocks?: ContentBlock[];
    }>;
    sendConversationMessageStream(
      id: string,
      text: string,
      onToken: (token: string, accumulatedText?: string) => void,
      channelType?: ConversationChannelType,
      signal?: AbortSignal,
      images?: ImageAttachment[],
      conversationMode?: ConversationMode,
      metadata?: Record<string, unknown>,
    ): Promise<{
      text: string;
      agentName: string;
      completed: boolean;
      usage?: ChatTokenUsage;
    }>;
    requestGreeting(
      id: string,
      lang?: string,
    ): Promise<{
      text: string;
      agentName: string;
      generated: boolean;
      persisted?: boolean;
    }>;
    renameConversation(
      id: string,
      title: string,
      options?: { generate?: boolean },
    ): Promise<{ conversation: Conversation }>;
    deleteConversation(id: string): Promise<{ ok: boolean }>;
    getKnowledgeStats(): Promise<KnowledgeStats>;
    listKnowledgeDocuments(options?: {
      limit?: number;
      offset?: number;
    }): Promise<KnowledgeDocumentsResponse>;
    getKnowledgeDocument(
      documentId: string,
    ): Promise<{ document: KnowledgeDocumentDetail }>;
    deleteKnowledgeDocument(
      documentId: string,
    ): Promise<{ ok: boolean; deletedFragments: number }>;
    uploadKnowledgeDocument(data: {
      content: string;
      filename: string;
      contentType?: string;
      metadata?: Record<string, unknown>;
    }): Promise<KnowledgeUploadResult>;
    uploadKnowledgeDocumentsBulk(data: {
      documents: Array<{
        content: string;
        filename: string;
        contentType?: string;
        metadata?: Record<string, unknown>;
      }>;
    }): Promise<KnowledgeBulkUploadResult>;
    uploadKnowledgeFromUrl(
      url: string,
      metadata?: Record<string, unknown>,
    ): Promise<KnowledgeUploadResult>;
    searchKnowledge(
      query: string,
      options?: { threshold?: number; limit?: number },
    ): Promise<KnowledgeSearchResponse>;
    getKnowledgeFragments(
      documentId: string,
    ): Promise<KnowledgeFragmentsResponse>;
    rememberMemory(text: string): Promise<MemoryRememberResponse>;
    searchMemory(
      query: string,
      options?: { limit?: number },
    ): Promise<MemorySearchResponse>;
    quickContext(
      query: string,
      options?: { limit?: number },
    ): Promise<QuickContextResponse>;
    getMcpConfig(): Promise<{ servers: Record<string, McpServerConfig> }>;
    getMcpStatus(): Promise<{ servers: McpServerStatus[] }>;
    searchMcpMarketplace(
      query: string,
      limit: number,
    ): Promise<{ results: McpMarketplaceResult[] }>;
    getMcpServerDetails(
      name: string,
    ): Promise<{ server: McpRegistryServerDetail }>;
    addMcpServer(name: string, config: McpServerConfig): Promise<void>;
    removeMcpServer(name: string): Promise<void>;
    ingestShare(
      payload: ShareIngestPayload,
    ): Promise<{ item: ShareIngestItem }>;
    consumeShareIngest(): Promise<{ items: ShareIngestItem[] }>;
    getWorkbenchOverview(): Promise<
      WorkbenchOverview & {
        tasksAvailable?: boolean;
        triggersAvailable?: boolean;
        todosAvailable?: boolean;
      }
    >;
    listWorkbenchTasks(): Promise<{ tasks: WorkbenchTask[] }>;
    getWorkbenchTask(taskId: string): Promise<{ task: WorkbenchTask }>;
    createWorkbenchTask(data: {
      name: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }): Promise<{ task: WorkbenchTask }>;
    updateWorkbenchTask(
      taskId: string,
      data: {
        name?: string;
        description?: string;
        tags?: string[];
        isCompleted?: boolean;
      },
    ): Promise<{ task: WorkbenchTask }>;
    deleteWorkbenchTask(taskId: string): Promise<{ ok: boolean }>;
    listWorkbenchTodos(): Promise<{ todos: WorkbenchTodo[] }>;
    getWorkbenchTodo(todoId: string): Promise<{ todo: WorkbenchTodo }>;
    createWorkbenchTodo(data: {
      name: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
    }): Promise<{ todo: WorkbenchTodo }>;
    updateWorkbenchTodo(
      todoId: string,
      data: {
        name?: string;
        description?: string;
        priority?: number;
        isUrgent?: boolean;
        type?: string;
        isCompleted?: boolean;
      },
    ): Promise<{ todo: WorkbenchTodo }>;
    setWorkbenchTodoCompleted(
      todoId: string,
      isCompleted: boolean,
    ): Promise<void>;
    deleteWorkbenchTodo(todoId: string): Promise<{ ok: boolean }>;
    refreshRegistry(): Promise<void>;
    getTrajectories(
      options?: TrajectoryListOptions,
    ): Promise<TrajectoryListResult>;
    getTrajectoryDetail(trajectoryId: string): Promise<TrajectoryDetailResult>;
    getTrajectoryStats(): Promise<TrajectoryStats>;
    getTrajectoryConfig(): Promise<TrajectoryConfig>;
    updateTrajectoryConfig(
      config: Partial<TrajectoryConfig>,
    ): Promise<TrajectoryConfig>;
    exportTrajectories(options: TrajectoryExportOptions): Promise<Blob>;
    deleteTrajectories(trajectoryIds: string[]): Promise<{ deleted: number }>;
    clearAllTrajectories(): Promise<{ deleted: number }>;
    getDatabaseStatus(): Promise<DatabaseStatus>;
    getDatabaseConfig(): Promise<DatabaseConfigResponse>;
    saveDatabaseConfig(config: {
      provider?: DatabaseProviderType;
      pglite?: { dataDir?: string };
      postgres?: {
        connectionString?: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        ssl?: boolean;
      };
    }): Promise<{ saved: boolean; needsRestart: boolean }>;
    testDatabaseConnection(creds: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    }): Promise<ConnectionTestResult>;
    getDatabaseTables(): Promise<{ tables: TableInfo[] }>;
    getDatabaseRows(
      table: string,
      opts?: {
        offset?: number;
        limit?: number;
        sort?: string;
        order?: "asc" | "desc";
        search?: string;
      },
    ): Promise<TableRowsResponse>;
    insertDatabaseRow(
      table: string,
      data: Record<string, unknown>,
    ): Promise<{
      inserted: boolean;
      row: Record<string, unknown> | null;
    }>;
    updateDatabaseRow(
      table: string,
      where: Record<string, unknown>,
      data: Record<string, unknown>,
    ): Promise<{ updated: boolean; row: Record<string, unknown> }>;
    deleteDatabaseRow(
      table: string,
      where: Record<string, unknown>,
    ): Promise<{ deleted: boolean; row: Record<string, unknown> }>;
    executeDatabaseQuery(sql: string, readOnly?: boolean): Promise<QueryResult>;
  }
}

// ---------------------------------------------------------------------------
// Prototype augmentation
// ---------------------------------------------------------------------------

MiladyClient.prototype.sendChatRest = async function (
  this: MiladyClient,
  text,
  channelType = "DM",
  conversationMode?,
) {
  const response = await this.fetch<{ text: string; agentName: string }>(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({
        text,
        channelType,
        ...(conversationMode ? { conversationMode } : {}),
      }),
    },
  );
  return {
    ...response,
    text: this.normalizeAssistantText(response.text),
  };
};

MiladyClient.prototype.sendChatStream = async function (
  this: MiladyClient,
  text,
  onToken,
  channelType = "DM",
  signal?,
  conversationMode?,
) {
  return this.streamChatEndpoint(
    "/api/chat/stream",
    text,
    onToken,
    channelType,
    signal,
    undefined,
    conversationMode,
  );
};

MiladyClient.prototype.listConversations = async function (this: MiladyClient) {
  return this.fetch("/api/conversations");
};

MiladyClient.prototype.createConversation = async function (
  this: MiladyClient,
  title?,
  options?,
) {
  const response = await this.fetch<{
    conversation: Conversation;
    greeting?: ConversationGreeting;
  }>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      title,
      ...(options?.includeGreeting === true ||
      options?.bootstrapGreeting === true
        ? { includeGreeting: true }
        : {}),
      ...(typeof options?.lang === "string" && options.lang.trim()
        ? { lang: options.lang.trim() }
        : {}),
    }),
  });
  if (!response.greeting) {
    return response;
  }
  return {
    ...response,
    greeting: {
      ...response.greeting,
      text: this.normalizeGreetingText(response.greeting.text),
    },
  };
};

MiladyClient.prototype.getConversationMessages = async function (
  this: MiladyClient,
  id,
) {
  const response = await this.fetch<{ messages: ConversationMessage[] }>(
    `/api/conversations/${encodeURIComponent(id)}/messages`,
  );
  return {
    messages: response.messages.map((message) => {
      if (message.role !== "assistant") return message;
      const text = this.normalizeAssistantText(message.text);
      return text === message.text ? message : { ...message, text };
    }),
  };
};

MiladyClient.prototype.truncateConversationMessages = async function (
  this: MiladyClient,
  id,
  messageId,
  options?,
) {
  return this.fetch(
    `/api/conversations/${encodeURIComponent(id)}/messages/truncate`,
    {
      method: "POST",
      body: JSON.stringify({
        messageId,
        inclusive: options?.inclusive === true,
      }),
    },
  );
};

MiladyClient.prototype.sendConversationMessage = async function (
  this: MiladyClient,
  id,
  text,
  channelType = "DM",
  images?,
  conversationMode?,
  metadata?,
) {
  const response = await this.fetch<{
    text: string;
    agentName: string;
    blocks?: ContentBlock[];
  }>(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      text,
      channelType,
      ...(images?.length ? { images } : {}),
      ...(conversationMode ? { conversationMode } : {}),
      ...(metadata ? { metadata } : {}),
    }),
  });
  return {
    ...response,
    text: this.normalizeAssistantText(response.text),
  };
};

MiladyClient.prototype.sendConversationMessageStream = async function (
  this: MiladyClient,
  id,
  text,
  onToken,
  channelType = "DM",
  signal?,
  images?,
  conversationMode?,
  metadata?,
) {
  return this.streamChatEndpoint(
    `/api/conversations/${encodeURIComponent(id)}/messages/stream`,
    text,
    onToken,
    channelType,
    signal,
    images,
    conversationMode,
    metadata,
  );
};

MiladyClient.prototype.requestGreeting = async function (
  this: MiladyClient,
  id,
  lang?,
) {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  const response = await this.fetch<{
    text: string;
    agentName: string;
    generated: boolean;
    persisted?: boolean;
  }>(`/api/conversations/${encodeURIComponent(id)}/greeting${qs}`, {
    method: "POST",
  });
  return {
    ...response,
    text: this.normalizeGreetingText(response.text),
  };
};

MiladyClient.prototype.renameConversation = async function (
  this: MiladyClient,
  id,
  title,
  options?,
) {
  return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ title, generate: options?.generate }),
  });
};

MiladyClient.prototype.deleteConversation = async function (
  this: MiladyClient,
  id,
) {
  return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.getKnowledgeStats = async function (this: MiladyClient) {
  return this.fetch("/api/knowledge/stats");
};

MiladyClient.prototype.listKnowledgeDocuments = async function (
  this: MiladyClient,
  options?,
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  return this.fetch(`/api/knowledge/documents${query ? `?${query}` : ""}`);
};

MiladyClient.prototype.getKnowledgeDocument = async function (
  this: MiladyClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/documents/${encodeURIComponent(documentId)}`,
  );
};

MiladyClient.prototype.deleteKnowledgeDocument = async function (
  this: MiladyClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
};

MiladyClient.prototype.uploadKnowledgeDocument = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/knowledge/documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.uploadKnowledgeDocumentsBulk = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/knowledge/documents/bulk", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.uploadKnowledgeFromUrl = async function (
  this: MiladyClient,
  url,
  metadata?,
) {
  return this.fetch("/api/knowledge/documents/url", {
    method: "POST",
    body: JSON.stringify({ url, metadata }),
  });
};

MiladyClient.prototype.searchKnowledge = async function (
  this: MiladyClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.threshold !== undefined)
    params.set("threshold", String(options.threshold));
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/knowledge/search?${params}`);
};

MiladyClient.prototype.getKnowledgeFragments = async function (
  this: MiladyClient,
  documentId,
) {
  return this.fetch(
    `/api/knowledge/fragments/${encodeURIComponent(documentId)}`,
  );
};

MiladyClient.prototype.rememberMemory = async function (
  this: MiladyClient,
  text,
) {
  return this.fetch("/api/memory/remember", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
};

MiladyClient.prototype.searchMemory = async function (
  this: MiladyClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/memory/search?${params}`);
};

MiladyClient.prototype.quickContext = async function (
  this: MiladyClient,
  query,
  options?,
) {
  const params = new URLSearchParams({ q: query });
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  return this.fetch(`/api/context/quick?${params}`);
};

MiladyClient.prototype.getMcpConfig = async function (this: MiladyClient) {
  return this.fetch("/api/mcp/config");
};

MiladyClient.prototype.getMcpStatus = async function (this: MiladyClient) {
  return this.fetch("/api/mcp/status");
};

MiladyClient.prototype.searchMcpMarketplace = async function (
  this: MiladyClient,
  query,
  limit,
) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return this.fetch(`/api/mcp/marketplace/search?${params}`);
};

MiladyClient.prototype.getMcpServerDetails = async function (
  this: MiladyClient,
  name,
) {
  return this.fetch(`/api/mcp/marketplace/${encodeURIComponent(name)}`);
};

MiladyClient.prototype.addMcpServer = async function (
  this: MiladyClient,
  name,
  config,
) {
  await this.fetch("/api/mcp/servers", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });
};

MiladyClient.prototype.removeMcpServer = async function (
  this: MiladyClient,
  name,
) {
  await this.fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.ingestShare = async function (
  this: MiladyClient,
  payload,
) {
  return this.fetch("/api/ingest/share", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

MiladyClient.prototype.consumeShareIngest = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/share/consume", { method: "POST" });
};

MiladyClient.prototype.getWorkbenchOverview = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/workbench/overview");
};

MiladyClient.prototype.listWorkbenchTasks = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/workbench/tasks");
};

MiladyClient.prototype.getWorkbenchTask = async function (
  this: MiladyClient,
  taskId,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`);
};

MiladyClient.prototype.createWorkbenchTask = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/workbench/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.updateWorkbenchTask = async function (
  this: MiladyClient,
  taskId,
  data,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.deleteWorkbenchTask = async function (
  this: MiladyClient,
  taskId,
) {
  return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.listWorkbenchTodos = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/workbench/todos");
};

MiladyClient.prototype.getWorkbenchTodo = async function (
  this: MiladyClient,
  todoId,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`);
};

MiladyClient.prototype.createWorkbenchTodo = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/workbench/todos", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.updateWorkbenchTodo = async function (
  this: MiladyClient,
  todoId,
  data,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.setWorkbenchTodoCompleted = async function (
  this: MiladyClient,
  todoId,
  isCompleted,
) {
  await this.fetch(
    `/api/workbench/todos/${encodeURIComponent(todoId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ isCompleted }),
    },
  );
};

MiladyClient.prototype.deleteWorkbenchTodo = async function (
  this: MiladyClient,
  todoId,
) {
  return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
    method: "DELETE",
  });
};

MiladyClient.prototype.refreshRegistry = async function (this: MiladyClient) {
  await this.fetch("/api/apps/refresh", { method: "POST" });
};

MiladyClient.prototype.getTrajectories = async function (
  this: MiladyClient,
  options?,
) {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.source) params.set("source", options.source);
  if (options?.status) params.set("status", options.status);
  if (options?.startDate) params.set("startDate", options.startDate);
  if (options?.endDate) params.set("endDate", options.endDate);
  if (options?.search) params.set("search", options.search);
  const query = params.toString();
  return this.fetch(`/api/trajectories${query ? `?${query}` : ""}`);
};

MiladyClient.prototype.getTrajectoryDetail = async function (
  this: MiladyClient,
  trajectoryId,
) {
  return this.fetch(`/api/trajectories/${encodeURIComponent(trajectoryId)}`);
};

MiladyClient.prototype.getTrajectoryStats = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/trajectories/stats");
};

MiladyClient.prototype.getTrajectoryConfig = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/trajectories/config");
};

MiladyClient.prototype.updateTrajectoryConfig = async function (
  this: MiladyClient,
  config,
) {
  return this.fetch("/api/trajectories/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

MiladyClient.prototype.exportTrajectories = async function (
  this: MiladyClient,
  options,
) {
  const res = await this.rawRequest("/api/trajectories/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });
  return res.blob();
};

MiladyClient.prototype.deleteTrajectories = async function (
  this: MiladyClient,
  trajectoryIds,
) {
  return this.fetch("/api/trajectories", {
    method: "DELETE",
    body: JSON.stringify({ trajectoryIds }),
  });
};

MiladyClient.prototype.clearAllTrajectories = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/trajectories", {
    method: "DELETE",
    body: JSON.stringify({ clearAll: true }),
  });
};

MiladyClient.prototype.getDatabaseStatus = async function (this: MiladyClient) {
  return this.fetch("/api/database/status");
};

MiladyClient.prototype.getDatabaseConfig = async function (this: MiladyClient) {
  return this.fetch("/api/database/config");
};

MiladyClient.prototype.saveDatabaseConfig = async function (
  this: MiladyClient,
  config,
) {
  return this.fetch("/api/database/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
};

MiladyClient.prototype.testDatabaseConnection = async function (
  this: MiladyClient,
  creds,
) {
  return this.fetch("/api/database/test", {
    method: "POST",
    body: JSON.stringify(creds),
  });
};

MiladyClient.prototype.getDatabaseTables = async function (this: MiladyClient) {
  return this.fetch("/api/database/tables");
};

MiladyClient.prototype.getDatabaseRows = async function (
  this: MiladyClient,
  table,
  opts?,
) {
  const params = new URLSearchParams();
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.order) params.set("order", opts.order);
  if (opts?.search) params.set("search", opts.search);
  const qs = params.toString();
  return this.fetch(
    `/api/database/tables/${encodeURIComponent(table)}/rows${qs ? `?${qs}` : ""}`,
  );
};

MiladyClient.prototype.insertDatabaseRow = async function (
  this: MiladyClient,
  table,
  data,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
};

MiladyClient.prototype.updateDatabaseRow = async function (
  this: MiladyClient,
  table,
  where,
  data,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "PUT",
    body: JSON.stringify({ where, data }),
  });
};

MiladyClient.prototype.deleteDatabaseRow = async function (
  this: MiladyClient,
  table,
  where,
) {
  return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
    method: "DELETE",
    body: JSON.stringify({ where }),
  });
};

MiladyClient.prototype.executeDatabaseQuery = async function (
  this: MiladyClient,
  sql,
  readOnly = true,
) {
  return this.fetch("/api/database/query", {
    method: "POST",
    body: JSON.stringify({ sql, readOnly }),
  });
};
