/**
 * VRM avatar canvas component.
 *
 * Renders a VRM model with idle animation and mouth-sync driven by
 * the `mouthOpen` prop. Sized to fill its parent container.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VrmEngine, type VrmEngineState } from "./VrmEngine";

const DEFAULT_VRM_PATH = "/vrms/1.vrm";

export type VrmViewerProps = {
  /** Path to the VRM file to load (default: /vrms/1.vrm) */
  vrmPath?: string;
  mouthOpen: number;
  /** When true the engine generates mouth animation internally */
  isSpeaking?: boolean;
  onEngineState?: (state: VrmEngineState) => void;
  onEngineReady?: (engine: VrmEngine) => void;
  onError?: (error: string) => void;
};

export function VrmViewer(props: VrmViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<VrmEngine | null>(null);
  const mouthOpenRef = useRef<number>(props.mouthOpen);
  const isSpeakingRef = useRef<boolean>(props.isSpeaking ?? false);
  const lastStateEmitMsRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const currentVrmPathRef = useRef<string>("");
  const [webglError, setWebglError] = useState<string | null>(null);
  const errorShownRef = useRef(false);

  mouthOpenRef.current = props.mouthOpen;
  isSpeakingRef.current = props.isSpeaking ?? false;

  // Check if user already dismissed the WebGL error
  const webglErrorDismissed = typeof window !== "undefined"
    && localStorage.getItem("webgl-error-dismissed") === "true";

  const dismissWebglError = () => {
    setWebglError(null);
    if (typeof window !== "undefined") {
      localStorage.setItem("webgl-error-dismissed", "true");
    }
  };

  // Dev helper: expose function to test modal
  useEffect(() => {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as any).__testWebGLModal = () => {
        if (webglError) {
          return;
        }
        localStorage.removeItem("webgl-error-dismissed");
        errorShownRef.current = false;
        setWebglError("WebGL is not available or disabled in your browser.");
      };
      (window as any).__clearWebGLDismissed = () => {
        localStorage.removeItem("webgl-error-dismissed");
      };
      (window as any).__enableForceWebGLError = () => {
        localStorage.setItem("__forceWebGLError", "true");
        localStorage.removeItem("webgl-error-dismissed"); // Clear dismissed flag
        alert("WebGL error will be forced on next page load. Reload now.");
      };
      (window as any).__disableForceWebGLError = () => {
        localStorage.removeItem("__forceWebGLError");
        alert("WebGL error forcing disabled. Reload to see avatar.");
      };
      (window as any).__debugWebGLModal = () => {
        console.log("=== WebGL Modal Debug Info ===");
        console.log("webglError:", webglError);
        console.log("webglErrorDismissed:", webglErrorDismissed);
        console.log("errorShownRef.current:", errorShownRef.current);
        console.log("localStorage webgl-error-dismissed:", localStorage.getItem("webgl-error-dismissed"));
        console.log("localStorage __forceWebGLError:", localStorage.getItem("__forceWebGLError"));
        console.log("Modal should show:", !!(webglError && !webglErrorDismissed));
      };
    }
  }, [webglError]);

  // Setup engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    mountedRef.current = true;

    let engine = engineRef.current;
    if (!engine || !engine.isInitialized()) {
      engine = new VrmEngine();
      engineRef.current = engine;
    }

    try {
      engine.setup(canvas, () => {
        engine.setMouthOpen(mouthOpenRef.current);
        engine.setSpeaking(isSpeakingRef.current);
        if (props.onEngineState && mountedRef.current) {
          const now = performance.now();
          if (now - lastStateEmitMsRef.current >= 250) {
            lastStateEmitMsRef.current = now;
            props.onEngineState(engine.getState());
          }
        }
      });

      setWebglError(null);
      errorShownRef.current = false;
      props.onEngineReady?.(engine);
    } catch (err) {
      // Only process the error once to avoid duplicate modals
      if (errorShownRef.current || webglErrorDismissed) {
        return;
      }
      errorShownRef.current = true;

      const errorMessage = err instanceof Error ? err.message : "Unknown error initializing 3D renderer";
      setWebglError(errorMessage);
      props.onError?.(errorMessage);
      return;
    }

    const resize = () => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      engine.resize(rect.width, rect.height);
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("resize", resize);

      const engineToDispose = engine;
      setTimeout(() => {
        if (!mountedRef.current) {
          engineToDispose.dispose();
          if (engineRef.current === engineToDispose) {
            engineRef.current = null;
          }
        }
      }, 100);
    };
  }, []);

  // Load VRM when path changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isInitialized()) return;

    const vrmUrl = props.vrmPath ?? DEFAULT_VRM_PATH;
    if (vrmUrl === currentVrmPathRef.current) return;
    currentVrmPathRef.current = vrmUrl;

    const abortController = new AbortController();

    void (async () => {
      try {
        if (!mountedRef.current || abortController.signal.aborted) return;
        await engine.loadVrmFromUrl(vrmUrl, vrmUrl.split("/").pop() ?? "avatar.vrm");
        if (!mountedRef.current || abortController.signal.aborted) return;
        props.onEngineState?.(engine.getState());
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("Failed to load VRM:", err);
      }
    })();

    return () => { abortController.abort(); };
  }, [props.vrmPath]);

  // Render modal using Portal (outside component hierarchy)
  const modalElement = webglError && !webglErrorDismissed ? (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        pointerEvents: "auto",
      }}
      onClick={dismissWebglError}
    >
      {/* Modal */}
      <div
        style={{
          backgroundColor: "#1a1a1a",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "420px",
          width: "90%",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "20px",
            fontWeight: "600",
            color: "#ffffff",
          }}
        >
          3D Avatar Unavailable
        </h3>
        <p
          style={{
            margin: "0 0 24px 0",
            fontSize: "15px",
            lineHeight: "1.6",
            color: "rgba(255, 255, 255, 0.7)",
          }}
        >
          WebGL is disabled or not supported in your browser. The chat will work normally without the 3D avatar.
        </p>
        <button
          onClick={dismissWebglError}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#2563eb";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#3b82f6";
          }}
          style={{
            width: "100%",
            padding: "12px 20px",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
        >
          OK
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      />
      {modalElement && typeof document !== "undefined" && createPortal(modalElement, document.body)}
    </>
  );
}
