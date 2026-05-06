import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CLOUD_AUTH_CHANGED_EVENT, type CloudAgent, getToken } from "./auth";
import {
  type AgentRuntimeState,
  type CloudAgentBilling,
  CloudApiClient,
  CloudClient,
  normalizeAgentState,
} from "./cloud-api";
import { addConnection, getConnections, removeConnection } from "./connections";
import {
  AGENT_UI_BASE_DOMAIN,
  CLOUD_BASE,
  getCloudAgentApiPath,
  getCloudTokenStorageKey,
  getSandboxDiscoveryUrls,
  LOCAL_AGENT_BASE,
  rewriteAgentUiUrl,
  shouldAllowPublicSandboxDiscoveryFallback,
  shouldAutoProbeLocalAgent,
} from "./runtime-config";

// Timeouts for health probes - shorter than before to avoid long waits
const HEALTH_TIMEOUT_MS = 3000;
const STATUS_TIMEOUT_MS = 2000;
const DISCOVERY_TIMEOUT_MS = 5000;

// Max concurrent health probes to avoid overwhelming the network
const MAX_CONCURRENT_PROBES = 6;

/**
 * Simple semaphore for limiting concurrent async operations.
 */
function createSemaphore(maxConcurrent: number) {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (current < maxConcurrent) {
        current++;
        return;
      }
      return new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    },
    release(): void {
      current--;
      const next = queue.shift();
      if (next) {
        current++;
        next();
      }
    },
  };
}

export type AgentSource = "cloud" | "local" | "remote";

export interface ManagedAgent {
  id: string;
  name: string;
  source: AgentSource;
  status: AgentRuntimeState;
  model?: string;
  uptime?: number;
  memories?: number;
  sourceUrl?: string;
  webUiUrl?: string;
  cloudAgent?: CloudAgent;
  client?: CloudApiClient;
  cloudClient?: CloudClient;
  cloudAgentId?: string;
  billing?: CloudAgentBilling;
  region?: string;
  createdAt?: string;
  nodeId?: string;
  lastHeartbeat?: string;
  /** API token for direct agent access (from sandbox discovery or manual config). */
  apiToken?: string;
  /** VRM avatar index (1-8) from agent stream settings. */
  avatarIndex?: number;
}

export type SourceFilter = "all" | "local" | "cloud" | "remote";

interface AgentContextValue {
  agents: ManagedAgent[];
  filteredAgents: ManagedAgent[];
  /** True only during initial load (first fetch). */
  loading: boolean;
  /** True when any refetch is in progress (interval, manual refresh, post-mutation). */
  isRefreshing: boolean;
  /** Last error from cloud API or agent discovery. Dismissible via clearError(). */
  error: string | null;
  clearError: () => void;
  cloudClient: CloudClient | null;
  sourceFilter: SourceFilter;
  setSourceFilter: (f: SourceFilter) => void;
  refresh: () => Promise<void>;
  addRemoteUrl: (name: string, url: string, token?: string) => void;
  removeRemote: (id: string) => void;
  /** Delete a cloud agent (real destructive operation). Returns on success. */
  deleteCloudAgent: (cloudAgentId: string) => Promise<void>;
}

interface DiscoveredSandbox {
  id: string;
  agent_name: string;
  web_ui_port: number;
  api_token?: string;
  node_id?: string;
  last_heartbeat_at?: string;
}

interface ProbeTarget {
  index: number;
  client: CloudApiClient;
  isCloudEnrich?: boolean;
}

interface ProbeResult {
  index: number;
  status?: AgentRuntimeState;
  model?: string;
  uptime?: number;
  memories?: number;
  agentName?: string;
  avatarIndex?: number;
}

type CloudClientRef = MutableRefObject<CloudClient | null>;
type CloudTokenRef = MutableRefObject<string | null>;
type ProbeSemaphore = ReturnType<typeof createSemaphore>;

interface CloudAgentLoadResult {
  results: ManagedAgent[];
  cloudAuthOk: boolean;
  fetchError: string | null;
}

const AgentContext = createContext<AgentContextValue | null>(null);

// Milady self-hosted agent discovery
// Primary: the public sandbox index.
// Fallback: a same-host discovery service on port 3456 for direct dashboard access.

/** Shallow-compare two agent lists to avoid unnecessary re-renders. */
function agentsEqual(a: ManagedAgent[], b: ManagedAgent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aa = a[i],
      bb = b[i];
    if (
      aa.id !== bb.id ||
      aa.name !== bb.name ||
      aa.status !== bb.status ||
      aa.model !== bb.model ||
      aa.uptime !== bb.uptime ||
      aa.memories !== bb.memories ||
      aa.webUiUrl !== bb.webUiUrl ||
      aa.sourceUrl !== bb.sourceUrl ||
      aa.lastHeartbeat !== bb.lastHeartbeat
    )
      return false;
  }
  return true;
}

async function collectCloudAgents(
  token: string | null,
  cloudClientRef: CloudClientRef,
  cloudTokenRef: CloudTokenRef,
): Promise<CloudAgentLoadResult> {
  if (!token) {
    cloudClientRef.current = null;
    cloudTokenRef.current = null;
    return { results: [], cloudAuthOk: false, fetchError: null };
  }

  let client = cloudClientRef.current;
  if (cloudTokenRef.current !== token || !client) {
    client = new CloudClient(token);
    cloudClientRef.current = client;
    cloudTokenRef.current = token;
  }

  try {
    const cloudAgents = await client.listAgents();
    return {
      results: cloudAgents.map((agent) => ({
        id: `cloud-${agent.id}`,
        name: agent.name || agent.id,
        source: "cloud",
        status: normalizeAgentState(agent.status),
        model: agent.model,
        cloudAgent: agent,
        cloudClient: client,
        cloudAgentId: agent.id,
        sourceUrl: `${CLOUD_BASE}${getCloudAgentApiPath(agent.id)}`,
        webUiUrl: agent.webUiUrl
          ? rewriteAgentUiUrl(agent.webUiUrl)
          : undefined,
        billing: agent.billing,
        region: agent.region,
        createdAt: agent.createdAt,
        uptime: agent.uptime,
      })),
      cloudAuthOk: true,
      fetchError: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud API request failed";
    const isNotAvailable =
      message.includes("404") ||
      (error instanceof Error && error.name === "CloudAgentsNotAvailableError");
    return {
      results: [],
      cloudAuthOk: false,
      fetchError: isNotAvailable ? null : `Cloud API: ${message}`,
    };
  }
}

async function fetchSandboxesForDiscovery(cloudAuthOk: boolean): Promise<{
  sandboxes: DiscoveredSandbox[];
  allowPublicSandboxFallback: boolean;
}> {
  const allowPublicSandboxFallback =
    shouldAllowPublicSandboxDiscoveryFallback();
  if (!cloudAuthOk && !allowPublicSandboxFallback) {
    return { sandboxes: [], allowPublicSandboxFallback };
  }

  for (const url of getSandboxDiscoveryUrls()) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      if (response.ok) {
        const body = await response.json();
        return {
          sandboxes: Array.isArray(body) ? body : [],
          allowPublicSandboxFallback,
        };
      }
    } catch {}
  }

  return { sandboxes: [], allowPublicSandboxFallback };
}

function selectOwnedSandboxes(
  sandboxes: DiscoveredSandbox[],
  cloudAuthOk: boolean,
  allowPublicSandboxFallback: boolean,
  results: ManagedAgent[],
) {
  if (!cloudAuthOk) {
    return allowPublicSandboxFallback ? sandboxes : [];
  }

  const cloudAgentNames = new Set(
    results
      .filter((agent) => agent.source === "cloud")
      .map((agent) => agent.name.toLowerCase()),
  );
  const cloudAgentIds = new Set(
    results
      .filter((agent) => agent.source === "cloud")
      .map((agent) => agent.cloudAgentId)
      .filter((id): id is string => typeof id === "string"),
  );

  return sandboxes.filter((sandbox) => {
    const nameMatch = cloudAgentNames.has(
      (sandbox.agent_name || "").toLowerCase(),
    );
    const idMatch = cloudAgentIds.has(sandbox.id);
    return nameMatch || idMatch;
  });
}

function buildCloudAgentIndexByName(results: ManagedAgent[]) {
  const indexByName = new Map<string, number>();
  results.forEach((agent, index) => {
    if (agent.source === "cloud") {
      indexByName.set(agent.name.toLowerCase(), index);
    }
  });
  return indexByName;
}

function addSandboxAgents(
  results: ManagedAgent[],
  probeTargets: ProbeTarget[],
  discoveredIds: Set<string>,
  sandboxes: DiscoveredSandbox[],
) {
  const cloudAgentIndexByName = buildCloudAgentIndexByName(results);

  for (const sandbox of sandboxes) {
    discoveredIds.add(sandbox.id);
    const url = `https://${sandbox.id}.${AGENT_UI_BASE_DOMAIN}`;
    const apiToken = sandbox.api_token;
    const client = new CloudApiClient({
      url,
      type: "remote",
      authToken: apiToken,
    });

    const matchingCloudIndex = cloudAgentIndexByName.get(
      (sandbox.agent_name || "").toLowerCase(),
    );
    if (matchingCloudIndex !== undefined) {
      const cloudEntry = results[matchingCloudIndex];
      if (cloudEntry) {
        cloudEntry.sourceUrl = url;
        cloudEntry.client = client;
        cloudEntry.nodeId = sandbox.node_id;
        cloudEntry.lastHeartbeat = sandbox.last_heartbeat_at;
        cloudEntry.apiToken = apiToken;
        cloudEntry.webUiUrl = url;
        probeTargets.push({
          index: matchingCloudIndex,
          client,
          isCloudEnrich: true,
        });
      }
      continue;
    }

    const index = results.length;
    results.push({
      id: `milady-${sandbox.id}`,
      name: sandbox.agent_name || sandbox.id,
      source: "remote",
      status: "unknown",
      sourceUrl: url,
      webUiUrl: url,
      client,
      nodeId: sandbox.node_id,
      lastHeartbeat: sandbox.last_heartbeat_at,
      apiToken,
    });
    probeTargets.push({ index, client });
  }
}

function wasDiscoveredMiladyRemote(
  url: string,
  discoveredIds: Set<string>,
): boolean {
  if (!url.includes(AGENT_UI_BASE_DOMAIN)) return false;
  const match = url.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/,
  );
  const sandboxId = match?.[1];
  return typeof sandboxId === "string" && discoveredIds.has(sandboxId);
}

function addManualRemoteAgents(
  results: ManagedAgent[],
  probeTargets: ProbeTarget[],
  discoveredIds: Set<string>,
) {
  for (const remote of getConnections().filter(
    (item) => item.type === "remote",
  )) {
    if (wasDiscoveredMiladyRemote(remote.url, discoveredIds)) continue;

    const client = new CloudApiClient({
      url: remote.url,
      type: "remote",
      authToken: remote.authToken,
    });
    const index = results.length;
    results.push({
      id: `remote-${remote.id}`,
      name: remote.name,
      source: "remote",
      status: "unknown",
      sourceUrl: remote.url,
      client,
    });
    probeTargets.push({ index, client });
  }
}

function createLocalProbeClient() {
  return shouldAutoProbeLocalAgent()
    ? new CloudApiClient({
        url: LOCAL_AGENT_BASE,
        type: "local",
      })
    : null;
}

async function probeAgent(
  target: ProbeTarget,
  semaphore: ProbeSemaphore,
): Promise<ProbeResult | null> {
  await semaphore.acquire();
  try {
    const health = await target.client.health({
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!health.ready && !health.status) {
      return { index: target.index, status: "unknown" };
    }
    if (health._synthetic) {
      return { index: target.index, status: "running" };
    }
    try {
      const [status, streamSettings] = await Promise.all([
        target.client.getAgentStatus({
          signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
        }),
        target.client.getStreamSettings().catch(() => null),
      ]);
      return {
        index: target.index,
        status: status.state,
        model: status.model,
        uptime: status.uptime,
        memories: status.memories,
        agentName: status.agentName,
        avatarIndex: streamSettings?.settings?.avatarIndex,
      };
    } catch {
      return { index: target.index, status: "running" };
    }
  } catch {
    return target.isCloudEnrich
      ? null
      : { index: target.index, status: "unknown" };
  } finally {
    semaphore.release();
  }
}

async function probeLocalAgent(
  localClient: CloudApiClient | null,
  semaphore: ProbeSemaphore,
): Promise<ManagedAgent | null> {
  if (!localClient) return null;
  await semaphore.acquire();
  try {
    const health = await localClient.health({
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!health.ready && !health.status) return null;
    if (health._synthetic) {
      return {
        id: "local-default",
        name: "Local Agent",
        source: "local",
        status: "running",
        sourceUrl: LOCAL_AGENT_BASE,
        client: localClient,
      };
    }
    try {
      const status = await localClient.getAgentStatus({
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      return {
        id: "local-default",
        name: status.agentName || "Local Agent",
        source: "local",
        status: status.state,
        model: status.model,
        uptime: status.uptime,
        memories: status.memories,
        sourceUrl: LOCAL_AGENT_BASE,
        client: localClient,
      };
    } catch {
      return {
        id: "local-default",
        name: "Local Agent",
        source: "local",
        status: "running",
        sourceUrl: LOCAL_AGENT_BASE,
        client: localClient,
      };
    }
  } catch {
    return null;
  } finally {
    semaphore.release();
  }
}

function applyProbeResult(agent: ManagedAgent, result: ProbeResult) {
  if (result.status) agent.status = result.status;
  if (result.model && result.model !== "—") agent.model = result.model;
  if (result.uptime !== undefined) agent.uptime = result.uptime;
  if (result.memories !== undefined) agent.memories = result.memories;
  if (result.agentName && !agent.name) agent.name = result.agentName;
  if (result.avatarIndex !== undefined) agent.avatarIndex = result.avatarIndex;
}

function mergeProbeResults(
  results: ManagedAgent[],
  probeResults: Array<PromiseSettledResult<ProbeResult | null>>,
  localAgentResult: ManagedAgent | null,
) {
  const enrichedResults = [...results];
  for (const result of probeResults) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const agent = enrichedResults[result.value.index];
    if (agent) {
      applyProbeResult(agent, result.value);
    }
  }
  if (localAgentResult) {
    enrichedResults.push(localAgentResult);
  }
  return enrichedResults;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const cloudClientRef = useRef<CloudClient | null>(null);
  const cloudTokenRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Request sequencing: incremented on each fetchAll() call to prevent stale responses
  const fetchSequenceRef = useRef(0);
  // Track whether initial load has completed
  const hasLoadedOnceRef = useRef(false);

  // Sort agents: local first, then remote, then cloud (memoized to avoid re-creating on every render)
  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) => {
        const order: Record<AgentSource, number> = {
          local: 0,
          remote: 1,
          cloud: 2,
        };
        return (order[a.source] ?? 3) - (order[b.source] ?? 3);
      }),
    [agents],
  );

  const filteredAgents = useMemo(
    () =>
      sourceFilter === "all"
        ? sortedAgents
        : sortedAgents.filter((a) => a.source === sourceFilter),
    [sortedAgents, sourceFilter],
  );

  const clearError = useCallback(() => setError(null), []);

  const fetchAll = useCallback(async () => {
    const currentSequence = ++fetchSequenceRef.current;
    const isStale = () => currentSequence !== fetchSequenceRef.current;

    setIsRefreshing(true);

    const { results, cloudAuthOk, fetchError } = await collectCloudAgents(
      getToken(),
      cloudClientRef,
      cloudTokenRef,
    );
    const probeTargets: ProbeTarget[] = [];
    const discoveredIds = new Set<string>();
    const { sandboxes, allowPublicSandboxFallback } =
      await fetchSandboxesForDiscovery(cloudAuthOk);
    const ownedSandboxes = selectOwnedSandboxes(
      sandboxes,
      cloudAuthOk,
      allowPublicSandboxFallback,
      results,
    );

    addSandboxAgents(results, probeTargets, discoveredIds, ownedSandboxes);
    const localClient = createLocalProbeClient();
    addManualRemoteAgents(results, probeTargets, discoveredIds);

    if (isStale()) return;
    setAgents((prev) => (agentsEqual(prev, results) ? prev : [...results]));
    hasLoadedOnceRef.current = true;
    setLoading(false);

    const semaphore = createSemaphore(MAX_CONCURRENT_PROBES);
    const [probeResults, localAgentResult] = await Promise.all([
      Promise.allSettled(
        probeTargets.map((target) => probeAgent(target, semaphore)),
      ),
      probeLocalAgent(localClient, semaphore),
    ]);

    if (isStale()) return;

    const enrichedResults = mergeProbeResults(
      results,
      probeResults,
      localAgentResult,
    );
    setAgents((prev) =>
      agentsEqual(prev, enrichedResults) ? prev : enrichedResults,
    );
    setError(fetchError);
    setIsRefreshing(false);
  }, []);

  // Adaptive polling: 5s when any agent is provisioning, 30s otherwise
  const activeIntervalMs = useRef<number>(30000);

  useEffect(() => {
    const hasProvisioning = agents.some((a) => a.status === "provisioning");
    const desiredInterval = hasProvisioning ? 5000 : 30000;

    if (desiredInterval !== activeIntervalMs.current) {
      activeIntervalMs.current = desiredInterval;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(fetchAll, desiredInterval);
    }
  }, [agents, fetchAll]);

  useEffect(() => {
    void fetchAll();
    intervalRef.current = setInterval(fetchAll, 30000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchAll]);

  // Listen for auth changes (sign-in/sign-out) and refresh immediately
  useEffect(() => {
    const handleAuthChange = () => {
      void fetchAll();
    };

    // Subscribe to custom auth changed event (same-tab)
    window.addEventListener(CLOUD_AUTH_CHANGED_EVENT, handleAuthChange);

    // Subscribe to storage events for cross-tab sync
    const handleStorage = (event: StorageEvent) => {
      const tokenKey = getCloudTokenStorageKey();
      if (event.key === tokenKey || event.key === null) {
        void fetchAll();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CLOUD_AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [fetchAll]);

  const addRemoteUrl = useCallback(
    (name: string, url: string, token?: string) => {
      addConnection({ name, url, type: "remote", authToken: token });
      void fetchAll();
    },
    [fetchAll],
  );

  const removeRemote = useCallback(
    (id: string) => {
      const connId = id.replace("remote-", "");
      removeConnection(connId);
      void fetchAll();
    },
    [fetchAll],
  );

  const deleteCloudAgent = useCallback(
    async (cloudAgentId: string) => {
      const client = cloudClientRef.current;
      if (!client) {
        throw new Error("Not signed in to cloud.");
      }
      await client.deleteAgent(cloudAgentId);
      await fetchAll();
    },
    [fetchAll],
  );

  const contextValue = useMemo<AgentContextValue>(
    () => ({
      agents: sortedAgents,
      filteredAgents,
      loading,
      isRefreshing,
      error,
      clearError,
      cloudClient: cloudClientRef.current,
      sourceFilter,
      setSourceFilter,
      refresh: fetchAll,
      addRemoteUrl,
      removeRemote,
      deleteCloudAgent,
    }),
    [
      sortedAgents,
      filteredAgents,
      loading,
      isRefreshing,
      error,
      clearError,
      sourceFilter,
      fetchAll,
      addRemoteUrl,
      removeRemote,
      deleteCloudAgent,
    ],
  );

  return <AgentContext value={contextValue}>{children}</AgentContext>;
}
export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used within AgentProvider");
  return ctx;
}
