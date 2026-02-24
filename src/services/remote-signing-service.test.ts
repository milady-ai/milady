/**
 * Unit tests for remote-signing-service.ts — remote transaction signing with
 * policy evaluation, human approval workflows, and audit logging.
 *
 * Covers:
 * - Construction and configuration
 * - Policy-allowed signing (happy path)
 * - Policy-rejected signing
 * - Human confirmation workflow (queue → approve / reject / expire)
 * - Signer failures
 * - Audit logging integration
 * - Pending approval management
 * - Policy updates
 *
 * @see remote-signing-service.ts
 * @see signing-policy.ts — the policy evaluator tested separately
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SandboxAuditLog } from "../security/audit-log";
import {
  RemoteSigningService,
  type SignerBackend,
} from "./remote-signing-service";
import type { SigningPolicy, SigningRequest } from "./signing-policy";

// ── Helpers ──────────────────────────────────────────────────────────────

function createMockSigner(
  overrides: Partial<SignerBackend> = {},
): SignerBackend {
  return {
    getAddress: vi.fn().mockResolvedValue("0xAgentWallet"),
    signMessage: vi.fn().mockResolvedValue("0xSignedMessage"),
    signTransaction: vi.fn().mockResolvedValue("0xSignedTx"),
    ...overrides,
  };
}

function createMockAuditLog() {
  return { record: vi.fn() } as unknown as SandboxAuditLog & {
    record: ReturnType<typeof vi.fn>;
  };
}

/** Permissive policy that allows everything on chain 1. */
function permissivePolicy(): SigningPolicy {
  return {
    allowedChainIds: [1],
    allowedContracts: [],
    deniedContracts: [],
    maxTransactionValueWei: "1000000000000000000000", // 1000 ETH
    maxTransactionsPerHour: 100,
    maxTransactionsPerDay: 500,
    allowedMethodSelectors: [],
    humanConfirmationThresholdWei: "999999000000000000000", // very high
    requireHumanConfirmation: false,
  };
}

/** Restrictive policy that blocks everything. */
function restrictivePolicy(): SigningPolicy {
  return {
    allowedChainIds: [999], // only fake chain
    allowedContracts: [],
    deniedContracts: [],
    maxTransactionValueWei: "0",
    maxTransactionsPerHour: 0,
    maxTransactionsPerDay: 0,
    allowedMethodSelectors: [],
    humanConfirmationThresholdWei: "0",
    requireHumanConfirmation: false,
  };
}

/** Policy that requires human confirmation for any value. */
function humanConfirmPolicy(): SigningPolicy {
  return {
    allowedChainIds: [1],
    allowedContracts: [],
    deniedContracts: [],
    maxTransactionValueWei: "1000000000000000000000",
    maxTransactionsPerHour: 100,
    maxTransactionsPerDay: 500,
    allowedMethodSelectors: [],
    humanConfirmationThresholdWei: "0", // always requires confirmation
    requireHumanConfirmation: false,
  };
}

function makeRequest(overrides: Partial<SigningRequest> = {}): SigningRequest {
  return {
    requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    chainId: 1,
    to: "0xContractAddress",
    value: "0",
    data: "0x",
    nonce: 0,
    gasLimit: "21000",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("RemoteSigningService", () => {
  let signer: SignerBackend;
  let auditLog: ReturnType<typeof createMockAuditLog>;
  let service: RemoteSigningService;

  beforeEach(() => {
    vi.clearAllMocks();
    signer = createMockSigner();
    auditLog = createMockAuditLog();
    service = new RemoteSigningService({
      signer,
      policy: permissivePolicy(),
      auditLog,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================================================================
  //  1. Construction
  // ===================================================================

  describe("constructor", () => {
    it("creates service with required config", () => {
      const s = new RemoteSigningService({ signer });
      expect(s).toBeInstanceOf(RemoteSigningService);
    });

    it("creates service with all config options", () => {
      const s = new RemoteSigningService({
        signer,
        policy: permissivePolicy(),
        auditLog,
        approvalTimeoutMs: 60_000,
      });
      expect(s).toBeInstanceOf(RemoteSigningService);
    });
  });

  // ===================================================================
  //  2. getAddress
  // ===================================================================

  describe("getAddress", () => {
    it("delegates to signer backend", async () => {
      const addr = await service.getAddress();
      expect(addr).toBe("0xAgentWallet");
      expect(signer.getAddress).toHaveBeenCalledOnce();
    });
  });

  // ===================================================================
  //  3. submitSigningRequest — policy allowed
  // ===================================================================

  describe("submitSigningRequest — allowed", () => {
    it("signs transaction when policy allows", async () => {
      const request = makeRequest();
      const result = await service.submitSigningRequest(request);

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xSignedTx");
      expect(result.policyDecision.allowed).toBe(true);
      expect(result.humanConfirmed).toBe(false);
    });

    it("passes correct tx fields to signer", async () => {
      const request = makeRequest({
        to: "0xTarget",
        value: "1000",
        data: "0xDeadBeef",
        chainId: 1,
        nonce: 42,
        gasLimit: "50000",
      });
      await service.submitSigningRequest(request);

      expect(signer.signTransaction).toHaveBeenCalledWith({
        to: "0xTarget",
        value: "1000",
        data: "0xDeadBeef",
        chainId: 1,
        nonce: 42,
        gasLimit: "50000",
      });
    });

    it("records audit log on submission", async () => {
      const request = makeRequest();
      await service.submitSigningRequest(request);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_submitted",
          severity: "info",
        }),
      );
    });

    it("records audit log on successful sign", async () => {
      const request = makeRequest();
      await service.submitSigningRequest(request);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_approved",
          severity: "info",
        }),
      );
    });

    it("works without audit log", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: permissivePolicy(),
      });
      const result = await s.submitSigningRequest(makeRequest());
      expect(result.success).toBe(true);
    });
  });

  // ===================================================================
  //  4. submitSigningRequest — policy rejected
  // ===================================================================

  describe("submitSigningRequest — rejected", () => {
    it("rejects when policy denies the request", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: restrictivePolicy(),
        auditLog,
      });
      const result = await s.submitSigningRequest(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.policyDecision.allowed).toBe(false);
      expect(result.humanConfirmed).toBe(false);
    });

    it("does not call signer when rejected", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: restrictivePolicy(),
      });
      await s.submitSigningRequest(makeRequest());

      expect(signer.signTransaction).not.toHaveBeenCalled();
    });

    it("records rejection in audit log", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: restrictivePolicy(),
        auditLog,
      });
      await s.submitSigningRequest(makeRequest());

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          severity: "warn",
        }),
      );
    });
  });

  // ===================================================================
  //  5. Human confirmation workflow
  // ===================================================================

  describe("human confirmation", () => {
    let confirmService: RemoteSigningService;

    beforeEach(() => {
      confirmService = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        auditLog,
        approvalTimeoutMs: 5 * 60 * 1000,
      });
    });

    it("queues request for approval when human confirmation required", async () => {
      const request = makeRequest({ value: "1000000000000000000" }); // 1 ETH
      const result = await confirmService.submitSigningRequest(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Human confirmation required");
      expect(result.policyDecision.requiresHumanConfirmation).toBe(true);
      expect(result.humanConfirmed).toBe(false);
    });

    it("does not sign until approved", async () => {
      const request = makeRequest({ value: "1000000000000000000" });
      await confirmService.submitSigningRequest(request);

      expect(signer.signTransaction).not.toHaveBeenCalled();
    });

    it("signs after human approval", async () => {
      const request = makeRequest({ value: "1000000000000000000" });
      await confirmService.submitSigningRequest(request);

      const result = await confirmService.approveRequest(request.requestId);

      expect(result.success).toBe(true);
      expect(result.signature).toBe("0xSignedTx");
      expect(result.humanConfirmed).toBe(true);
    });

    it("lists pending approvals", async () => {
      const req1 = makeRequest({
        requestId: "req-1",
        value: "1000000000000000000",
      });
      const req2 = makeRequest({
        requestId: "req-2",
        value: "2000000000000000000",
      });
      await confirmService.submitSigningRequest(req1);
      await confirmService.submitSigningRequest(req2);

      const pending = confirmService.getPendingApprovals();
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.requestId)).toContain("req-1");
      expect(pending.map((p) => p.requestId)).toContain("req-2");
    });

    it("removes pending approval after approve", async () => {
      const request = makeRequest({ value: "1000000000000000000" });
      await confirmService.submitSigningRequest(request);

      expect(confirmService.getPendingApprovals()).toHaveLength(1);

      await confirmService.approveRequest(request.requestId);

      expect(confirmService.getPendingApprovals()).toHaveLength(0);
    });
  });

  // ===================================================================
  //  6. approveRequest edge cases
  // ===================================================================

  describe("approveRequest", () => {
    it("returns error for unknown request ID", async () => {
      const result = await service.approveRequest("nonexistent-id");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No pending approval");
      expect(result.humanConfirmed).toBe(false);
    });

    it("rejects expired approval", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        approvalTimeoutMs: 1, // 1ms timeout
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 10));

      const result = await s.approveRequest(request.requestId);

      expect(result.success).toBe(false);
      expect(result.error).toContain("expired");
    });

    it("cleans up expired approval from pending map", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        approvalTimeoutMs: 1,
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      await new Promise((r) => setTimeout(r, 10));
      await s.approveRequest(request.requestId);

      expect(s.getPendingApprovals()).toHaveLength(0);
    });
  });

  // ===================================================================
  //  7. rejectRequest
  // ===================================================================

  describe("rejectRequest", () => {
    it("returns true when rejecting existing request", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        auditLog,
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      const result = s.rejectRequest(request.requestId);
      expect(result).toBe(true);
    });

    it("returns false when rejecting nonexistent request", () => {
      const result = service.rejectRequest("nonexistent-id");
      expect(result).toBe(false);
    });

    it("removes request from pending approvals", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      expect(s.getPendingApprovals()).toHaveLength(1);

      s.rejectRequest(request.requestId);

      expect(s.getPendingApprovals()).toHaveLength(0);
    });

    it("records rejection in audit log", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        auditLog,
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      s.rejectRequest(request.requestId);

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          summary: expect.stringContaining("Human rejected"),
        }),
      );
    });

    it("does not record audit when rejecting nonexistent request", () => {
      service.rejectRequest("nonexistent-id");
      // Only the constructor-related calls, no rejection recorded
      const rejectionCalls = (
        auditLog.record as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "signing_request_rejected",
      );
      expect(rejectionCalls).toHaveLength(0);
    });
  });

  // ===================================================================
  //  8. getPendingApprovals
  // ===================================================================

  describe("getPendingApprovals", () => {
    it("returns empty array when no pending approvals", () => {
      expect(service.getPendingApprovals()).toEqual([]);
    });

    it("cleans expired approvals automatically", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        approvalTimeoutMs: 1,
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      await new Promise((r) => setTimeout(r, 10));

      expect(s.getPendingApprovals()).toHaveLength(0);
    });

    it("returns non-expired approvals", async () => {
      const s = new RemoteSigningService({
        signer,
        policy: humanConfirmPolicy(),
        approvalTimeoutMs: 60_000,
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      const pending = s.getPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0].requestId).toBe(request.requestId);
      expect(pending[0].request).toBe(request);
      expect(pending[0].createdAt).toBeLessThanOrEqual(Date.now());
      expect(pending[0].expiresAt).toBeGreaterThan(Date.now());
    });
  });

  // ===================================================================
  //  9. Policy management
  // ===================================================================

  describe("policy management", () => {
    it("getPolicy returns current policy", () => {
      const policy = service.getPolicy();
      expect(policy.allowedChainIds).toEqual([1]);
    });

    it("updatePolicy changes the active policy", () => {
      service.updatePolicy(restrictivePolicy());

      const policy = service.getPolicy();
      expect(policy.allowedChainIds).toEqual([999]);
    });

    it("updatePolicy records audit log", () => {
      service.updatePolicy(restrictivePolicy());

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "policy_decision",
          summary: "Signing policy updated",
          severity: "warn",
        }),
      );
    });

    it("updated policy applies to subsequent requests", async () => {
      // First request should succeed with permissive policy
      const result1 = await service.submitSigningRequest(makeRequest());
      expect(result1.success).toBe(true);

      // Switch to restrictive policy
      service.updatePolicy(restrictivePolicy());

      // Second request should fail
      const result2 = await service.submitSigningRequest(makeRequest());
      expect(result2.success).toBe(false);
    });
  });

  // ===================================================================
  //  10. Signer failures
  // ===================================================================

  describe("signer failures", () => {
    it("returns error when signer throws", async () => {
      const failSigner = createMockSigner({
        signTransaction: vi.fn().mockRejectedValue(new Error("HSM offline")),
      });
      const s = new RemoteSigningService({
        signer: failSigner,
        policy: permissivePolicy(),
        auditLog,
      });

      const result = await s.submitSigningRequest(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain("HSM offline");
      expect(result.humanConfirmed).toBe(false);
    });

    it("records signer failure in audit log", async () => {
      const failSigner = createMockSigner({
        signTransaction: vi
          .fn()
          .mockRejectedValue(new Error("Key not available")),
      });
      const s = new RemoteSigningService({
        signer: failSigner,
        policy: permissivePolicy(),
        auditLog,
      });

      await s.submitSigningRequest(makeRequest());

      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "signing_request_rejected",
          severity: "error",
          summary: expect.stringContaining("Key not available"),
        }),
      );
    });

    it("returns error when signer throws non-Error", async () => {
      const failSigner = createMockSigner({
        signTransaction: vi.fn().mockRejectedValue("string error"),
      });
      const s = new RemoteSigningService({
        signer: failSigner,
        policy: permissivePolicy(),
      });

      const result = await s.submitSigningRequest(makeRequest());

      expect(result.success).toBe(false);
      expect(result.error).toContain("string error");
    });

    it("signer failure during approved request returns error", async () => {
      const failSigner = createMockSigner({
        signTransaction: vi.fn().mockRejectedValue(new Error("timeout")),
      });
      const s = new RemoteSigningService({
        signer: failSigner,
        policy: humanConfirmPolicy(),
      });

      const request = makeRequest({ value: "1000000000000000000" });
      await s.submitSigningRequest(request);

      const result = await s.approveRequest(request.requestId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
      expect(result.humanConfirmed).toBe(true);
    });
  });

  // ===================================================================
  //  11. Replay protection integration
  // ===================================================================

  describe("replay protection", () => {
    it("records request ID after successful sign", async () => {
      const request = makeRequest({ requestId: "unique-tx-1" });
      const result = await service.submitSigningRequest(request);
      expect(result.success).toBe(true);

      // Submitting same requestId should be rejected by policy evaluator
      const duplicate = makeRequest({ requestId: "unique-tx-1" });
      const result2 = await service.submitSigningRequest(duplicate);
      expect(result2.success).toBe(false);
      expect(result2.policyDecision.matchedRule).toContain("replay");
    });
  });

  // ===================================================================
  //  12. Audit log metadata
  // ===================================================================

  describe("audit log metadata", () => {
    it("submission log includes request details", async () => {
      const request = makeRequest({
        requestId: "audit-test-1",
        chainId: 42,
        to: "0xTargetContract",
        value: "5000",
      });
      await service.submitSigningRequest(request);

      const submissionCall = (
        auditLog.record as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "signing_request_submitted",
      );

      expect(submissionCall).toBeTruthy();
      const entry = submissionCall?.[0] as {
        metadata: Record<string, unknown>;
      };
      expect(entry.metadata.requestId).toBe("audit-test-1");
      expect(entry.metadata.chainId).toBe(42);
      expect(entry.metadata.to).toBe("0xTargetContract");
      expect(entry.metadata.value).toBe("5000");
    });

    it("approval log includes humanConfirmed flag", async () => {
      const request = makeRequest();
      await service.submitSigningRequest(request);

      const approvalCall = (
        auditLog.record as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) =>
          (c[0] as { type: string }).type === "signing_request_approved",
      );

      expect(approvalCall).toBeTruthy();
      const entry = approvalCall?.[0] as {
        metadata: Record<string, unknown>;
      };
      expect(entry.metadata.humanConfirmed).toBe(false);
    });
  });
});
