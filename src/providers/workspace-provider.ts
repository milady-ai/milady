/**
 * Reads workspace bootstrap files and injects them into agent context.
 *
 * Also provides coding agent context enrichment: when coding-agent metadata
 * is present on the inbound message, the provider appends a summary of the
 * current coding session state (active iteration, recent errors, pending
 * feedback) so the LLM has full awareness during the autonomous coding loop.
 */

import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import type { CodingAgentContext } from "../services/coding-agent-context.js";
import {
  DEFAULT_AGENT_WORKSPACE_DIR,
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
} from "./workspace.js";

const DEFAULT_MAX_CHARS = 20_000;
/** Hard cap on total workspace context to prevent prompt explosion. */
const MAX_TOTAL_WORKSPACE_CHARS = 100_000;
const CACHE_TTL_MS = 60_000;

// Per-workspace cache so multi-agent doesn't thrash.
const cache = new Map<
  string,
  { files: WorkspaceBootstrapFile[]; at: number }
>();
/** Maximum number of workspace directories to cache simultaneously. */
const MAX_CACHE_ENTRIES = 20;

async function getFiles(dir: string): Promise<WorkspaceBootstrapFile[]> {
  const now = Date.now();
  const entry = cache.get(dir);
  if (entry && now - entry.at < CACHE_TTL_MS) return entry.files;

  // Evict expired entries and enforce size cap before inserting
  for (const [key, val] of cache) {
    if (now - val.at >= CACHE_TTL_MS) cache.delete(key);
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Remove the oldest entry
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  const files = await loadWorkspaceBootstrapFiles(dir);
  cache.set(dir, { files, at: now });
  return files;
}

/** @internal Exported for testing. */
export function truncate(content: string, max: number): string {
  if (content.length <= max) return content;
  return `${content.slice(0, max)}\n\n[... truncated at ${max.toLocaleString()} chars]`;
}

/** @internal Exported for testing. */
export function buildContext(
  files: WorkspaceBootstrapFile[],
  maxChars: number,
): string {
  const sections: string[] = [];
  let totalChars = 0;
  for (const f of files) {
    if (f.missing || !f.content?.trim()) continue;
    const trimmed = f.content.trim();
    // Per-file truncation
    const text = truncate(trimmed, maxChars);
    const tag = text.length > trimmed.length ? " [TRUNCATED]" : "";
    const section = `### ${f.name}${tag}\n\n${text}`;
    // Stop adding files if the total would exceed the hard cap
    if (
      totalChars + section.length > MAX_TOTAL_WORKSPACE_CHARS &&
      sections.length > 0
    ) {
      break;
    }
    sections.push(section);
    totalChars += section.length;
  }
  if (sections.length === 0) return "";
  return `## Project Context (Workspace)\n\n${sections.join("\n\n---\n\n")}`;
}

// ---------------------------------------------------------------------------
// Coding Agent Context Enrichment
// ---------------------------------------------------------------------------

/**
 * Build a text summary of coding agent context for prompt injection.
 *
 * When a coding session is active, this gives the LLM visibility into:
 * - Current iteration number and status
 * - Recent errors that need self-correction
 * - Pending human feedback to incorporate
 * - Connector type and availability
 *
 * @internal Exported for testing.
 */
export function buildCodingAgentSummary(ctx: CodingAgentContext): string {
  const lines: string[] = [];
  lines.push("## Coding Agent Session");
  lines.push("");
  lines.push(`- **Task:** ${ctx.taskDescription}`);
  lines.push(`- **Working Directory:** ${ctx.workingDirectory}`);
  lines.push(
    `- **Connector:** ${ctx.connector.type} (${ctx.connector.available ? "available" : "unavailable"})`,
  );
  lines.push(`- **Mode:** ${ctx.interactionMode}`);
  lines.push(
    `- **Iterations:** ${ctx.iterations.length} / ${ctx.maxIterations}`,
  );
  lines.push(`- **Active:** ${ctx.active ? "yes" : "no"}`);

  // Recent errors from the last iteration
  const lastIteration = ctx.iterations[ctx.iterations.length - 1];
  if (lastIteration && lastIteration.errors.length > 0) {
    lines.push("");
    lines.push("### Errors to Resolve");
    for (const err of lastIteration.errors) {
      const location = err.filePath
        ? ` at ${err.filePath}${err.line ? `:${err.line}` : ""}`
        : "";
      lines.push(`- [${err.category}]${location}: ${err.message}`);
    }
  }

  // Pending feedback
  const pendingFeedback = ctx.allFeedback.filter((f) => {
    // Feedback is "pending" if it was submitted after the last iteration started
    if (!lastIteration) return true;
    return f.timestamp > lastIteration.startedAt;
  });
  if (pendingFeedback.length > 0) {
    lines.push("");
    lines.push("### Human Feedback");
    for (const fb of pendingFeedback) {
      lines.push(`- [${fb.type}]: ${fb.text}`);
    }
  }

  // Recent command results from the last iteration
  if (lastIteration && lastIteration.commandResults.length > 0) {
    lines.push("");
    lines.push("### Recent Commands");
    for (const cmd of lastIteration.commandResults.slice(-5)) {
      const status = cmd.success ? "OK" : `FAIL(${cmd.exitCode})`;
      lines.push(`- \`${cmd.command}\` → ${status}`);
    }
  }

  return lines.join("\n");
}

/**
 * Check if a message carries coding agent context in its metadata.
 */
function extractCodingAgentContext(message: Memory): CodingAgentContext | null {
  const meta = message.metadata as Record<string, unknown> | undefined;
  if (!meta) return null;

  const codingCtx = meta.codingAgentContext;
  if (!codingCtx || typeof codingCtx !== "object") return null;

  // Lightweight duck-type check — full validation happens in the service layer
  const ctx = codingCtx as Record<string, unknown>;
  if (
    typeof ctx.sessionId !== "string" ||
    typeof ctx.taskDescription !== "string"
  ) {
    return null;
  }

  return codingCtx as CodingAgentContext;
}

export function createWorkspaceProvider(options?: {
  workspaceDir?: string;
  maxCharsPerFile?: number;
}): Provider {
  const dir = options?.workspaceDir ?? DEFAULT_AGENT_WORKSPACE_DIR;
  const maxChars = options?.maxCharsPerFile ?? DEFAULT_MAX_CHARS;

  return {
    name: "workspaceContext",
    description:
      "Workspace bootstrap files (AGENTS.md, TOOLS.md, IDENTITY.md, etc.) and coding agent context",
    position: 10,

    async get(
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ): Promise<ProviderResult> {
      try {
        const allFiles = await getFiles(dir);
        const meta = message.metadata as Record<string, unknown> | undefined;
        const sessionKey =
          typeof meta?.sessionKey === "string" ? meta.sessionKey : undefined;
        const files = filterBootstrapFilesForSession(allFiles, sessionKey);
        let text = buildContext(files, maxChars);

        // Enrich with coding agent context if present
        const codingCtx = extractCodingAgentContext(message);
        if (codingCtx) {
          const codingSummary = buildCodingAgentSummary(codingCtx);
          text = text ? `${text}\n\n---\n\n${codingSummary}` : codingSummary;
        }

        return {
          text,
          data: {
            workspaceDir: dir,
            ...(codingCtx ? { codingSession: codingCtx.sessionId } : {}),
          },
        };
      } catch (err) {
        return {
          text: `[Workspace context unavailable: ${err instanceof Error ? err.message : err}]`,
          data: {},
        };
      }
    },
  };
}
