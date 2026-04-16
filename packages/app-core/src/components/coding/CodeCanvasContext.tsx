/**
 * Context for the coding canvas side-panel.
 *
 * Tracks live coding agent activity — which sessions are active,
 * what tools are running, file changes in progress.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

interface CodeCanvasState {
  open: boolean;
  /** Session ID to focus in the canvas, or null for overview. */
  focusedSessionId: string | null;
  /** Session IDs the user has dismissed from the tab bar. */
  hiddenSessionIds: Set<string>;
}

interface CodeCanvasActions {
  openCanvas: (sessionId?: string) => void;
  closeCanvas: () => void;
  toggleCanvas: () => void;
  focusSession: (sessionId: string) => void;
  /** Hide a session tab without stopping it. */
  hideSession: (sessionId: string) => void;
}

type CodeCanvasContextValue = CodeCanvasState & CodeCanvasActions;

const CodeCanvasCtx = createContext<CodeCanvasContextValue | null>(null);

export function useCodeCanvas(): CodeCanvasContextValue {
  const ctx = useContext(CodeCanvasCtx);
  if (!ctx)
    throw new Error("useCodeCanvas must be used within CodeCanvasProvider");
  return ctx;
}

export function CodeCanvasProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [hiddenSessionIds, setHiddenSessionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const openCanvas = useCallback((sessionId?: string) => {
    if (sessionId) {
      setFocusedSessionId(sessionId);
      setHiddenSessionIds((prev) => {
        if (!prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
    setOpen(true);
  }, []);

  const closeCanvas = useCallback(() => setOpen(false), []);
  const toggleCanvas = useCallback(() => setOpen((v) => !v), []);
  const focusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
    setHiddenSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    setOpen(true);
  }, []);

  const hideSession = useCallback((sessionId: string) => {
    setHiddenSessionIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    setFocusedSessionId((current) =>
      current === sessionId ? null : current,
    );
  }, []);

  return (
    <CodeCanvasCtx.Provider
      value={{
        open,
        focusedSessionId,
        hiddenSessionIds,
        openCanvas,
        closeCanvas,
        toggleCanvas,
        focusSession,
        hideSession,
      }}
    >
      {children}
    </CodeCanvasCtx.Provider>
  );
}
