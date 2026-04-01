/**
 * Logs state — extracted from AppContext.
 *
 * Manages log entries, sources, tags, and filter state.
 * The loadLogs callback reads all three filter values from state.
 */

import { useCallback, useState } from "react";
import { client } from "../api";
import type { LogEntry } from "../api";

export function useLogsState() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSources, setLogSources] = useState<string[]>([]);
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logTagFilter, setLogTagFilter] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("");
  const [logSourceFilter, setLogSourceFilter] = useState("");

  const loadLogs = useCallback(async () => {
    try {
      const filter: Record<string, string> = {};
      if (logTagFilter) filter.tag = logTagFilter;
      if (logLevelFilter) filter.level = logLevelFilter;
      if (logSourceFilter) filter.source = logSourceFilter;
      const data = await client.getLogs(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      setLogs(data.entries);
      if (data.sources?.length) setLogSources(data.sources);
      if (data.tags?.length) setLogTags(data.tags);
    } catch {
      /* ignore */
    }
  }, [logTagFilter, logLevelFilter, logSourceFilter]);

  return {
    state: {
      logs,
      logSources,
      logTags,
      logTagFilter,
      logLevelFilter,
      logSourceFilter,
    },
    setLogs,
    setLogTagFilter,
    setLogLevelFilter,
    setLogSourceFilter,
    loadLogs,
  };
}
