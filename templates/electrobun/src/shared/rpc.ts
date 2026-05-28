import type { RPCSchema } from "electrobun";
import type { AppCommandId, Permission, Result } from "./domain";

export type AgentRunInput = {
  prompt: string;
  selectedText?: string;
  mode: "dry-run" | "execute";
};

export type AgentRunOutput = {
  summary: string;
  proposedActions: Array<{
    id: AppCommandId | string;
    title: string;
    requiresConfirmation: boolean;
    permissions: Permission[];
  }>;
};

export type UpdateCheckOutput = {
  updateAvailable: boolean;
  updateReady: boolean;
  version?: string;
  error?: string;
};

export type MainViewRPC = {
  bun: RPCSchema<{
    requests: {
      runAgent: {
        params: AgentRunInput;
        response: Result<AgentRunOutput>;
      };
      cancelAgent: {
        params: { runId: string };
        response: Result<{ cancelled: boolean }>;
      };
      checkForUpdate: {
        params: Record<string, never>;
        response: Result<UpdateCheckOutput>;
      };
      dispatchCommand: {
        params: { id: AppCommandId; payload?: unknown };
        response: Result<{ handled: boolean }>;
      };
    };
    messages: {
      logUiEvent: {
        name: string;
        metadata?: Record<string, string | number | boolean>;
      };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      showAgentProgress: {
        params: { runId: string; message: string; progress?: number };
        response: { accepted: boolean };
      };
    };
    messages: {
      showToast: {
        level: "info" | "warning" | "error";
        message: string;
      };
    };
  }>;
};
