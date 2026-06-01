import { useEffect, useState } from "react";
import type { Notice } from "./useCloudOpenFlow";

export function useNoticeToast(autoDismissMs = 4000) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), autoDismissMs);
    return () => window.clearTimeout(timeout);
  }, [autoDismissMs, notice]);

  return { notice, setNotice } as const;
}
