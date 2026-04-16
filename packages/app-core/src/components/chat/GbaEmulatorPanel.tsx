import { Button } from "@miladyai/ui";
import {
  ChevronDown,
  Gamepad2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneOverlayManager } from "../avatar/SceneOverlayManager";
import type { VrmEngine } from "../avatar/VrmEngine";
import {
  cacheRom,
  getCachedRom,
  listCachedRoms,
  removeCachedRom,
  type CachedRomMeta,
} from "./gba-rom-cache";

interface GbaEmulatorPanelProps {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

// ── Floating toolbar above 3D GBA monitor ─────────────────────────

function findFirstEngine(): VrmEngine | null {
  const registry = (
    window as {
      __ELIZA_VRM_ENGINES__?: Array<{ engine: VrmEngine }>;
    }
  ).__ELIZA_VRM_ENGINES__;
  if (!registry) return null;
  for (const entry of registry) return entry.engine;
  return null;
}

/**
 * Tiny toolbar that floats above the 3D GBA monitor in companion mode.
 * Provides Refocus, Save, and Load buttons so users don't have to open
 * the full emulator panel for common actions.
 */
function GbaMonitorToolbar({
  hasRom,
  proxyActive,
  onFocus,
  onSave,
  onLoad,
}: {
  hasRom: boolean;
  proxyActive: boolean;
  onFocus: () => void;
  onSave: () => void;
  onLoad: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const rafRef = useRef(0);

  const prevRef = useRef({ x: 0, y: 0, visible: false });

  useEffect(() => {
    function tick() {
      const engine = findFirstEngine();
      if (engine) {
        const p = engine.getGbaScreenTopCenter();
        const prev = prevRef.current;
        // Only update state when position changes by >1px or visibility toggles
        if (
          p.visible !== prev.visible ||
          Math.abs(p.x - prev.x) > 1 ||
          Math.abs(p.y - prev.y) > 1
        ) {
          prevRef.current = p;
          setPos(p);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  if (!pos.visible) return null;

  return (
    <div
      className="fixed z-[52] flex items-center gap-1 pointer-events-auto"
      style={{
        left: pos.x,
        top: pos.y - 8,
        transform: "translate(-50%, -100%)",
      }}
      data-no-camera-drag="true"
      data-no-camera-zoom="true"
      data-gba-toolbar="true"
    >
      {hasRom ? (
        <>
          <button
            type="button"
            onClick={onFocus}
            className={`px-2 py-1 rounded-md backdrop-blur text-[11px] transition-colors cursor-pointer ${
              proxyActive
                ? "bg-green-600/80 text-white"
                : "bg-black/70 text-white/80 hover:text-white hover:bg-black/90"
            }`}
            title={proxyActive ? "Keyboard controls active" : "Activate keyboard controls"}
          >
            <Gamepad2 className="w-3.5 h-3.5 inline-block mr-1" />
            {proxyActive ? "Playing" : "Focus"}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[11px] text-white/80 hover:text-white hover:bg-black/90 transition-colors cursor-pointer"
            title="Save state"
          >
            <Save className="w-3.5 h-3.5 inline-block mr-1" />
            Save
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={onLoad}
        className="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[11px] text-white/80 hover:text-white hover:bg-black/90 transition-colors cursor-pointer"
        title="Load a ROM"
      >
        <Upload className="w-3.5 h-3.5 inline-block mr-1" />
        {hasRom ? "New" : "Load ROM"}
      </button>
    </div>
  );
}

/** Find the overlay manager from the VRM engine debug registry. */
function findOverlayManager(): SceneOverlayManager | null {
  const registry = (
    window as {
      __ELIZA_VRM_ENGINES__?: Array<{ engine: VrmEngine }>;
    }
  ).__ELIZA_VRM_ENGINES__;
  if (!registry) return null;
  for (const entry of registry) {
    const overlay = entry.engine.getOverlayManager();
    if (overlay) return overlay;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * GBA emulator panel using EmulatorJS in a cross-origin-isolated iframe.
 *
 * The iframe at /__gba__ is served with COOP + COEP require-corp headers so
 * SharedArrayBuffer is available for the 7zip WASM decompressor. The ROM file
 * bytes are transferred to the iframe via a MessageChannel (avoids blob URL
 * cross-origin issues caused by COOP browsing-context-group separation).
 *
 * When the 3D companion scene is active, emulator frames are streamed from
 * the iframe via a second MessageChannel and rendered onto a floating monitor
 * mesh in the Three.js scene.
 *
 * The iframe is always mounted (hidden off-screen) when a ROM is loaded so
 * the emulator keeps running even when the panel UI is closed. This lets the
 * 3D monitor display the game in companion mode without the panel visible.
 */
export function GbaEmulatorPanel({ open, onClose, onOpen }: GbaEmulatorPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [romFile, setRomFile] = useState<File | null>(null);
  const [romBytes, setRomBytes] = useState<ArrayBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Bump to force iframe remount when a new ROM is loaded
  const [iframeKey, setIframeKey] = useState(0);
  // Port used to send commands to the iframe (ROM data, frame requests)
  const commandPortRef = useRef<MessagePort | null>(null);
  // Port receiving frames from the iframe
  const framePortRef = useRef<MessagePort | null>(null);
  const streamingRef = useRef(false);
  const frameStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Game library state ──────────────────────────────────────────────
  const [cachedRoms, setCachedRoms] = useState<CachedRomMeta[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Autosave state ──────────────────────────────────────────────────
  const [autosaveActive, setAutosaveActive] = useState(false);
  const [lastAutosave, setLastAutosave] = useState<number | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load cached ROM list on mount
  useEffect(() => {
    listCachedRoms().then(setCachedRoms).catch(() => {});
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── Load ROM into emulator (shared logic) ───────────────────────────
  const loadRomIntoEmulator = useCallback(
    (bytes: ArrayBuffer, fileName: string) => {
      setRomFile({ name: fileName } as File);
      setRomBytes(bytes);
      setIframeKey((k) => k + 1);
    },
    [],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const bytes = await file.arrayBuffer();
      setRomFile(file);
      setRomBytes(bytes);
      setIframeKey((k) => k + 1);

      // Cache the ROM for the game menu
      const meta = await cacheRom(file.name, bytes);
      setCachedRoms((prev) => {
        const filtered = prev.filter((r) => r.id !== meta.id);
        return [meta, ...filtered];
      });
    },
    [],
  );

  // Select a cached ROM from the game menu
  const handleSelectCachedRom = useCallback(
    async (meta: CachedRomMeta) => {
      setMenuOpen(false);
      const bytes = await getCachedRom(meta.id);
      if (!bytes) return;
      loadRomIntoEmulator(bytes, meta.name);
    },
    [loadRomIntoEmulator],
  );

  // Remove a cached ROM
  const handleRemoveCachedRom = useCallback(
    async (e: React.MouseEvent, meta: CachedRomMeta) => {
      e.stopPropagation();
      await removeCachedRom(meta.id);
      setCachedRoms((prev) => prev.filter((r) => r.id !== meta.id));
    },
    [],
  );

  // ── Autosave ────────────────────────────────────────────────────────
  const startAutosave = useCallback(() => {
    if (autosaveTimerRef.current) return;
    setAutosaveActive(true);
    // Send autosave command to iframe every 5 minutes
    autosaveTimerRef.current = setInterval(() => {
      const port = commandPortRef.current;
      if (port) {
        port.postMessage({ type: "gba-autosave" });
        setLastAutosave(Date.now());
      }
    }, 5 * 60 * 1000);
  }, []);

  const stopAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setAutosaveActive(false);
  }, []);

  const loadAutosave = useCallback(() => {
    const port = commandPortRef.current;
    if (port) {
      port.postMessage({ type: "gba-load-autosave" });
    }
  }, []);

  // Auto-start autosave when a ROM is loaded
  useEffect(() => {
    if (romBytes) {
      // Small delay to let the emulator initialize
      const t = setTimeout(startAutosave, 5000);
      return () => clearTimeout(t);
    }
    stopAutosave();
    return undefined;
  }, [romBytes, iframeKey, startAutosave, stopAutosave]);

  // Start streaming frames from the iframe to the 3D scene monitor
  const startFrameStreaming = useCallback(() => {
    const port = commandPortRef.current;
    if (!port || streamingRef.current) return;

    const channel = new MessageChannel();
    framePortRef.current = channel.port1;
    streamingRef.current = true;

    // The iframe sends each frame as a transferred ImageBitmap directly.
    channel.port1.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!(data instanceof ImageBitmap)) return;

      const manager = findOverlayManager();
      if (manager) {
        manager.setGbaFrame(data);
      }
      data.close();
    };

    // Tell the iframe to start streaming, passing the receiving port
    port.postMessage({ type: "gba-start-frames" }, [channel.port2]);
  }, []);

  const stopFrameStreaming = useCallback(() => {
    const wasStreaming = streamingRef.current;
    streamingRef.current = false;
    if (framePortRef.current) {
      framePortRef.current.close();
      framePortRef.current = null;
    }
    const port = commandPortRef.current;
    if (port) {
      port.postMessage({ type: "gba-stop-frames" });
    }
    // Only hide the 3D monitor if we were actively streaming frames.
    // When we weren't streaming, the monitor shows the "Click to load ROM"
    // placeholder and should stay visible so users can click it.
    if (wasStreaming) {
      const manager = findOverlayManager();
      if (manager) {
        manager.setGbaVisible(false);
      }
    }
  }, []);

  // When the iframe loads, send the ROM bytes via MessageChannel
  const handleIframeLoad = useCallback(() => {
    if (!romBytes || !iframeRef.current?.contentWindow) return;

    const channel = new MessageChannel();
    commandPortRef.current = channel.port1;

    // Send the init message with one port transferred to the iframe
    iframeRef.current.contentWindow.postMessage(
      { type: "gba-init" },
      "*",
      [channel.port2],
    );
    // Send ROM data through the channel port (transferable for zero-copy)
    const copy = romBytes.slice(0);
    channel.port1.postMessage(
      { type: "gba-rom-data", romBytes: copy },
      [copy],
    );

    // Start frame streaming after a delay to let the emulator initialize
    if (frameStartTimerRef.current) clearTimeout(frameStartTimerRef.current);
    frameStartTimerRef.current = setTimeout(() => {
      frameStartTimerRef.current = null;
      startFrameStreaming();
    }, 3000);
  }, [romBytes, startFrameStreaming]);

  // ── Keyboard proxy ──────────────────────────────────────────────
  // The iframe is off-screen when the panel is closed (streaming frames to
  // the 3D monitor). It can't receive keyboard focus. Instead, when the
  // user clicks "Focus", we intercept all keyboard events on the parent
  // document and forward them to the iframe via the command port.
  const [keyProxyActive, setKeyProxyActive] = useState(false);

  useEffect(() => {
    if (!keyProxyActive) return;
    // Only proxy GBA-relevant keys — let browser shortcuts through
    const GBA_KEYS = new Set([
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "KeyZ", "KeyX", "KeyA", "KeyS",        // A, B, L, R
      "Enter", "ShiftRight",                  // Start, Select
      "Space", "Backspace",
    ]);
    const handler = (e: KeyboardEvent) => {
      // Let all modifier combos through (Cmd+R, Ctrl+Tab, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const port = commandPortRef.current;
      if (!port) return;
      // Stop proxying if user focused an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        setKeyProxyActive(false);
        return;
      }
      if (!GBA_KEYS.has(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      port.postMessage({
        type: "gba-key",
        eventType: e.type,
        code: e.code,
        key: e.key,
        keyCode: e.keyCode,
        which: e.which,
      });
    };
    // Deactivate on any click outside the toolbar
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-gba-toolbar]")) return;
      setKeyProxyActive(false);
    };
    window.addEventListener("keydown", handler, true);
    window.addEventListener("keyup", handler, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("keyup", handler, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [keyProxyActive]);

  const focusEmulator = useCallback(() => {
    setKeyProxyActive(true);
  }, []);

  // Expose a global trigger so the 3D scene click can open the file picker
  // (no ROM loaded) or open the panel (ROM already loaded).
  useEffect(() => {
    const w = window as {
      __GBA_TRIGGER_ROM_UPLOAD__?: () => void;
      __GBA_REFOCUS__?: () => void;
    };
    w.__GBA_TRIGGER_ROM_UPLOAD__ = () => {
      // Only open the file picker — never open the panel from the 3D
      // monitor click. The iframe mounts automatically when romBytes
      // is set and streams frames to the 3D monitor.
      fileInputRef.current?.click();
    };
    // Exposed so CompanionSceneHost can refocus the emulator after overlay
    // interactions (resize/drag) that steal focus from the iframe.
    w.__GBA_REFOCUS__ = focusEmulator;
    return () => {
      delete w.__GBA_TRIGGER_ROM_UPLOAD__;
      delete w.__GBA_REFOCUS__;
    };
  }, [open, onOpen, romBytes, focusEmulator]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopFrameStreaming();
      stopAutosave();
    };
  }, [stopFrameStreaming, stopAutosave]);

  // Ref for the emulator area div so we can measure it for iframe positioning
  const emulatorAreaRef = useRef<HTMLDivElement>(null);
  const [emulatorAreaRect, setEmulatorAreaRect] = useState<DOMRect | null>(null);

  // Track the emulator area position so the iframe can overlay it exactly
  useEffect(() => {
    if (!open || !emulatorAreaRef.current) {
      setEmulatorAreaRect(null);
      return;
    }
    const el = emulatorAreaRef.current;
    const update = () => setEmulatorAreaRect(el.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // Reload current ROM
  const handleReload = useCallback(() => {
    if (romBytes) {
      setIframeKey((k) => k + 1);
    }
  }, [romBytes]);

  return (
    <>
      {/* Hidden file input — always mounted so the 3D monitor click can trigger it */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".gba,.gbc,.gb,.zip"
        onChange={(e) => {
          void handleFileSelect(e);
        }}
        className="hidden"
      />

      {/* Single iframe — repositioned via CSS between the panel (interactive)
          and off-screen (background streaming to 3D monitor). Never
          unmounted while a ROM is loaded, so the emulator keeps running. */}
      {romBytes ? (
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src="/__gba__"
          onLoad={handleIframeLoad}
          title="GBA Emulator"
          allow="cross-origin-isolated"
          className="fixed border-0"
          style={
            open && emulatorAreaRect
              ? {
                  top: emulatorAreaRect.top,
                  left: emulatorAreaRect.left,
                  width: emulatorAreaRect.width,
                  height: emulatorAreaRect.height,
                  zIndex: 51,
                  pointerEvents: "auto",
                }
              : {
                  top: -9999,
                  left: -9999,
                  width: 480,
                  height: 320,
                  pointerEvents: "none",
                }
          }
        />
      ) : null}

      {/* Floating toolbar above the 3D monitor — visible when panel is closed */}
      {!open && (
        <GbaMonitorToolbar
          hasRom={!!romBytes}
          proxyActive={keyProxyActive}
          onFocus={focusEmulator}
          onSave={() => {
            const port = commandPortRef.current;
            if (port) {
              port.postMessage({ type: "gba-autosave" });
              setLastAutosave(Date.now());
            }
          }}
          onLoad={() => fileInputRef.current?.click()}
        />
      )}

      {!open ? null : (
    <div
      className="fixed right-4 top-14 bottom-4 z-50 flex flex-col rounded-xl border border-border bg-bg shadow-2xl w-[420px] xl:w-[480px] 2xl:w-[540px]"
      data-no-camera-drag="true"
      data-no-camera-zoom="true"
      onClick={() => {
        // Re-focus the iframe when clicking the panel so keyboard
        // controls work again after clicking elsewhere (e.g. chat input).
        // Must use postMessage — direct .focus() doesn't cross COOP boundaries.
        focusEmulator();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 rounded-t-xl">
        <div className="flex items-center gap-2 text-sm font-medium text-txt">
          <Gamepad2 className="w-4 h-4" />
          <span>GBA Emulator</span>
          {romFile ? (
            <span className="text-xs text-muted truncate max-w-[140px]">
              — {romFile.name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {/* Autosave indicator */}
          {autosaveActive ? (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted cursor-pointer hover:bg-white/5"
              title={
                lastAutosave
                  ? `Last autosave: ${formatTimeAgo(lastAutosave)}\nClick to load autosave`
                  : "Autosave active (every 5 min)"
              }
              onClick={loadAutosave}
            >
              <Save className="w-3 h-3 text-green-500" />
              <span>{lastAutosave ? formatTimeAgo(lastAutosave) : "auto"}</span>
            </div>
          ) : null}
          {/* Game selection menu */}
          <div className="relative" ref={menuRef}>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="Game Library"
              title="Game Library"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            {menuOpen ? (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-bg shadow-xl z-[60] overflow-hidden">
                <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted uppercase tracking-wide">
                  Game Library
                </div>
                {cachedRoms.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted/60 text-center">
                    No cached ROMs yet. Upload a game to get started.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {cachedRoms.map((rom) => (
                      <button
                        type="button"
                        key={rom.id}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors group"
                        onClick={() => void handleSelectCachedRom(rom)}
                      >
                        <Gamepad2 className="w-3.5 h-3.5 text-muted/50 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-txt truncate">{rom.name}</div>
                          <div className="text-[10px] text-muted/50">
                            {formatBytes(rom.size)} — {formatTimeAgo(rom.cachedAt)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 transition-opacity"
                          onClick={(e) => void handleRemoveCachedRom(e, rom)}
                          title="Remove from cache"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
                <div className="border-t border-border">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors text-sm text-muted"
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload new ROM...</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {/* Reload */}
          {romBytes ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleReload}
              aria-label="Reload game"
              title="Reload game"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Load ROM"
          >
            <Upload className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="Close GBA Emulator"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Emulator area — the iframe overlays this div when panel is open */}
      <div
        ref={emulatorAreaRef}
        className="flex-1 min-h-0 overflow-hidden bg-black rounded-b-xl"
      >
        {!romBytes ? (
          <button
            type="button"
            className="flex flex-col items-center justify-center w-full h-full gap-3 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Gamepad2 className="w-12 h-12 text-muted/40" />
            <p className="text-sm text-muted/60">
              Click to load a GBA ROM file
            </p>
            <p className="text-xs text-muted/40">.gba, .gbc, .gb, .zip</p>
            {cachedRoms.length > 0 ? (
              <p className="text-xs text-muted/40 mt-2">
                or use the <ChevronDown className="w-3 h-3 inline" /> menu for cached games
              </p>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
      )}
    </>
  );
}
