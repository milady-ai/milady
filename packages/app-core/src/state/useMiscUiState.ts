/**
 * Miscellaneous UI state — extracted from AppContext.
 *
 * Covers three loosely-coupled UI domains that don't warrant their
 * own dedicated hook files:
 *
 *  - MCP: configured servers, statuses, marketplace flow
 *  - Games: active game iframe state and overlay flag
 *  - UI chrome: command palette, emote picker, dropped files
 */

import { useCallback, useState } from "react";
import type {
  McpMarketplaceResult,
  McpRegistryServerDetail,
  McpServerConfig,
  McpServerStatus,
} from "../api";
import type { GamePostMessageAuthPayload } from "./internal";

export function useMiscUiState() {
  // ── Command palette ────────────────────────────────────────────────
  const [commandPaletteOpen, _setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // ── Emote picker ───────────────────────────────────────────────────
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);

  // ── MCP ────────────────────────────────────────────────────────────
  const [mcpConfiguredServers, setMcpConfiguredServers] = useState<
    Record<string, McpServerConfig>
  >({});
  const [mcpServerStatuses, setMcpServerStatuses] = useState<McpServerStatus[]>(
    [],
  );
  const [mcpMarketplaceQuery, setMcpMarketplaceQuery] = useState("");
  const [mcpMarketplaceResults, setMcpMarketplaceResults] = useState<
    McpMarketplaceResult[]
  >([]);
  const [mcpMarketplaceLoading, setMcpMarketplaceLoading] = useState(false);
  const [mcpAction, setMcpAction] = useState("");
  const [mcpAddingServer, setMcpAddingServer] =
    useState<McpRegistryServerDetail | null>(null);
  const [mcpAddingResult, setMcpAddingResult] =
    useState<McpMarketplaceResult | null>(null);
  const [mcpEnvInputs, setMcpEnvInputs] = useState<Record<string, string>>({});
  const [mcpHeaderInputs, setMcpHeaderInputs] = useState<
    Record<string, string>
  >({});

  // ── Share ingest / dropped files ───────────────────────────────────
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [shareIngestNotice, setShareIngestNotice] = useState("");

  // ── Game ───────────────────────────────────────────────────────────
  const [activeGameApp, setActiveGameApp] = useState("");
  const [activeGameDisplayName, setActiveGameDisplayName] = useState("");
  const [activeGameViewerUrl, setActiveGameViewerUrl] = useState("");
  const [activeGameSandbox, setActiveGameSandbox] = useState(
    "allow-scripts allow-same-origin allow-popups",
  );
  const [activeGamePostMessageAuth, setActiveGamePostMessageAuth] =
    useState(false);
  const [activeGamePostMessagePayload, setActiveGamePostMessagePayload] =
    useState<GamePostMessageAuthPayload | null>(null);
  const [gameOverlayEnabled, setGameOverlayEnabled] = useState(false);

  // ── Callbacks ──────────────────────────────────────────────────────

  const closeCommandPalette = useCallback(() => {
    _setCommandPaletteOpen(false);
    setCommandQuery("");
    setCommandActiveIndex(0);
  }, []);

  const openEmotePicker = useCallback(() => {
    setEmotePickerOpen(true);
  }, []);

  const closeEmotePicker = useCallback(() => {
    setEmotePickerOpen(false);
  }, []);

  return {
    state: {
      commandPaletteOpen,
      commandQuery,
      commandActiveIndex,
      emotePickerOpen,
      mcpConfiguredServers,
      mcpServerStatuses,
      mcpMarketplaceQuery,
      mcpMarketplaceResults,
      mcpMarketplaceLoading,
      mcpAction,
      mcpAddingServer,
      mcpAddingResult,
      mcpEnvInputs,
      mcpHeaderInputs,
      droppedFiles,
      shareIngestNotice,
      activeGameApp,
      activeGameDisplayName,
      activeGameViewerUrl,
      activeGameSandbox,
      activeGamePostMessageAuth,
      activeGamePostMessagePayload,
      gameOverlayEnabled,
    },
    setCommandQuery,
    setCommandActiveIndex,
    setEmotePickerOpen,
    setMcpConfiguredServers,
    setMcpServerStatuses,
    setMcpMarketplaceQuery,
    setMcpMarketplaceResults,
    setMcpMarketplaceLoading,
    setMcpAction,
    setMcpAddingServer,
    setMcpAddingResult,
    setMcpEnvInputs,
    setMcpHeaderInputs,
    setDroppedFiles,
    setShareIngestNotice,
    setActiveGameApp,
    setActiveGameDisplayName,
    setActiveGameViewerUrl,
    setActiveGameSandbox,
    setActiveGamePostMessageAuth,
    setActiveGamePostMessagePayload,
    setGameOverlayEnabled,
    closeCommandPalette,
    openEmotePicker,
    closeEmotePicker,
  };
}
