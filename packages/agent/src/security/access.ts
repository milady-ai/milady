import type { IAgentRuntime, Memory } from "@elizaos/core";
import * as roles from "@elizaos/core/roles";

type AccessContext = {
  runtime: IAgentRuntime & { agentId: string };
  message: Memory & { entityId: string };
};

function getAccessContext(
  runtime: IAgentRuntime | undefined,
  message: Memory | undefined,
): AccessContext | null {
  if (
    !runtime ||
    typeof runtime.agentId !== "string" ||
    !message ||
    typeof message.entityId !== "string" ||
    message.entityId.length === 0
  ) {
    return null;
  }

  return {
    runtime,
    message,
  };
}

export function isAgentSelf(
  runtime: IAgentRuntime | undefined,
  message: Memory | undefined,
): boolean {
  const context = getAccessContext(runtime, message);
  if (!context) {
    return false;
  }
  return context.message.entityId === context.runtime.agentId;
}

async function isCanonicalOwner(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<boolean> {
  const resolveOwner = (
    roles as {
      resolveCanonicalOwnerIdForMessage?: (
        runtime: IAgentRuntime,
        message: Memory,
      ) => Promise<string | null>;
    }
  ).resolveCanonicalOwnerIdForMessage;
  if (typeof resolveOwner !== "function") {
    return false;
  }

  try {
    const ownerId = await resolveOwner(runtime, message);
    return typeof ownerId === "string" && ownerId === message.entityId;
  } catch {
    return false;
  }
}

export async function hasOwnerAccess(
  runtime: IAgentRuntime | undefined,
  message: Memory | undefined,
): Promise<boolean> {
  const context = getAccessContext(runtime, message);
  if (!context) {
    return true;
  }

  if (isAgentSelf(context.runtime, context.message)) {
    return true;
  }

  if (await isCanonicalOwner(context.runtime, context.message)) {
    return true;
  }

  const checkRole = (
    roles as {
      checkSenderRole?: (
        runtime: IAgentRuntime,
        message: Memory,
      ) => Promise<{ isOwner?: boolean } | null>;
    }
  ).checkSenderRole;
  if (typeof checkRole !== "function") {
    return false;
  }

  try {
    const role = await checkRole(context.runtime, context.message);
    return role?.isOwner === true;
  } catch {
    return false;
  }
}

export async function hasAdminAccess(
  runtime: IAgentRuntime | undefined,
  message: Memory | undefined,
): Promise<boolean> {
  const context = getAccessContext(runtime, message);
  if (!context) {
    return true;
  }

  if (isAgentSelf(context.runtime, context.message)) {
    return true;
  }

  if (await isCanonicalOwner(context.runtime, context.message)) {
    return true;
  }

  const checkRole = (
    roles as {
      checkSenderRole?: (
        runtime: IAgentRuntime,
        message: Memory,
      ) => Promise<{ isAdmin?: boolean } | null>;
    }
  ).checkSenderRole;
  if (typeof checkRole !== "function") {
    return false;
  }

  try {
    const role = await checkRole(context.runtime, context.message);
    return role?.isAdmin === true;
  } catch {
    return false;
  }
}

export async function hasPrivateAccess(
  runtime: IAgentRuntime | undefined,
  message: Memory | undefined,
): Promise<boolean> {
  const context = getAccessContext(runtime, message);
  if (!context) {
    return true;
  }

  if (isAgentSelf(context.runtime, context.message)) {
    return true;
  }

  if (await isCanonicalOwner(context.runtime, context.message)) {
    return true;
  }

  const checkPrivateAccess = (
    roles as {
      checkSenderPrivateAccess?: (
        runtime: IAgentRuntime,
        message: Memory,
      ) => Promise<{ hasPrivateAccess?: boolean } | null>;
    }
  ).checkSenderPrivateAccess;
  if (typeof checkPrivateAccess !== "function") {
    return false;
  }

  try {
    const access = await checkPrivateAccess(context.runtime, context.message);
    return access?.hasPrivateAccess === true;
  } catch {
    return false;
  }
}
