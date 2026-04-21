import { describe, expect, it } from "vitest";
import {
  resolveProactiveDeliverySource,
  resolveProactiveOwnerContact,
} from "./proactive-worker.js";

describe("proactive worker routing", () => {
  it("maps app activity platforms back to client_chat delivery", () => {
    expect(resolveProactiveDeliverySource("web_app")).toBe("client_chat");
    expect(resolveProactiveDeliverySource("desktop_app")).toBe("client_chat");
    expect(resolveProactiveDeliverySource("mobile_app")).toBe("client_chat");
  });

  it("falls back to the owner entity for in-app proactive delivery", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "web_app",
        ownerEntityId: "owner-entity-1",
        ownerContacts: {},
      }),
    ).toEqual({
      source: "client_chat",
      contact: { entityId: "owner-entity-1" },
    });
  });

  it("reuses configured owner contacts for external channels", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "telegram",
        ownerEntityId: "owner-entity-1",
        ownerContacts: {
          telegram: {
            entityId: "owner-telegram-entity",
            channelId: "12345",
          },
        },
      }),
    ).toEqual({
      source: "telegram",
      contact: {
        entityId: "owner-telegram-entity",
        channelId: "12345",
      },
    });
  });

  it("falls back to the owner entity for discord proactive delivery", () => {
    expect(
      resolveProactiveOwnerContact({
        targetPlatform: "discord",
        ownerEntityId: "owner-discord-uuid",
        ownerContacts: {},
      }),
    ).toEqual({
      source: "discord",
      contact: { entityId: "owner-discord-uuid" },
    });
  });
});
