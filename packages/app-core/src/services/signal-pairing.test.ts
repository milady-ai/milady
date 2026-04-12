import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifySignalPairingErrorStatus,
  extractSignalCliProvisioningUrl,
  parseSignalCliAccountsOutput,
  type SignalPairingEvent,
  SignalPairingSession,
  sanitizeAccountId,
  signalAuthExists,
} from "./signal-pairing";

describe("signal-pairing", () => {
  describe("sanitizeAccountId", () => {
    it("accepts alphanumeric IDs with dashes and underscores", () => {
      expect(sanitizeAccountId("signal-account_01")).toBe("signal-account_01");
    });

    it("rejects invalid path-like input", () => {
      expect(() => sanitizeAccountId("../evil")).toThrow("Invalid accountId");
      expect(() => sanitizeAccountId("has space")).toThrow("Invalid accountId");
    });
  });

  describe("signalAuthExists", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns false when auth data is missing", () => {
      expect(signalAuthExists(tmpDir)).toBe(false);
    });

    it("returns false when accounts.json is missing or empty", () => {
      const authDir = path.join(tmpDir, "signal-auth", "default");
      fs.mkdirSync(path.join(authDir, "data"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(authDir, "data", "accounts.json"),
        JSON.stringify({ accounts: [] }),
      );

      expect(signalAuthExists(tmpDir)).toBe(false);
    });

    it("returns true when a linked account is recorded", () => {
      const authDir = path.join(tmpDir, "signal-auth", "default");
      fs.mkdirSync(path.join(authDir, "data"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(authDir, "data", "accounts.json"),
        JSON.stringify({ accounts: ["+15551234567"] }),
      );

      expect(signalAuthExists(tmpDir)).toBe(true);
    });
  });

  describe("SignalPairingSession", () => {
    let events: SignalPairingEvent[];
    let session: SignalPairingSession;

    beforeEach(() => {
      events = [];
      session = new SignalPairingSession({
        authDir: "/tmp/test-signal-auth",
        accountId: "test-account",
        onEvent: (event) => events.push(event),
      });
    });

    it("starts in idle state", () => {
      expect(session.getStatus()).toBe("idle");
      expect(session.getSnapshot()).toEqual({
        status: "idle",
        qrDataUrl: null,
        phoneNumber: null,
        error: null,
      });
    });

    it("stop() is safe before start()", () => {
      expect(() => session.stop()).not.toThrow();
      expect(events).toHaveLength(0);
    });
  });

  describe("classifySignalPairingErrorStatus", () => {
    it("maps timeout-like failures to timeout", () => {
      expect(
        classifySignalPairingErrorStatus("Provisioning link timed out"),
      ).toBe("timeout");
      expect(
        classifySignalPairingErrorStatus("QR code expired before scan"),
      ).toBe("timeout");
    });

    it("maps other failures to error", () => {
      expect(classifySignalPairingErrorStatus("network refused")).toBe("error");
    });
  });

  describe("signal-cli helpers", () => {
    it("extracts provisioning URLs from signal-cli output", () => {
      expect(
        extractSignalCliProvisioningUrl(
          "sgnl://linkdevice?uuid=test&pub_key=value",
        ),
      ).toBe("sgnl://linkdevice?uuid=test&pub_key=value");
      expect(extractSignalCliProvisioningUrl("not-a-link")).toBeNull();
    });

    it("parses linked accounts from JSON or plain text output", () => {
      expect(
        parseSignalCliAccountsOutput('["+15551234567"]'),
      ).toBe("+15551234567");
      expect(parseSignalCliAccountsOutput("+15559876543\n")).toBe(
        "+15559876543",
      );
      expect(parseSignalCliAccountsOutput("")).toBeNull();
    });
  });
});
