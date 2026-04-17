import { describe, expect, test, vi } from "vitest";
import {
  type AutofillBridge,
  type AutofillBridgeRequest,
  type AutofillBridgeResponse,
  AutofillEngine,
} from "./autofill-engine.js";

function makeBridge(
  name: string,
  respond: (req: AutofillBridgeRequest) => AutofillBridgeResponse,
): AutofillBridge & { readonly calls: AutofillBridgeRequest[] } {
  const calls: AutofillBridgeRequest[] = [];
  return {
    name,
    calls,
    async requestFill(req) {
      calls.push(req);
      return respond(req);
    },
  };
}

describe("AutofillEngine whitelist enforcement", () => {
  test("refuses non-whitelisted domain even when a bridge is ready", async () => {
    const bridge = makeBridge("1password", () => ({
      success: true,
      filledFields: ["password"],
    }));
    const engine = new AutofillEngine({
      whitelist: ["github.com"],
      bridges: [bridge],
    });
    const result = await engine.execute({
      tabUrl: "http://sketchy-phishing-clone.example/login",
      fieldPurpose: "password",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("not-whitelisted");
    }
    expect(bridge.calls).toHaveLength(0);
  });

  test("fills on whitelisted subdomain via parent-domain entry", async () => {
    const bridge = makeBridge("1password", () => ({
      success: true,
      filledFields: ["email", "password"],
    }));
    const engine = new AutofillEngine({
      whitelist: ["google.com"],
      bridges: [bridge],
    });
    const result = await engine.execute({
      tabUrl: "https://mail.google.com/",
      fieldPurpose: "password",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.bridge).toBe("1password");
      expect(result.matchedDomain).toBe("google.com");
      expect(result.filledFields).toEqual(["email", "password"]);
    }
    expect(bridge.calls).toHaveLength(1);
  });
});

describe("AutofillEngine bridge degradation", () => {
  test("falls through to next bridge when first is uninstalled", async () => {
    const onePassword = makeBridge("1password", () => ({
      success: false,
      reason: "password-manager-not-installed",
    }));
    const protonPass = makeBridge("protonpass", () => ({
      success: true,
      filledFields: ["password"],
    }));
    const engine = new AutofillEngine({
      whitelist: ["github.com"],
      bridges: [onePassword, protonPass],
    });
    const result = await engine.execute({
      tabUrl: "https://github.com/login",
      fieldPurpose: "password",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.bridge).toBe("protonpass");
    expect(onePassword.calls).toHaveLength(1);
    expect(protonPass.calls).toHaveLength(1);
  });

  test("returns last reason when no bridge succeeds", async () => {
    const onePassword = makeBridge("1password", () => ({
      success: false,
      reason: "password-manager-not-installed",
    }));
    const protonPass = makeBridge("protonpass", () => ({
      success: false,
      reason: "password-manager-not-installed",
    }));
    const engine = new AutofillEngine({
      whitelist: ["github.com"],
      bridges: [onePassword, protonPass],
    });
    const result = await engine.execute({
      tabUrl: "https://github.com/login",
      fieldPurpose: "password",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("password-manager-not-installed");
    }
  });

  test("reports no-bridge-available when bridges array is empty", async () => {
    const engine = new AutofillEngine({
      whitelist: ["github.com"],
      bridges: [],
    });
    const result = await engine.execute({
      tabUrl: "https://github.com/login",
      fieldPurpose: "password",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("no-bridge-available");
  });
});

describe("AutofillEngine logs refusals", () => {
  test("does not throw on invalid URL; returns invalid-url", async () => {
    const bridge = makeBridge("1password", () => ({
      success: true,
      filledFields: [],
    }));
    const engine = new AutofillEngine({
      whitelist: ["github.com"],
      bridges: [bridge],
    });
    const result = await engine.execute({
      tabUrl: "",
      fieldPurpose: "email",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe("invalid-url");
    expect(bridge.calls).toHaveLength(0);
  });
});

describe("password-manager bridge graceful degradation", () => {
  test("maps 'Could not establish connection' to password-manager-not-installed", async () => {
    const { createOnePasswordBridge } = await import("./onepassword-bridge.js");
    const runtime = {
      sendMessage: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Could not establish connection. Receiving end does not exist.",
          ),
        ),
    };
    const bridge = createOnePasswordBridge({ runtime });
    const response = await bridge.requestFill({
      tabUrl: "https://github.com/login",
      fieldPurpose: "password",
    });
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.reason).toBe("password-manager-not-installed");
    }
  });

  test("ProtonPass bridge maps same error", async () => {
    const { createProtonPassBridge } = await import("./protonpass-bridge.js");
    const runtime = {
      sendMessage: vi
        .fn()
        .mockRejectedValue(new Error("Receiving end does not exist.")),
    };
    const bridge = createProtonPassBridge({ runtime });
    const response = await bridge.requestFill({
      tabUrl: "https://github.com/login",
      fieldPurpose: "password",
    });
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.reason).toBe("password-manager-not-installed");
    }
  });
});
