import { describe, expect, it } from "vitest";
import { looksLikeInboxConfirmation } from "../reflection.js";

describe("looksLikeInboxConfirmation", () => {
  it("detects explicit confirmations", () => {
    expect(looksLikeInboxConfirmation("yes")).toBe(true);
    expect(looksLikeInboxConfirmation("Yeah")).toBe(true);
    expect(looksLikeInboxConfirmation("yep")).toBe(true);
    expect(looksLikeInboxConfirmation("ok")).toBe(true);
    expect(looksLikeInboxConfirmation("sure")).toBe(true);
    expect(looksLikeInboxConfirmation("send it")).toBe(true);
    expect(looksLikeInboxConfirmation("go ahead")).toBe(true);
    expect(looksLikeInboxConfirmation("sounds good")).toBe(true);
    expect(looksLikeInboxConfirmation("do it")).toBe(true);
    expect(looksLikeInboxConfirmation("please send")).toBe(true);
    expect(looksLikeInboxConfirmation("confirmed")).toBe(true);
    expect(looksLikeInboxConfirmation("lgtm")).toBe(true);
  });

  it("rejects explicit rejections", () => {
    expect(looksLikeInboxConfirmation("no")).toBe(false);
    expect(looksLikeInboxConfirmation("nope")).toBe(false);
    expect(looksLikeInboxConfirmation("wait")).toBe(false);
    expect(looksLikeInboxConfirmation("hold on")).toBe(false);
    expect(looksLikeInboxConfirmation("change it")).toBe(false);
    expect(looksLikeInboxConfirmation("actually, let me think")).toBe(false);
    expect(looksLikeInboxConfirmation("don't send that")).toBe(false);
    expect(looksLikeInboxConfirmation("edit the message")).toBe(false);
    expect(looksLikeInboxConfirmation("not yet")).toBe(false);
    expect(looksLikeInboxConfirmation("cancel")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(looksLikeInboxConfirmation("")).toBe(false);
    expect(looksLikeInboxConfirmation("   ")).toBe(false);
  });

  it("rejects ambiguous input", () => {
    expect(looksLikeInboxConfirmation("hmm")).toBe(false);
    expect(looksLikeInboxConfirmation("what")).toBe(false);
    expect(looksLikeInboxConfirmation("can you change it instead")).toBe(false);
  });

  it("handles whitespace and casing", () => {
    expect(looksLikeInboxConfirmation("  Yes  ")).toBe(true);
    expect(looksLikeInboxConfirmation("SEND IT")).toBe(true);
    expect(looksLikeInboxConfirmation("  Go Ahead  ")).toBe(true);
  });
});
