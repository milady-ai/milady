import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ChannelType,
  type AgentRuntime,
  type Content,
  type Memory,
} from "@elizaos/core";
import { WhatsAppConnectorService } from "@elizaos/plugin-whatsapp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../test/helpers/http";
import { saveEnv } from "../../../test/helpers/test-utils";
import { startApiServer } from "../src/api/server";

describe("WhatsApp webhook roundtrip", () => {
  let closeServer: (() => Promise<void>) | null = null;
  let port = 0;
  let tempDir = "";
  let envBackup: { restore: () => void } | null = null;
  let sendMessage: ReturnType<typeof vi.fn>;
  let inboundMemory: Memory | null = null;
  let outboundMemories: Memory[] = [];
  let ensureConnection: ReturnType<typeof vi.fn>;
  let whatsappService: WhatsAppConnectorService;

  beforeAll(async () => {
    envBackup = saveEnv("ELIZA_CONFIG_PATH", "ELIZA_STATE_DIR");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-wa-roundtrip-"));
    process.env.ELIZA_CONFIG_PATH = path.join(tempDir, "milady.json");
    process.env.ELIZA_STATE_DIR = tempDir;
    fs.writeFileSync(process.env.ELIZA_CONFIG_PATH, "{}", "utf-8");

    sendMessage = vi.fn().mockResolvedValue({
      data: {
        messaging_product: "whatsapp",
        contacts: [{ input: "+14155550100", wa_id: "14155550100" }],
        messages: [{ id: "wamid.out.1" }],
      },
    });
    ensureConnection = vi.fn(async () => {});

    const runtime = {
      agentId: "whatsapp-roundtrip-agent",
      character: { name: "WhatsAppRoundtripAgent" },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      getSetting: () => undefined,
      ensureConnection,
      messageService: {
        handleMessage: vi.fn(
          async (
            _runtime: AgentRuntime,
            message: Memory,
            callback: (content: Content) => Promise<Memory[]>,
          ) => {
            inboundMemory = message;
            outboundMemories = await callback({
              text: "Roundtrip reply from agent",
            });
            return {
              didRespond: true,
              responseContent: { text: "Roundtrip reply from agent" },
              responseMessages: outboundMemories,
              state: { values: {}, data: {}, text: "" },
              mode: "simple",
            };
          },
        ),
      },
      getAgent: async () => null,
      getRoomsByWorld: async () => [],
      getService: () => null,
      getServicesByType: () => [],
    } as unknown as AgentRuntime;

    whatsappService = new WhatsAppConnectorService(runtime);
    (whatsappService as unknown as {
      config: Record<string, unknown>;
      client: Record<string, unknown>;
    }).config = {
      transport: "cloudapi",
      accessToken: "test-token",
      phoneNumberId: "1234567890",
      webhookVerifyToken: "verify-token",
    };
    (whatsappService as unknown as { client: Record<string, unknown> }).client =
      {
        sendMessage,
        stop: vi.fn(),
        on: vi.fn(),
      };

    runtime.getService = ((type: string) =>
      type === "whatsapp" ? whatsappService : null) as AgentRuntime["getService"];

    const server = await startApiServer({ port: 0, runtime });
    port = server.port;
    closeServer = server.close;
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
    envBackup?.restore();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("routes webhook deliveries through the real WhatsApp runtime service", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "+14155550999",
                  phone_number_id: "1234567890",
                },
                messages: [
                  {
                    from: "14155550100",
                    id: "wamid.in.1",
                    timestamp: "1710000000",
                    text: {
                      body: "hello from webhook route",
                    },
                    type: "text",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const response = await req(port, "POST", "/api/whatsapp/webhook", payload);

    expect(response.status).toBe(200);
    expect(response.data._raw).toBe("EVENT_RECEIVED");
    expect(ensureConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "whatsapp",
        channelId: "+14155550100",
        type: ChannelType.DM,
      }),
    );
    expect(inboundMemory?.content.text).toBe("hello from webhook route");
    expect(inboundMemory?.content.source).toBe("whatsapp");
    expect(inboundMemory?.content.from).toBe("+14155550100");
    expect(outboundMemories).toHaveLength(1);
    expect(outboundMemories[0]?.content.text).toBe(
      "Roundtrip reply from agent",
    );
    expect(outboundMemories[0]?.content.inReplyTo).toBe(inboundMemory?.id);
    expect(sendMessage).toHaveBeenCalledWith({
      type: "text",
      to: "+14155550100",
      content: "Roundtrip reply from agent",
      replyToMessageId: "wamid.in.1",
    });
    expect(whatsappService.phoneNumber).toBe("+14155550999");
  });
});
