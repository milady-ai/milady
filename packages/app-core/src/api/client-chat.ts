/**
 * Chat domain methods — chat, conversations, knowledge, memory, MCP,
 * share ingest, workbench, trajectories, database.
 */

import type { DatabaseProviderType } from "@miladyai/agent/contracts/config";
import type {
  CaptureLifeOpsActivitySignalRequest,
  CreateLifeOpsBrowserCompanionPairingRequest,
  LifeOpsActivitySignal,
  LifeOpsBrowserCompanionPackageStatus,
  LifeOpsBrowserCompanionPairingResponse,
  LifeOpsBrowserKind,
  LifeOpsConnectorMode,
  LifeOpsConnectorSide,
} from "@miladyai/shared/contracts/lifeops";
import { MiladyClient } from "./client-base";
import type {
  ApiError,
  ChatTokenUsage,
  CompleteLifeOpsBrowserSessionRequest,
  CompleteLifeOpsOccurrenceRequest,
  ConfirmLifeOpsBrowserSessionRequest,
  ConnectionTestResult,
  ContentBlock,
  Conversation,
  ConversationChannelType,
  ConversationGreeting,
  ConversationMessage,
  ConversationMode,
  CreateConversationOptions,
  CreateLifeOpsBrowserSessionRequest,
  CreateLifeOpsCalendarEventRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGmailReplyDraftRequest,
  CreateLifeOpsGoalRequest,
  DatabaseConfigResponse,
  DatabaseStatus,
  DisconnectLifeOpsGoogleConnectorRequest,
  GetLifeOpsCalendarFeedRequest,
  GetLifeOpsGmailTriageRequest,
  ImageAttachment,
  KnowledgeBulkUploadResult,
  KnowledgeDocumentDetail,
  KnowledgeDocumentsResponse,
  KnowledgeFragmentsResponse,
  KnowledgeSearchResponse,
  KnowledgeStats,
  KnowledgeUploadResult,
  LifeOpsBrowserCompanionStatus,
  LifeOpsBrowserPageContext,
  LifeOpsBrowserSession,
  LifeOpsBrowserSettings,
  LifeOpsBrowserTabSummary,
  LifeOpsCalendarFeed,
  LifeOpsDefinitionRecord,
  LifeOpsGmailReplyDraft,
  LifeOpsGmailTriageFeed,
  LifeOpsGoalRecord,
  LifeOpsGoalReview,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOccurrenceActionResult,
  LifeOpsOccurrenceExplanation,
  LifeOpsOverview,
  LifeOpsReminderInspection,
  McpMarketplaceResult,
  McpRegistryServerDetail,
  McpServerConfig,
  McpServerStatus,
  MemoryBrowseQuery,
  MemoryBrowseResponse,
  MemoryFeedQuery,
  MemoryFeedResponse,
  MemoryRememberResponse,
  MemorySearchResponse,
  MemoryStatsResponse,
  QueryResult,
  QuickContextResponse,
  SelectLifeOpsGoogleConnectorPreferenceRequest,
  SendLifeOpsGmailReplyRequest,
  ShareIngestItem,
  ShareIngestPayload,
  SnoozeLifeOpsOccurrenceRequest,
  StartLifeOpsGoogleConnectorRequest,
  StartLifeOpsGoogleConnectorResponse,
  SyncLifeOpsBrowserStateRequest,
  TableInfo,
  TableRowsResponse,
  TrajectoryConfig,
  TrajectoryDetailResult,
  TrajectoryExportOptions,
  TrajectoryListOptions,
  TrajectoryListResult,
  TrajectoryStats,
  UpdateLifeOpsBrowserSettingsRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
  WorkbenchOverview,
  WorkbenchTask,
  WorkbenchTodo,
} from "./client-types";

// ---------------------------------------------------------------------------
// Declaration merging
// ---------------------------------------------------------------------------

declare module "./client-base" {
  interface MiladyClient {
    sendChatRest(
      text: string,
      channelType?: ConversationChannelType,
      conversationMode?: ConversationMode,
    ): Promise<{
      text: string;
      agentName: string;
      noResponseReason?: "ignored";
    }>;
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
      noResponseReason?: "ignored";
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
    /**
     * Fetch the unified cross-channel inbox. Returns the most recent
     * messages across every connector room the agent participates in,
     * time-ordered newest first. Each message carries its `source`
     * tag (imessage / telegram / discord / etc.) so the UI can render
     * per-source styling without a second lookup.
     *
     * When `roomId` is provided the server scopes the query to that
     * single connector room — use this when the unified messages view
     * has a specific chat selected. When `roomId` is omitted the feed
     * merges every room's recent messages.
     */
    getInboxMessages(options?: {
      limit?: number;
      sources?: string[];
      roomId?: string;
      roomSource?: string;
    }): Promise<{
      messages: Array<ConversationMessage & { roomId: string; source: string }>;
      count: number;
    }>;
    /**
     * List the distinct connector source tags the agent currently has
     * inbox messages for. Used by the unified inbox UI to build the
     * source filter chip list dynamically.
     */
    getInboxSources(): Promise<{ sources: string[] }>;
    /**
     * List every connector chat thread the agent participates in as
     * one sidebar-friendly row per external chat room. Each row carries
     * the room id (for selection), source tag, display title,
     * last-message preview, last-message timestamp, and a total message
     * count. Used by the unified messages sidebar to render connector
     * chats alongside dashboard conversations.
     */
    getInboxChats(options?: { sources?: string[] }): Promise<{
      chats: Array<{
        canSend?: boolean;
        id: string;
        source: string;
        transportSource?: string;
        /** Owning server/world id when the connector exposes one. */
        worldId?: string;
        /** User-facing server/world label for selectors and section headers. */
        worldLabel: string;
        title: string;
        avatarUrl?: string;
        lastMessageText: string;
        lastMessageAt: number;
        messageCount: number;
      }>;
      count: number;
    }>;
    sendInboxMessage(data: {
      roomId: string;
      source: string;
      text: string;
      replyToMessageId?: string;
    }): Promise<{
      ok: boolean;
      message?: ConversationMessage & { roomId: string; source: string };
    }>;
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
      noResponseReason?: "ignored";
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
      noResponseReason?: "ignored";
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
    getMemoryFeed(query?: MemoryFeedQuery): Promise<MemoryFeedResponse>;
    browseMemories(query?: MemoryBrowseQuery): Promise<MemoryBrowseResponse>;
    getMemoriesByEntity(
      entityId: string,
      query?: MemoryBrowseQuery,
    ): Promise<MemoryBrowseResponse>;
    getMemoryStats(): Promise<MemoryStatsResponse>;
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
        lifeopsAvailable?: boolean;
      }
    >;
    getLifeOpsOverview(): Promise<LifeOpsOverview>;
    getLifeOpsBrowserSettings(): Promise<{ settings: LifeOpsBrowserSettings }>;
    updateLifeOpsBrowserSettings(
      data: UpdateLifeOpsBrowserSettingsRequest,
    ): Promise<{ settings: LifeOpsBrowserSettings }>;
    listLifeOpsBrowserCompanions(): Promise<{
      companions: LifeOpsBrowserCompanionStatus[];
    }>;
    getLifeOpsBrowserPackageStatus(): Promise<{
      status: LifeOpsBrowserCompanionPackageStatus;
    }>;
    createLifeOpsBrowserCompanionPairing(
      data: CreateLifeOpsBrowserCompanionPairingRequest,
    ): Promise<LifeOpsBrowserCompanionPairingResponse>;
    buildLifeOpsBrowserCompanionPackage(browser: LifeOpsBrowserKind): Promise<{
      status: LifeOpsBrowserCompanionPackageStatus;
    }>;
    downloadLifeOpsBrowserCompanionPackage(
      browser: LifeOpsBrowserKind,
    ): Promise<{
      blob: Blob;
      filename: string;
    }>;
    listLifeOpsBrowserTabs(): Promise<{ tabs: LifeOpsBrowserTabSummary[] }>;
    getLifeOpsBrowserCurrentPage(): Promise<{
      page: LifeOpsBrowserPageContext | null;
    }>;
    syncLifeOpsBrowserState(data: SyncLifeOpsBrowserStateRequest): Promise<{
      companion: LifeOpsBrowserCompanionStatus;
      tabs: LifeOpsBrowserTabSummary[];
      currentPage: LifeOpsBrowserPageContext | null;
    }>;
    listLifeOpsBrowserSessions(): Promise<{
      sessions: LifeOpsBrowserSession[];
    }>;
    getLifeOpsBrowserSession(
      sessionId: string,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    createLifeOpsBrowserSession(
      data: CreateLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    confirmLifeOpsBrowserSession(
      sessionId: string,
      data: ConfirmLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    completeLifeOpsBrowserSession(
      sessionId: string,
      data: CompleteLifeOpsBrowserSessionRequest,
    ): Promise<{ session: LifeOpsBrowserSession }>;
    captureLifeOpsActivitySignal(
      data: CaptureLifeOpsActivitySignalRequest,
    ): Promise<{ signal: LifeOpsActivitySignal }>;
    getLifeOpsCalendarFeed(
      options?: GetLifeOpsCalendarFeedRequest,
    ): Promise<LifeOpsCalendarFeed>;
    getLifeOpsGmailTriage(
      options?: GetLifeOpsGmailTriageRequest,
    ): Promise<LifeOpsGmailTriageFeed>;
    getLifeOpsNextCalendarEventContext(
      options?: GetLifeOpsCalendarFeedRequest,
    ): Promise<LifeOpsNextCalendarEventContext>;
    createLifeOpsCalendarEvent(
      data: CreateLifeOpsCalendarEventRequest,
    ): Promise<{ event: LifeOpsCalendarFeed["events"][number] }>;
    createLifeOpsGmailReplyDraft(
      data: CreateLifeOpsGmailReplyDraftRequest,
    ): Promise<{ draft: LifeOpsGmailReplyDraft }>;
    sendLifeOpsGmailReply(
      data: SendLifeOpsGmailReplyRequest,
    ): Promise<{ ok: true }>;
    listLifeOpsDefinitions(): Promise<{
      definitions: LifeOpsDefinitionRecord[];
    }>;
    getLifeOpsDefinition(
      definitionId: string,
    ): Promise<LifeOpsDefinitionRecord>;
    createLifeOpsDefinition(
      data: CreateLifeOpsDefinitionRequest,
    ): Promise<LifeOpsDefinitionRecord>;
    updateLifeOpsDefinition(
      definitionId: string,
      data: UpdateLifeOpsDefinitionRequest,
    ): Promise<LifeOpsDefinitionRecord>;
    listLifeOpsGoals(): Promise<{ goals: LifeOpsGoalRecord[] }>;
    getLifeOpsGoal(goalId: string): Promise<LifeOpsGoalRecord>;
    reviewLifeOpsGoal(goalId: string): Promise<LifeOpsGoalReview>;
    createLifeOpsGoal(
      data: CreateLifeOpsGoalRequest,
    ): Promise<LifeOpsGoalRecord>;
    updateLifeOpsGoal(
      goalId: string,
      data: UpdateLifeOpsGoalRequest,
    ): Promise<LifeOpsGoalRecord>;
    completeLifeOpsOccurrence(
      occurrenceId: string,
      data?: CompleteLifeOpsOccurrenceRequest,
    ): Promise<LifeOpsOccurrenceActionResult>;
    skipLifeOpsOccurrence(
      occurrenceId: string,
    ): Promise<LifeOpsOccurrenceActionResult>;
    snoozeLifeOpsOccurrence(
      occurrenceId: string,
      data: SnoozeLifeOpsOccurrenceRequest,
    ): Promise<LifeOpsOccurrenceActionResult>;
    getLifeOpsOccurrenceExplanation(
      occurrenceId: string,
    ): Promise<LifeOpsOccurrenceExplanation>;
    inspectLifeOpsReminder(
      ownerType: "occurrence" | "calendar_event",
      ownerId: string,
    ): Promise<LifeOpsReminderInspection>;
    getGoogleLifeOpsConnectorStatus(
      mode?: LifeOpsConnectorMode,
      side?: LifeOpsConnectorSide,
    ): Promise<LifeOpsGoogleConnectorStatus>;
    selectGoogleLifeOpsConnectorMode(
      data: SelectLifeOpsGoogleConnectorPreferenceRequest,
    ): Promise<LifeOpsGoogleConnectorStatus>;
    startGoogleLifeOpsConnector(
      data?: StartLifeOpsGoogleConnectorRequest,
    ): Promise<StartLifeOpsGoogleConnectorResponse>;
    disconnectGoogleLifeOpsConnector(
      data?: DisconnectLifeOpsGoogleConnectorRequest,
    ): Promise<LifeOpsGoogleConnectorStatus>;
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

const LEGACY_CHAT_COMPAT_TITLE = "Quick Chat";
const LEGACY_CHAT_CONVERSATION_STORAGE_PREFIX =
  "milady_legacy_chat_conversation";

function getLegacyChatConversationStorageKey(client: MiladyClient): string {
  const base =
    client.getBaseUrl() ||
    (typeof window !== "undefined" ? window.location.origin : "same-origin");
  return `${LEGACY_CHAT_CONVERSATION_STORAGE_PREFIX}:${encodeURIComponent(base)}`;
}

function readLegacyChatConversationId(client: MiladyClient): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.sessionStorage.getItem(
    getLegacyChatConversationStorageKey(client),
  );
  return stored?.trim() ? stored.trim() : null;
}

function writeLegacyChatConversationId(
  client: MiladyClient,
  conversationId: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const key = getLegacyChatConversationStorageKey(client);
  if (conversationId?.trim()) {
    window.sessionStorage.setItem(key, conversationId.trim());
    return;
  }
  window.sessionStorage.removeItem(key);
}

async function ensureLegacyChatConversationId(
  client: MiladyClient,
): Promise<string> {
  const cached = readLegacyChatConversationId(client);
  if (cached) {
    return cached;
  }

  const { conversation } = await client.createConversation(
    LEGACY_CHAT_COMPAT_TITLE,
  );
  writeLegacyChatConversationId(client, conversation.id);
  return conversation.id;
}

MiladyClient.prototype.sendChatRest = async function (
  this: MiladyClient,
  text,
  channelType = "DM",
  conversationMode?,
) {
  const sendToConversation = async (conversationId: string) =>
    this.sendConversationMessage(
      conversationId,
      text,
      channelType,
      undefined,
      conversationMode,
    );

  const conversationId = await ensureLegacyChatConversationId(this);
  try {
    return await sendToConversation(conversationId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ApiError" &&
      (error as ApiError).status === 404
    ) {
      writeLegacyChatConversationId(this, null);
      return sendToConversation(await ensureLegacyChatConversationId(this));
    }
    throw error;
  }
};

MiladyClient.prototype.sendChatStream = async function (
  this: MiladyClient,
  text,
  onToken,
  channelType = "DM",
  signal?,
  conversationMode?,
) {
  const streamConversation = async (conversationId: string) =>
    this.sendConversationMessageStream(
      conversationId,
      text,
      onToken,
      channelType,
      signal,
      undefined,
      conversationMode,
    );

  const conversationId = await ensureLegacyChatConversationId(this);
  try {
    return await streamConversation(conversationId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ApiError" &&
      (error as ApiError).status === 404
    ) {
      writeLegacyChatConversationId(this, null);
      return streamConversation(await ensureLegacyChatConversationId(this));
    }
    throw error;
  }
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

MiladyClient.prototype.getInboxMessages = async function (
  this: MiladyClient,
  options,
) {
  const params = new URLSearchParams();
  if (typeof options?.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (options?.sources && options.sources.length > 0) {
    params.set("sources", options.sources.join(","));
  }
  if (typeof options?.roomId === "string" && options.roomId.length > 0) {
    params.set("roomId", options.roomId);
  }
  if (
    typeof options?.roomSource === "string" &&
    options.roomSource.length > 0
  ) {
    params.set("roomSource", options.roomSource);
  }
  const query = params.toString();
  const path = query ? `/api/inbox/messages?${query}` : "/api/inbox/messages";
  return this.fetch<{
    messages: Array<ConversationMessage & { roomId: string; source: string }>;
    count: number;
  }>(path);
};

MiladyClient.prototype.getInboxSources = async function (this: MiladyClient) {
  return this.fetch<{ sources: string[] }>("/api/inbox/sources");
};

MiladyClient.prototype.getInboxChats = async function (
  this: MiladyClient,
  options,
) {
  const params = new URLSearchParams();
  if (options?.sources && options.sources.length > 0) {
    params.set("sources", options.sources.join(","));
  }
  const query = params.toString();
  const path = query ? `/api/inbox/chats?${query}` : "/api/inbox/chats";
  return this.fetch<{
    chats: Array<{
      canSend?: boolean;
      id: string;
      source: string;
      transportSource?: string;
      /** Owning server/world id when the connector exposes one. */
      worldId?: string;
      /** User-facing server/world label for selectors and section headers. */
      worldLabel: string;
      title: string;
      avatarUrl?: string;
      lastMessageText: string;
      lastMessageAt: number;
      messageCount: number;
    }>;
    count: number;
  }>(path);
};

MiladyClient.prototype.sendInboxMessage = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch<{
    ok: boolean;
    message?: ConversationMessage & { roomId: string; source: string };
  }>("/api/inbox/messages", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
    noResponseReason?: "ignored";
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
    text:
      response.noResponseReason === "ignored"
        ? ""
        : this.normalizeAssistantText(response.text),
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

MiladyClient.prototype.getMemoryFeed = async function (
  this: MiladyClient,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.before === "number")
    params.set("before", String(query.before));
  const qs = params.toString();
  return this.fetch(`/api/memories/feed${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.browseMemories = async function (
  this: MiladyClient,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (query?.entityId) params.set("entityId", query.entityId);
  if (query?.roomId) params.set("roomId", query.roomId);
  if (query?.q) params.set("q", query.q);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  const qs = params.toString();
  return this.fetch(`/api/memories/browse${qs ? `?${qs}` : ""}`);
};

MiladyClient.prototype.getMemoriesByEntity = async function (
  this: MiladyClient,
  entityId,
  query?,
) {
  const params = new URLSearchParams();
  if (query?.type) params.set("type", query.type);
  if (typeof query?.limit === "number")
    params.set("limit", String(query.limit));
  if (typeof query?.offset === "number")
    params.set("offset", String(query.offset));
  if (query?.entityIds && query.entityIds.length > 0)
    params.set("entityIds", query.entityIds.join(","));
  const qs = params.toString();
  return this.fetch(
    `/api/memories/by-entity/${encodeURIComponent(entityId)}${qs ? `?${qs}` : ""}`,
  );
};

MiladyClient.prototype.getMemoryStats = async function (this: MiladyClient) {
  return this.fetch("/api/memories/stats");
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

MiladyClient.prototype.getLifeOpsOverview = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/overview");
};

MiladyClient.prototype.getLifeOpsBrowserSettings = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/settings");
};

MiladyClient.prototype.updateLifeOpsBrowserSettings = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.listLifeOpsBrowserCompanions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/companions");
};

MiladyClient.prototype.getLifeOpsBrowserPackageStatus = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/packages");
};

MiladyClient.prototype.createLifeOpsBrowserCompanionPairing = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/companions/pair", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.buildLifeOpsBrowserCompanionPackage = async function (
  this: MiladyClient,
  browser,
) {
  return this.fetch(
    `/api/lifeops/browser/packages/${encodeURIComponent(browser)}/build`,
    {
      method: "POST",
    },
  );
};

MiladyClient.prototype.downloadLifeOpsBrowserCompanionPackage = async function (
  this: MiladyClient,
  browser,
) {
  const response = await this.rawRequest(
    `/api/lifeops/browser/packages/${encodeURIComponent(browser)}/download`,
    {
      method: "GET",
    },
  );
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await response.blob(),
    filename:
      filenameMatch?.[1] ??
      `lifeops-browser-${browser === "safari" ? "safari" : "chrome"}.zip`,
  };
};

MiladyClient.prototype.listLifeOpsBrowserTabs = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/tabs");
};

MiladyClient.prototype.getLifeOpsBrowserCurrentPage = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/current-page");
};

MiladyClient.prototype.syncLifeOpsBrowserState = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/sync", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.listLifeOpsBrowserSessions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/browser/sessions");
};

MiladyClient.prototype.getLifeOpsBrowserSession = async function (
  this: MiladyClient,
  sessionId,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}`,
  );
};

MiladyClient.prototype.createLifeOpsBrowserSession = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/browser/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.confirmLifeOpsBrowserSession = async function (
  this: MiladyClient,
  sessionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

MiladyClient.prototype.completeLifeOpsBrowserSession = async function (
  this: MiladyClient,
  sessionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/browser/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

MiladyClient.prototype.captureLifeOpsActivitySignal = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/activity-signals", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.getLifeOpsCalendarFeed = async function (
  this: MiladyClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.calendarId) {
    params.set("calendarId", options.calendarId);
  }
  if (options.timeMin) {
    params.set("timeMin", options.timeMin);
  }
  if (options.timeMax) {
    params.set("timeMax", options.timeMax);
  }
  if (options.timeZone) {
    params.set("timeZone", options.timeZone);
  }
  if (options.forceSync !== undefined) {
    params.set("forceSync", String(options.forceSync));
  }
  const query = params.toString();
  return this.fetch(`/api/lifeops/calendar/feed${query ? `?${query}` : ""}`);
};

MiladyClient.prototype.getLifeOpsGmailTriage = async function (
  this: MiladyClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.forceSync !== undefined) {
    params.set("forceSync", String(options.forceSync));
  }
  if (options.maxResults !== undefined) {
    params.set("maxResults", String(options.maxResults));
  }
  const query = params.toString();
  return this.fetch(`/api/lifeops/gmail/triage${query ? `?${query}` : ""}`);
};

MiladyClient.prototype.getLifeOpsNextCalendarEventContext = async function (
  this: MiladyClient,
  options = {},
) {
  const params = new URLSearchParams();
  if (options.mode) {
    params.set("mode", options.mode);
  }
  if (options.side) {
    params.set("side", options.side);
  }
  if (options.calendarId) {
    params.set("calendarId", options.calendarId);
  }
  if (options.timeMin) {
    params.set("timeMin", options.timeMin);
  }
  if (options.timeMax) {
    params.set("timeMax", options.timeMax);
  }
  if (options.timeZone) {
    params.set("timeZone", options.timeZone);
  }
  const query = params.toString();
  return this.fetch(
    `/api/lifeops/calendar/next-context${query ? `?${query}` : ""}`,
  );
};

MiladyClient.prototype.createLifeOpsCalendarEvent = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/calendar/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.createLifeOpsGmailReplyDraft = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/gmail/reply-drafts", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.sendLifeOpsGmailReply = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/gmail/reply-send", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.listLifeOpsDefinitions = async function (
  this: MiladyClient,
) {
  return this.fetch("/api/lifeops/definitions");
};

MiladyClient.prototype.getLifeOpsDefinition = async function (
  this: MiladyClient,
  definitionId,
) {
  return this.fetch(
    `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
  );
};

MiladyClient.prototype.createLifeOpsDefinition = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/definitions", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.updateLifeOpsDefinition = async function (
  this: MiladyClient,
  definitionId,
  data,
) {
  return this.fetch(
    `/api/lifeops/definitions/${encodeURIComponent(definitionId)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
};

MiladyClient.prototype.listLifeOpsGoals = async function (this: MiladyClient) {
  return this.fetch("/api/lifeops/goals");
};

MiladyClient.prototype.getLifeOpsGoal = async function (
  this: MiladyClient,
  goalId,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}`);
};

MiladyClient.prototype.reviewLifeOpsGoal = async function (
  this: MiladyClient,
  goalId,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}/review`);
};

MiladyClient.prototype.createLifeOpsGoal = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/goals", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.updateLifeOpsGoal = async function (
  this: MiladyClient,
  goalId,
  data,
) {
  return this.fetch(`/api/lifeops/goals/${encodeURIComponent(goalId)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.completeLifeOpsOccurrence = async function (
  this: MiladyClient,
  occurrenceId,
  data = {},
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

MiladyClient.prototype.skipLifeOpsOccurrence = async function (
  this: MiladyClient,
  occurrenceId,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/skip`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
};

MiladyClient.prototype.snoozeLifeOpsOccurrence = async function (
  this: MiladyClient,
  occurrenceId,
  data,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/snooze`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
};

MiladyClient.prototype.getLifeOpsOccurrenceExplanation = async function (
  this: MiladyClient,
  occurrenceId,
) {
  return this.fetch(
    `/api/lifeops/occurrences/${encodeURIComponent(occurrenceId)}/explanation`,
  );
};

MiladyClient.prototype.inspectLifeOpsReminder = async function (
  this: MiladyClient,
  ownerType,
  ownerId,
) {
  const params = new URLSearchParams({
    ownerType,
    ownerId,
  });
  return this.fetch(`/api/lifeops/reminders/inspection?${params.toString()}`);
};

MiladyClient.prototype.getGoogleLifeOpsConnectorStatus = async function (
  this: MiladyClient,
  mode,
  side,
) {
  const params = new URLSearchParams();
  if (mode) {
    params.set("mode", mode);
  }
  if (side) {
    params.set("side", side);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return this.fetch(`/api/lifeops/connectors/google/status${query}`);
};

MiladyClient.prototype.selectGoogleLifeOpsConnectorMode = async function (
  this: MiladyClient,
  data,
) {
  return this.fetch("/api/lifeops/connectors/google/preference", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.startGoogleLifeOpsConnector = async function (
  this: MiladyClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/google/start", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

MiladyClient.prototype.disconnectGoogleLifeOpsConnector = async function (
  this: MiladyClient,
  data = {},
) {
  return this.fetch("/api/lifeops/connectors/google/disconnect", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
  if (options?.scenarioId) params.set("scenarioId", options.scenarioId);
  if (options?.batchId) params.set("batchId", options.batchId);
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
