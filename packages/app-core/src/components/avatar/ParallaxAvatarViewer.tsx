/**
 * ParallaxAvatarViewer — React wrapper around ParallaxAvatarEngine.
 *
 * Analogous to VrmViewer but renders a layered 2D parallax avatar
 * instead of a 3D VRM model.
 */

import { memo, useCallback, useEffect, useRef } from "react";
import {
  ParallaxAvatarEngine,
  type ParallaxEngineState,
} from "./ParallaxAvatarEngine";

export interface ParallaxAvatarViewerProps {
  active?: boolean;
  assetBasePath: string;
  onEngineState?: (state: ParallaxEngineState) => void;
  onRevealStart?: () => void;
}

export const ParallaxAvatarViewer = memo(function ParallaxAvatarViewer({
  active = true,
  assetBasePath,
  onEngineState,
  onRevealStart,
}: ParallaxAvatarViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ParallaxAvatarEngine | null>(null);
  const onEngineStateRef = useRef(onEngineState);
  const onRevealStartRef = useRef(onRevealStart);
  onEngineStateRef.current = onEngineState;
  onRevealStartRef.current = onRevealStart;

  // ── Engine lifecycle ──────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new ParallaxAvatarEngine(canvas, assetBasePath);
    engineRef.current = engine;

    engine.setStateCallback((state) => {
      onEngineStateRef.current?.(state);
      if (state.loaded) {
        onRevealStartRef.current?.();
      }
    });

    // Initial sizing
    const rect = container.getBoundingClientRect();
    engine.resize(rect.width, rect.height);

    // ResizeObserver for responsive canvas
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engine.resize(width, height);
      }
    });
    observer.observe(container);

    // Load and start rendering
    void engine.load();

    return () => {
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, [assetBasePath]);

  // ── Pause / resume ────────────────────────────────────────────────

  useEffect(() => {
    if (active) {
      engineRef.current?.resume();
    } else {
      engineRef.current?.pause();
    }
  }, [active]);

  // ── Pointer tracking ──────────────────────────────────────────────

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const normalizedX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    engineRef.current?.setPointerPosition(normalizedX, normalizedY);
  }, []);

  const handlePointerLeave = useCallback(() => {
    engineRef.current?.setPointerPosition(0, 0);
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
});
