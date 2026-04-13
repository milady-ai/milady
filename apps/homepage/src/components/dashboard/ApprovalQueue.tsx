/**
 * Cloud ApprovalQueue — adapts CloudApiClient to the shared
 * ApprovalQueue component from @elizaos/app-core.
 */

import { ApprovalQueue as ApprovalQueueBase } from "@elizaos/app-core/components";
import { useCallback } from "react";
import type { CloudApiClient } from "../../lib/cloud-api";

interface CloudApprovalQueueProps {
  client: CloudApiClient;
}

export function ApprovalQueue({ client }: CloudApprovalQueueProps) {
  const getStewardPending = useCallback(
    () => client.getStewardPendingApprovals(),
    [client],
  );

  const approveStewardTx = useCallback(
    (txId: string) => client.approveStewardTx(txId),
    [client],
  );

  const rejectStewardTx = useCallback(
    (txId: string, _reason?: string) => client.denyStewardTx(txId),
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
      console.info(`[approval] ${text}`);
    },
    [],
  );

  return (
    <ApprovalQueueBase
      getStewardPending={getStewardPending}
      approveStewardTx={approveStewardTx}
      rejectStewardTx={rejectStewardTx}
      copyToClipboard={copyToClipboard}
      setActionNotice={setActionNotice}
    />
  );
}
