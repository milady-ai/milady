import { useCloudLogin } from "./useCloudLogin";

interface CloudLoginBannerProps {
  onAuthenticated?: () => void;
}

export function CloudLoginBanner({ onAuthenticated }: CloudLoginBannerProps) {
  const { state, error, manualLoginUrl, signIn } = useCloudLogin({
    onAuthenticated,
  });

  if (state === "authenticated") return null;

  return (
    <div className="mx-4 sm:mx-5 md:mx-8 mt-4 rounded-sm border border-border bg-surface p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-light">
          Sign in to Eliza Cloud
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          Connect your cloud account to manage remote agents and access premium
          features.
        </p>
        {error && <p className="text-xs text-status-stopped mt-1">{error}</p>}
        {manualLoginUrl && (
          <a
            href={manualLoginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand hover:underline mt-1 inline-block"
          >
            Open sign-in page manually
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={state === "polling" || state === "checking"}
        className="shrink-0 px-4 py-2 text-sm font-medium rounded-sm bg-brand text-text-dark hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
      >
        {state === "polling" ? "Waiting..." : "Sign In"}
      </button>
    </div>
  );
}
