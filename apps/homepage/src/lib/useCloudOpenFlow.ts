import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "./AgentProvider";
import { CloudAgentsNotAvailableError, type CloudClient } from "./cloud-api";
import {
  redirectPopupToCloudAgent,
  renderPopupConnectingState,
  updatePopupMessage,
} from "./open-web-ui";

const PROVISION_TIMEOUT_MS = 180000;

export type CloudOpenState = "idle" | "preparing";
export type NoticeTone = "success" | "error" | "info";

export interface Notice {
  tone: NoticeTone;
  text: string;
}

interface CloudOpenFlowOptions {
  agents: ManagedAgent[];
  cloudClient: CloudClient | null;
  isAuthenticated: boolean;
  loginError: string | null;
  loginState: string;
  refresh: () => Promise<void>;
  setNotice: (notice: Notice | null) => void;
  signIn: () => Promise<void> | void;
}

interface CloudAgentCandidate {
  cloudAgentId: string;
  name: string;
  status: string;
}

const PROVISIONING_MESSAGE = "Provisioning sandbox... (~45s)";
const PROVISIONING_STAGES: ReadonlyArray<{
  afterMs: number;
  text: string;
}> = [
  { afterMs: 8000, text: "Booting your container..." },
  {
    afterMs: 16000,
    text: "Almost there... warming up dependencies.",
  },
  { afterMs: 24000, text: "Finishing the boot sequence..." },
  {
    afterMs: 32000,
    text: "Still booting, this is taking longer than usual...",
  },
];

function generateCloudAgentName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `milady-${suffix}`;
}

function cloudAgentCandidateFromManaged(
  agent: ManagedAgent,
): CloudAgentCandidate | null {
  if (agent.source !== "cloud" || !agent.cloudAgentId) return null;
  return {
    cloudAgentId: agent.cloudAgentId,
    name: agent.name,
    status: agent.status,
  };
}

function localCloudAgentCandidates(agents: ManagedAgent[]) {
  return agents.flatMap((agent) => {
    const candidate = cloudAgentCandidateFromManaged(agent);
    return candidate ? [candidate] : [];
  });
}

async function loadCloudAgentCandidates(
  agents: ManagedAgent[],
  cloudClient: CloudClient,
) {
  const localCandidates = localCloudAgentCandidates(agents);
  if (localCandidates.length > 0) return localCandidates;
  return (await cloudClient.listAgents()).map((agent) => ({
    cloudAgentId: agent.id,
    name: agent.name,
    status: agent.status,
  }));
}

function selectReusableCloudAgent(cloudAgents: CloudAgentCandidate[]) {
  return (
    cloudAgents.find((agent) => agent.status === "running") ??
    cloudAgents.find((agent) => agent.status === "paused") ??
    null
  );
}

function provisioningMessageForElapsed(elapsed: number) {
  let message = PROVISIONING_MESSAGE;
  for (const stage of PROVISIONING_STAGES) {
    if (elapsed >= stage.afterMs) message = stage.text;
  }
  return message;
}

function startProvisioningMessageRotation(getPopup: () => Window | null) {
  const startedAt = Date.now();
  return window.setInterval(() => {
    const popup = getPopup();
    if (!popup || popup.closed) return;
    updatePopupMessage(
      popup,
      provisioningMessageForElapsed(Date.now() - startedAt),
    );
  }, 1000);
}

async function waitForProvisioningJob(
  cloudClient: CloudClient,
  jobId: string,
  getPopup: () => Window | null,
) {
  const rotateId = startProvisioningMessageRotation(getPopup);
  try {
    const job = await cloudClient.pollJobUntilDone(jobId, PROVISION_TIMEOUT_MS);
    if (job.status === "failed") {
      throw new Error(job.error ?? "provisioning failed.");
    }
  } finally {
    window.clearInterval(rotateId);
  }
}

async function createAndProvisionCloudAgent(
  cloudClient: CloudClient,
  popup: Window,
  getPopup: () => Window | null,
) {
  updatePopupMessage(popup, "Creating your cloud agent...");
  const created = await cloudClient.createAgent({
    name: generateCloudAgentName(),
  });
  if (!created.id) {
    throw new Error("agent created but no id was returned.");
  }

  updatePopupMessage(popup, PROVISIONING_MESSAGE);
  const provisioning = await cloudClient.provisionAgent(created.id);
  if (provisioning.jobId) {
    await waitForProvisioningJob(cloudClient, provisioning.jobId, getPopup);
  }
  return created.id;
}

async function resolveCloudAgentForOpen({
  agents,
  cloudClient,
  popup,
  refresh,
  getPopup,
}: {
  agents: ManagedAgent[];
  cloudClient: CloudClient;
  popup: Window;
  refresh: () => Promise<void>;
  getPopup: () => Window | null;
}) {
  const cloudAgents = await loadCloudAgentCandidates(agents, cloudClient);
  const existingCloud = selectReusableCloudAgent(cloudAgents);
  if (existingCloud?.cloudAgentId) {
    updatePopupMessage(popup, `Opening ${existingCloud.name}...`);
    return existingCloud.cloudAgentId;
  }

  const cloudAgentId = await createAndProvisionCloudAgent(
    cloudClient,
    popup,
    getPopup,
  );
  void refresh();
  return cloudAgentId;
}

function cloudOpenErrorNotice(error: unknown): Notice {
  if (error instanceof CloudAgentsNotAvailableError) {
    return {
      tone: "error",
      text: "cloud agent hosting isn't deployed on this Eliza Cloud instance yet.",
    };
  }
  return {
    tone: "error",
    text:
      error instanceof Error
        ? `cloud open failed: ${error.message}`
        : "cloud open failed.",
  };
}

export function useCloudOpenFlow({
  agents,
  cloudClient,
  isAuthenticated,
  loginError,
  loginState,
  refresh,
  setNotice,
  signIn,
}: CloudOpenFlowOptions) {
  const [cloudOpenState, setCloudOpenState] = useState<CloudOpenState>("idle");
  const cloudPopupRef = useRef<Window | null>(null);
  const pendingCloudOpenRef = useRef(false);
  const cloudOpenTimeoutRef = useRef<number | null>(null);

  const closeCloudPopup = useCallback(() => {
    const popup = cloudPopupRef.current;
    cloudPopupRef.current = null;
    if (cloudOpenTimeoutRef.current !== null) {
      window.clearTimeout(cloudOpenTimeoutRef.current);
      cloudOpenTimeoutRef.current = null;
    }
    if (popup && !popup.closed) popup.close();
  }, []);

  const continueCloudOpen = useCallback(async () => {
    const popup = cloudPopupRef.current;
    if (!popup || popup.closed) {
      setCloudOpenState("idle");
      return;
    }
    if (!cloudClient) {
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: "cloud client not ready, try again.",
      });
      return;
    }

    try {
      const cloudAgentId = await resolveCloudAgentForOpen({
        agents,
        cloudClient,
        popup,
        refresh,
        getPopup: () => cloudPopupRef.current,
      });

      if (popup.closed) {
        setCloudOpenState("idle");
        cloudPopupRef.current = null;
        return;
      }

      updatePopupMessage(popup, "Authenticating...");
      await redirectPopupToCloudAgent(
        popup,
        cloudAgentId,
        cloudClient.getToken(),
      );
      cloudPopupRef.current = null;
      setCloudOpenState("idle");
    } catch (err) {
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice(cloudOpenErrorNotice(err));
    }
  }, [agents, cloudClient, closeCloudPopup, refresh, setNotice]);

  const handleOpenCloud = useCallback(() => {
    if (cloudOpenState === "preparing") return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({
        tone: "error",
        text: "popup blocked. allow popups for this site and try again.",
      });
      return;
    }
    cloudPopupRef.current = popup;
    renderPopupConnectingState(popup, "Connecting to Eliza Cloud...");
    setCloudOpenState("preparing");

    if (!isAuthenticated) {
      pendingCloudOpenRef.current = true;
      updatePopupMessage(
        popup,
        "Sign in to Eliza Cloud in the other window...",
      );
      void signIn();
      return;
    }
    if (!cloudClient) {
      pendingCloudOpenRef.current = true;
      updatePopupMessage(popup, "Connecting to your account...");
      void refresh();
      cloudOpenTimeoutRef.current = window.setTimeout(() => {
        cloudOpenTimeoutRef.current = null;
        if (!pendingCloudOpenRef.current) return;
        pendingCloudOpenRef.current = false;
        closeCloudPopup();
        setCloudOpenState("idle");
        setNotice({
          tone: "error",
          text: "couldn't connect to your account. try refreshing.",
        });
      }, 10000);
      return;
    }
    void continueCloudOpen();
  }, [
    cloudOpenState,
    isAuthenticated,
    cloudClient,
    signIn,
    continueCloudOpen,
    refresh,
    closeCloudPopup,
    setNotice,
  ]);

  const handleCancelCloudOpen = useCallback(() => {
    closeCloudPopup();
    pendingCloudOpenRef.current = false;
    setCloudOpenState("idle");
    setNotice({ tone: "info", text: "cloud open cancelled." });
  }, [closeCloudPopup, setNotice]);

  useEffect(() => {
    if (
      isAuthenticated &&
      cloudClient &&
      pendingCloudOpenRef.current &&
      cloudPopupRef.current &&
      !cloudPopupRef.current.closed
    ) {
      pendingCloudOpenRef.current = false;
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
      void continueCloudOpen();
    }
  }, [isAuthenticated, cloudClient, continueCloudOpen]);

  useEffect(() => {
    if (cloudOpenState !== "preparing") return;
    const id = window.setInterval(() => {
      const popup = cloudPopupRef.current;
      if (!popup || popup.closed) {
        window.clearInterval(id);
        cloudPopupRef.current = null;
        pendingCloudOpenRef.current = false;
        setCloudOpenState("idle");
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [cloudOpenState]);

  useEffect(
    () => () => {
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (loginState === "error" && pendingCloudOpenRef.current) {
      pendingCloudOpenRef.current = false;
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: loginError ?? "sign-in failed.",
      });
    }
  }, [loginState, loginError, closeCloudPopup, setNotice]);

  return {
    cloudOpenState,
    handleCancelCloudOpen,
    handleOpenCloud,
  };
}
