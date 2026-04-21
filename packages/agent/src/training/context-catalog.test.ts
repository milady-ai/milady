import { describe, expect, it } from "vitest";
import {
  resolveActionContextResolution,
  resolveProviderContextResolution,
} from "./context-catalog.js";

describe("context catalog conversation context entries", () => {
  it("classifies conversation context actions explicitly", () => {
    expect(resolveActionContextResolution("READ_CHANNEL")).toEqual({
      contexts: ["knowledge", "social"],
      source: "catalog",
    });
    expect(resolveActionContextResolution("SEARCH_CONVERSATIONS")).toEqual({
      contexts: ["knowledge", "social"],
      source: "catalog",
    });
    expect(resolveActionContextResolution("SEARCH_ENTITY")).toEqual({
      contexts: ["social", "knowledge"],
      source: "catalog",
    });
    expect(resolveActionContextResolution("READ_ENTITY")).toEqual({
      contexts: ["social", "knowledge"],
      source: "catalog",
    });
  });

  it("classifies personality routing actions explicitly", () => {
    expect(resolveActionContextResolution("MODIFY_CHARACTER")).toEqual({
      contexts: ["social", "system"],
      source: "catalog",
    });
  });

  it("classifies conversation context providers explicitly", () => {
    expect(resolveProviderContextResolution("recent-conversations")).toEqual({
      contexts: ["knowledge", "social"],
      source: "catalog",
    });
    expect(resolveProviderContextResolution("relevant-conversations")).toEqual({
      contexts: ["knowledge", "social"],
      source: "catalog",
    });
    expect(resolveProviderContextResolution("rolodex")).toEqual({
      contexts: ["social", "knowledge"],
      source: "catalog",
    });
  });

  it("classifies personality routing providers explicitly", () => {
    expect(resolveProviderContextResolution("userPersonalityPreferences")).toEqual({
      contexts: ["social"],
      source: "catalog",
    });
  });
});
