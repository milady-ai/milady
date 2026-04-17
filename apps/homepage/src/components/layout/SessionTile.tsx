import { useAuth } from "../../lib/useAuth";

export function SessionTile({
  onSignIn,
  isSigningIn = false,
}: {
  onSignIn: () => void;
  isSigningIn?: boolean;
}) {
  const { isAuthenticated, signOut } = useAuth();

  const metaLabel = isAuthenticated
    ? "cloud · connected"
    : isSigningIn
      ? "waiting for sign-in"
      : "cloud · offline";

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center gap-2.5 px-2">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            isAuthenticated
              ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
              : isSigningIn
                ? "bg-brand animate-pulse"
                : "bg-white/20"
          }`}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] lowercase tracking-[0.04em] text-white/65">
          {metaLabel}
        </span>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={signOut}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-white/40 transition hover:text-white/80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/30"
          >
            sign out
          </button>
        ) : null}
      </div>
      {!isAuthenticated ? (
        <button
          type="button"
          onClick={onSignIn}
          className="mt-2 w-full rounded-md bg-brand/90 px-2.5 py-1.5 text-[11px] font-medium text-black transition duration-200 hover:bg-brand active:scale-[0.98]"
        >
          sign in to cloud
        </button>
      ) : null}
    </div>
  );
}
