import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ConnectionModalProps {
  onSubmit: (data: {
    name: string;
    url: string;
    type: "remote";
    token?: string;
  }) => void;
  onClose: () => void;
}

export function ConnectionModal({ onSubmit, onClose }: ConnectionModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const connectDisabled = !name.trim() || !url.trim();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      role="presentation"
    >
      {/* Overlay — click outside to close */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        role="none"
        onClick={onClose}
        onKeyDown={() => {}}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-modal-title"
        className="relative z-10 w-[min(100%-2rem,28rem)] border border-border bg-[#0c0c0e] shadow-2xl"
      >
        <form
          className="space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              name: name.trim(),
              url: url.trim(),
              type: "remote",
              token: token.trim() || undefined,
            });
          }}
        >
          {/* Header */}
          <div className="space-y-1">
            <h2
              id="connect-modal-title"
              className="font-mono text-sm font-medium text-text-light tracking-wide"
            >
              CONNECT REMOTE AGENT
            </h2>
            <p className="font-mono text-xs text-text-muted">
              Connect to a self-hosted Milady backend.
            </p>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="connect-name"
              className="font-mono text-[10px] tracking-wider text-text-subtle"
            >
              NAME
            </label>
            <input
              id="connect-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Remote Agent"
              autoComplete="off"
              className="w-full h-10 px-3 font-mono text-sm bg-dark border border-border text-text-light placeholder:text-text-muted/50 focus:outline-none focus:border-brand/50"
            />
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <label
              htmlFor="connect-url"
              className="font-mono text-[10px] tracking-wider text-text-subtle"
            >
              URL
            </label>
            <input
              id="connect-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              placeholder="https://my-agent.example.com"
              autoComplete="url"
              className="w-full h-10 px-3 font-mono text-sm bg-dark border border-border text-text-light placeholder:text-text-muted/50 focus:outline-none focus:border-brand/50"
            />
          </div>

          {/* Token */}
          <div className="space-y-1.5">
            <label
              htmlFor="connect-token"
              className="font-mono text-[10px] tracking-wider text-text-subtle"
            >
              ACCESS KEY <span className="text-text-muted/50">(optional)</span>
            </label>
            <input
              id="connect-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="milady_xxx..."
              type="password"
              autoComplete="off"
              className="w-full h-10 px-3 font-mono text-sm bg-dark border border-border text-text-light placeholder:text-text-muted/50 focus:outline-none focus:border-brand/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={connectDisabled}
              className="px-5 py-2.5 font-mono text-xs tracking-wider bg-brand text-dark font-medium
                hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              CONNECT
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 font-mono text-xs tracking-wider text-text-muted hover:text-text-light transition-colors"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
