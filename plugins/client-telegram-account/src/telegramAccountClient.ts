import {
  ChannelType,
  type Content,
  createMessageMemory,
  type HandlerCallback,
  type IAgentRuntime,
  logger,
  type Memory,
  type MemoryMetadata,
  Service,
  type UUID,
  stringToUuid,
} from "@elizaos/core";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import { type TelegramAccountConfig, validateTelegramAccountConfig } from "./environment";
import {
  loadTelegramAccountSessionString,
  saveTelegramAccountSessionString,
} from "./session";
import { escapeMarkdown, splitMessage } from "./utils";

const TELEGRAM_ACCOUNT_SERVICE_NAME = "telegram-account";

type TelegramAccountClientDeps = {
  createTelegramClient?: (
    config: TelegramAccountConfig,
    session: string,
  ) => TelegramClient;
  loadSessionString?: () => string;
  saveSessionString?: (session: string) => void;
};

type SupportedChat = Api.User | Api.Chat | Api.Channel;
type MessageService = {
  handleMessage: (
    runtime: IAgentRuntime,
    message: Memory,
    callback: HandlerCallback,
  ) => Promise<void>;
};

function serializeSession(client: TelegramClient): string {
  return (client.session as StringSession).save();
}

function createTelegramClientFromSession(
  config: TelegramAccountConfig,
  session: string,
): TelegramClient {
  return new TelegramClient(
    new StringSession(session),
    config.TELEGRAM_ACCOUNT_APP_ID,
    config.TELEGRAM_ACCOUNT_APP_HASH,
    {
      connectionRetries: 5,
      deviceModel: config.TELEGRAM_ACCOUNT_DEVICE_MODEL,
      systemVersion: config.TELEGRAM_ACCOUNT_SYSTEM_VERSION,
    },
  );
}

function getMessageService(runtime: IAgentRuntime): MessageService | null {
  if ("messageService" in runtime) {
    const withMessageService = runtime as IAgentRuntime & {
      messageService?: MessageService | null;
    };
    return withMessageService.messageService ?? null;
  }
  return null;
}

function roomUuidFor(runtime: IAgentRuntime, chatId: string): UUID {
  return stringToUuid(`tg-room:${runtime.agentId}:${chatId}`) as UUID;
}

function entityUuidFor(userId: string): UUID {
  return stringToUuid(`tg-user:${userId}`) as UUID;
}

function messageUuidFor(
  runtime: IAgentRuntime,
  roomId: UUID,
  telegramMessageId: string,
): UUID {
  return stringToUuid(
    `tg-message:${runtime.agentId}:${roomId}:${telegramMessageId}`,
  ) as UUID;
}

function resolveChatTitle(chat: SupportedChat, fallback: string): string {
  if (chat.className === "User") {
    const parts = [chat.firstName, chat.lastName].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  if ("title" in chat && typeof chat.title === "string" && chat.title.trim()) {
    return chat.title.trim();
  }

  return fallback;
}

function isSupportedChat(chat: unknown): chat is SupportedChat {
  if (!chat || typeof chat !== "object" || !("className" in chat)) {
    return false;
  }
  return (
    chat.className === "User" ||
    chat.className === "Chat" ||
    (chat.className === "Channel" && "megagroup" in chat && chat.megagroup === true)
  );
}

export class TelegramAccountClient extends Service {
  static serviceType = TELEGRAM_ACCOUNT_SERVICE_NAME;

  capabilityDescription =
    "The agent is able to send and receive messages with a Telegram account";

  private readonly runtimeRef: IAgentRuntime;
  private readonly telegramAccountConfig: TelegramAccountConfig;
  private readonly deps: Required<TelegramAccountClientDeps>;
  private client: TelegramClient | null = null;
  private account: Api.User | null = null;

  constructor(
    runtime?: IAgentRuntime,
    telegramAccountConfig?: TelegramAccountConfig,
    deps: TelegramAccountClientDeps = {},
  ) {
    super(runtime);
    if (!runtime || !telegramAccountConfig) {
      throw new Error("TelegramAccountClient requires runtime configuration");
    }

    this.runtimeRef = runtime;
    this.telegramAccountConfig = telegramAccountConfig;
    this.deps = {
      createTelegramClient:
        deps.createTelegramClient ?? createTelegramClientFromSession,
      loadSessionString:
        deps.loadSessionString ?? loadTelegramAccountSessionString,
      saveSessionString:
        deps.saveSessionString ?? saveTelegramAccountSessionString,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<TelegramAccountClient> {
    const telegramAccountConfig = await validateTelegramAccountConfig(runtime);
    const service = new TelegramAccountClient(runtime, telegramAccountConfig);
    await service.startService();
    return service;
  }

  static registerSendHandlers(
    runtime: IAgentRuntime,
    service: TelegramAccountClient,
  ): void {
    const register = (source: string) => {
      runtime.registerSendHandler(source, async (_runtime, target, content) => {
        const text =
          typeof content.text === "string" ? content.text.trim() : "";
        if (!text) {
          return;
        }

        const room =
          target.roomId && typeof runtime.getRoom === "function"
            ? await runtime.getRoom(target.roomId)
            : null;
        const roomMetadata = room?.metadata as Record<string, unknown> | undefined;
        const chatId = String(
          target.channelId ?? room?.channelId ?? roomMetadata?.telegramChatId ?? "",
        ).trim();
        if (!chatId) {
          throw new Error("Telegram target is missing a chat identifier");
        }

        let replyToTelegramMessageId: number | undefined;
        if (
          typeof content.inReplyTo === "string" &&
          content.inReplyTo.trim().length > 0
        ) {
          const repliedToMemory = await runtime.getMemoryById(
            content.inReplyTo as UUID,
          );
          const repliedToMetadata = repliedToMemory?.metadata as
            | Record<string, unknown>
            | undefined;
          const telegramMessageId = repliedToMetadata?.telegramMessageId;
          if (typeof telegramMessageId === "number") {
            replyToTelegramMessageId = telegramMessageId;
          }
        }

        const sentMessages = await service.sendMessageToChatId(chatId, {
          ...content,
          text,
        }, replyToTelegramMessageId);

        if (!target.roomId || sentMessages.length === 0) {
          return;
        }

        for (const [index, sentMessage] of sentMessages.entries()) {
          const memory = createMessageMemory({
            id: messageUuidFor(
              runtime,
              target.roomId,
              sentMessage.id.toString(),
            ),
            agentId: runtime.agentId,
            entityId: runtime.agentId,
            roomId: target.roomId,
            content: {
              ...content,
              action:
                index < sentMessages.length - 1 ? "CONTINUE" : content.action,
              source: TELEGRAM_ACCOUNT_SERVICE_NAME,
              text: sentMessage.message ?? text,
            },
          }) as Memory;

          memory.createdAt = sentMessage.date * 1000;
          memory.metadata = {
            ...(memory.metadata ?? {}),
            telegramChatId: chatId,
            telegramMessageId: sentMessage.id,
          } as MemoryMetadata;

          await runtime.createMemory(memory, "messages");
        }
      });
    };

    register(TELEGRAM_ACCOUNT_SERVICE_NAME);
    const sendHandlers = (runtime as unknown as { sendHandlers?: unknown })
      .sendHandlers;
    if (!(sendHandlers instanceof Map) || !sendHandlers.has("telegram")) {
      register("telegram");
    }
  }

  private async startService(): Promise<void> {
    logger.info("Starting Telegram account service...");
    await this.initializeAccount();
    this.setupEventsHandlers();
    logger.success(
      `Telegram account service started for ${this.runtimeRef.character.name}`,
    );
  }

  private async initializeAccount(): Promise<void> {
    const session = this.deps.loadSessionString().trim();
    if (!session) {
      throw new Error(
        "Telegram account session is missing. Complete Telegram account login in connector setup first.",
      );
    }

    const client = this.deps.createTelegramClient(
      this.telegramAccountConfig,
      session,
    );
    await client.connect();
    if (!(await client.checkAuthorization())) {
      await client.disconnect();
      throw new Error(
        "Telegram account session is no longer authorized. Reconnect the Telegram account from connector setup.",
      );
    }

    this.deps.saveSessionString(serializeSession(client));
    this.client = client;
    this.account = (await client.getEntity("me")) as Api.User;
  }

  private setupEventsHandlers(): void {
    this.client?.addEventHandler(
      async (event: NewMessageEvent) => {
        await this.handleIncomingMessage(event);
      },
      new NewMessage({ incoming: true }),
    );
  }

  private async handleIncomingMessage(event: NewMessageEvent): Promise<void> {
    try {
      if (!this.client || !this.account) {
        return;
      }

      const sender = await event.message.getSender();
      const chat = await event.message.getChat();
      if (!sender || sender.className !== "User" || !chat || !isSupportedChat(chat)) {
        return;
      }

      const senderId = sender.id.toString();
      const chatId = chat.id.toString();
      const entityId = entityUuidFor(senderId);
      const roomId = roomUuidFor(this.runtimeRef, chatId);
      const messageId = messageUuidFor(
        this.runtimeRef,
        roomId,
        event.message.id.toString(),
      );
      const replyMessage = event.message.replyTo
        ? await event.message.getReplyMessage()
        : null;
      const replyMessageId =
        replyMessage && typeof replyMessage.id === "number"
          ? messageUuidFor(this.runtimeRef, roomId, replyMessage.id.toString())
          : undefined;
      const senderName = resolveChatTitle(sender, sender.username ?? senderId);
      const roomName = resolveChatTitle(chat, senderName);
      const channelType =
        chat.className === "User" ? ChannelType.DM : ChannelType.GROUP;

      await this.runtimeRef.ensureConnection({
        entityId,
        roomId,
        roomName,
        userName: sender.username ?? undefined,
        worldId: stringToUuid(
          `telegram-account-world:${this.runtimeRef.agentId}`,
        ) as UUID,
        worldName: "Telegram",
        name: senderName,
        source: TELEGRAM_ACCOUNT_SERVICE_NAME,
        channelId: chatId,
        type: channelType,
        metadata: {
          telegramChatId: chatId,
          telegramPeerClass: chat.className,
          telegramUserId: senderId,
        },
      });

      const messageText =
        typeof event.message.message === "string" &&
        event.message.message.trim().length > 0
          ? event.message.message
          : event.message.media
            ? `[${event.message.media.className}]`
            : "";
      const memory = createMessageMemory({
        id: messageId,
        agentId: this.runtimeRef.agentId,
        entityId,
        roomId,
        content: {
          source: TELEGRAM_ACCOUNT_SERVICE_NAME,
          text: messageText,
          ...(replyMessageId ? { inReplyTo: replyMessageId } : {}),
        },
      }) as Memory;
      memory.createdAt = event.message.date * 1000;
      memory.metadata = {
        ...(memory.metadata ?? {}),
        entityName: senderName,
        entityUserName: sender.username ?? undefined,
        fromId: senderId,
        telegramChatId: chatId,
        telegramMessageId: event.message.id,
        telegramPeerClass: chat.className,
      } as MemoryMetadata;

      await this.runtimeRef.createMemory(memory, "messages");

      const room = await this.runtimeRef.getRoom(roomId);
      if (!room) {
        return;
      }

      await this.processMessage(
        memory,
        room,
        chatId,
        chat.className === "User" ? undefined : event.message.id,
      );
    } catch (error) {
      logger.error("Error handling Telegram account message:", error);
    }
  }

  private async processMessage(
    memory: Memory,
    room: { id?: UUID; channelId?: string | null },
    chatId: string,
    replyToMessageId?: number,
  ): Promise<boolean> {
    const messageService = getMessageService(this.runtimeRef);
    if (!messageService || !room.id) {
      return false;
    }

    const callback: HandlerCallback = async (
      responseContent: Content,
    ): Promise<Memory[]> => {
      const sentMessages = await this.sendMessageToChatId(
        chatId,
        responseContent,
        replyToMessageId,
      );

      const memories: Memory[] = [];
      for (let index = 0; index < sentMessages.length; index += 1) {
        const sentMessage = sentMessages[index];
        if (!sentMessage) {
          continue;
        }

        const outbound = createMessageMemory({
          id: messageUuidFor(
            this.runtimeRef,
            room.id,
            sentMessage.id.toString(),
          ),
          agentId: this.runtimeRef.agentId,
          entityId: this.runtimeRef.agentId,
          roomId: room.id,
          content: {
            ...responseContent,
            action:
              index < sentMessages.length - 1
                ? "CONTINUE"
                : responseContent.action,
            source: TELEGRAM_ACCOUNT_SERVICE_NAME,
            text: sentMessage.message ?? responseContent.text ?? "",
            inReplyTo: memory.id,
          },
        }) as Memory;
        outbound.createdAt = sentMessage.date * 1000;
        outbound.metadata = {
          ...(outbound.metadata ?? {}),
          telegramChatId: chatId,
          telegramMessageId: sentMessage.id,
        } as MemoryMetadata;
        await this.runtimeRef.createMemory(outbound, "messages");
        memories.push(outbound);
      }

      return memories;
    };

    await messageService.handleMessage(this.runtimeRef, memory, callback);
    return true;
  }

  async sendMessageToChatId(
    chatId: string,
    content: Content,
    replyToMessageId?: number,
  ): Promise<Api.Message[]> {
    if (!this.client) {
      throw new Error("Telegram account client is not initialized");
    }

    if (content.attachments && content.attachments.length > 0) {
      await Promise.all(
        content.attachments.map(async (attachment) => {
          await this.client?.sendFile(bigInt(chatId), {
            caption: attachment.description,
            file: attachment.url,
            forceDocument: true,
            replyTo: replyToMessageId,
          });
        }),
      );
    }

    const chunks = splitMessage(content.text ?? "");
    const sentMessages: Api.Message[] = [];

    for (const chunkText of chunks) {
      const chunk = escapeMarkdown(chunkText);
      const sentMessage = await this.client.sendMessage(bigInt(chatId), {
        message: chunk,
        parseMode: "markdown",
        replyTo: replyToMessageId,
      });
      sentMessages.push(sentMessage);
    }

    return sentMessages;
  }

  isConnected(): boolean {
    return this.client !== null && this.account !== null;
  }

  getAccountSummary(): {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null {
    if (!this.account) {
      return null;
    }
    return {
      id: this.account.id.toString(),
      username:
        typeof this.account.username === "string" ? this.account.username : null,
      firstName:
        typeof this.account.firstName === "string" ? this.account.firstName : null,
      lastName:
        typeof this.account.lastName === "string" ? this.account.lastName : null,
      phone: typeof this.account.phone === "string" ? this.account.phone : null,
    };
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.deps.saveSessionString(serializeSession(this.client));
    }
    await this.client?.disconnect();
    this.client = null;
  }
}
