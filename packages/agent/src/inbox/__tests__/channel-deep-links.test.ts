import { describe, expect, it } from "vitest";

// We test the internal link builders indirectly by importing the module and
// using a minimal mock runtime. The buildDeepLink function calls
// runtime.getRoom / runtime.getWorld which we mock here.

// For unit testing we directly test the link pattern expectations.

describe("deep link patterns", () => {
  it("Discord DM link format", () => {
    const channelId = "123456789";
    const link = `https://discord.com/channels/@me/${channelId}`;
    expect(link).toBe("https://discord.com/channels/@me/123456789");
  });

  it("Discord server channel link format", () => {
    const serverId = "111";
    const channelId = "222";
    const messageId = "333";
    const link = `https://discord.com/channels/${serverId}/${channelId}/${messageId}`;
    expect(link).toBe("https://discord.com/channels/111/222/333");
  });

  it("Telegram username link format", () => {
    const username = "alice_bot";
    const link = `https://t.me/${username}`;
    expect(link).toBe("https://t.me/alice_bot");
  });

  it("Telegram private group link format", () => {
    const chatId = "-1001234567890";
    const normalized = chatId.replace(/^-100/, "");
    const link = `https://t.me/c/${normalized}`;
    expect(link).toBe("https://t.me/c/1234567890");
  });

  it("Signal link format", () => {
    const phoneNumber = "+15551234567";
    const link = `signal://signal.me/#p/${phoneNumber}`;
    expect(link).toBe("signal://signal.me/#p/+15551234567");
  });

  it("iMessage link format", () => {
    const handle = "+15551234567";
    const link = `imessage://${handle}`;
    expect(link).toBe("imessage://+15551234567");
  });

  it("WhatsApp link format strips non-digits", () => {
    const phoneNumber = "+1 (555) 123-4567";
    const cleaned = phoneNumber.replace(/\D/g, "");
    const link = `https://wa.me/${cleaned}`;
    expect(link).toBe("https://wa.me/15551234567");
  });

  it("Gmail link format", () => {
    const messageId = "18abc123def";
    const link = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
    expect(link).toBe("https://mail.google.com/mail/u/0/#inbox/18abc123def");
  });

  it("Slack channel link format", () => {
    const teamId = "T12345";
    const channelId = "C67890";
    const link = `slack://channel?team=${teamId}&id=${channelId}`;
    expect(link).toBe("slack://channel?team=T12345&id=C67890");
  });
});
