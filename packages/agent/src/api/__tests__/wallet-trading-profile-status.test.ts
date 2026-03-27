import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readWalletTradeLedgerStore,
  recordWalletTradeLedgerEntry,
  updateWalletTradeLedgerEntryStatus,
} from "../wallet-trading-profile";

function makeTempStateDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "milady-wallet-ledger-"));
}

function seedPendingEntry(stateDir: string): void {
  recordWalletTradeLedgerEntry(
    {
      hash: "0xabc123",
      source: "agent",
      side: "buy",
      tokenAddress: "0x1111111111111111111111111111111111111111",
      slippageBps: 300,
      route: ["0xwbnb", "0xtoken"],
      quoteIn: { symbol: "BNB", amount: "0.01", amountWei: "10000000000000000" },
      quoteOut: { symbol: "USDT", amount: "2", amountWei: "2000000" },
      status: "pending",
      confirmations: 0,
      nonce: 1,
      blockNumber: null,
      gasUsed: null,
      effectiveGasPriceWei: null,
      explorerUrl: "https://bscscan.com/tx/0xabc123",
    },
    stateDir,
  );
}

describe("wallet trading profile status transitions", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows pending -> success transition", () => {
    const stateDir = makeTempStateDir();
    tempDirs.push(stateDir);
    seedPendingEntry(stateDir);

    const updated = updateWalletTradeLedgerEntryStatus(
      "0xabc123",
      {
        status: "success",
        confirmations: 2,
        nonce: 1,
        blockNumber: 123,
        gasUsed: "21000",
        effectiveGasPriceWei: "1000000000",
      },
      stateDir,
    );

    expect(updated?.status).toBe("success");
    expect(updated?.confirmations).toBe(2);
  });

  it("rejects terminal success -> reverted regression", () => {
    const stateDir = makeTempStateDir();
    tempDirs.push(stateDir);
    seedPendingEntry(stateDir);

    updateWalletTradeLedgerEntryStatus(
      "0xabc123",
      {
        status: "success",
        confirmations: 3,
        nonce: 1,
        blockNumber: 123,
        gasUsed: "21000",
        effectiveGasPriceWei: "1000000000",
      },
      stateDir,
    );

    const rejected = updateWalletTradeLedgerEntryStatus(
      "0xabc123",
      {
        status: "reverted",
        confirmations: 3,
        nonce: 1,
        blockNumber: 123,
        gasUsed: "21000",
        effectiveGasPriceWei: "1000000000",
        reason: "late conflicting write",
      },
      stateDir,
    );

    expect(rejected?.status).toBe("success");
    const store = readWalletTradeLedgerStore(stateDir);
    expect(store.entries[0]?.status).toBe("success");
  });

  it("allows not_found -> pending recovery transition", () => {
    const stateDir = makeTempStateDir();
    tempDirs.push(stateDir);
    seedPendingEntry(stateDir);

    updateWalletTradeLedgerEntryStatus(
      "0xabc123",
      {
        status: "not_found",
        confirmations: 0,
        nonce: 1,
        blockNumber: null,
        gasUsed: null,
        effectiveGasPriceWei: null,
      },
      stateDir,
    );

    const recovered = updateWalletTradeLedgerEntryStatus(
      "0xabc123",
      {
        status: "pending",
        confirmations: 0,
        nonce: 1,
        blockNumber: null,
        gasUsed: null,
        effectiveGasPriceWei: null,
      },
      stateDir,
    );

    expect(recovered?.status).toBe("pending");
  });
});

