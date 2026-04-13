/**
 * Cloud TransactionHistory — adapts CloudApiClient to the shared
 * TransactionHistory component from @elizaos/app-core.
 */

import { TransactionHistory as TransactionHistoryBase } from "@elizaos/app-core";
import { useCallback } from "react";
import type { CloudApiClient } from "../../lib/cloud-api";

interface CloudTransactionHistoryProps {
  client: CloudApiClient;
}

export function TransactionHistory({ client }: CloudTransactionHistoryProps) {
  const getStewardHistory = useCallback(
    (opts?: { status?: string; limit?: number; offset?: number }) =>
      client.getStewardTxRecords(opts),
    [client],
  );

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
  }, []);

  const setActionNotice = useCallback(
    (text: string, _tone?: "info" | "success" | "error") => {
      console.info(`[history] ${text}`);
    },
    [],
  );

  return (
    <TransactionHistoryBase
      getStewardHistory={getStewardHistory}
      copyToClipboard={copyToClipboard}
      setActionNotice={setActionNotice}
    />
  );
}
