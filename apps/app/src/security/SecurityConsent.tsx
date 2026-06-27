/**
 * SecurityConsent — UI gate component for vision / screen-capture features.
 *
 * Wrap any vision-using surface with `<SecurityConsent provider="...">`.
 * The component renders its children only after explicit user consent.
 * For remote providers, a cost warning is shown before the grant button.
 *
 * Minimal, dependency-free component so it can be embedded anywhere in
 * apps/app without pulling in additional UI primitives. Project styling
 * may wrap this with their own design-system shell.
 */

import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import appConfig from "../../app.config";
import type { VisionConsentStore, VisionProvider } from "./vision-consent.js";

interface SecurityConsentProps {
  store: VisionConsentStore;
  provider: VisionProvider;
  sessionId?: string;
  /** Rendered once consent is granted for the requested provider. */
  children: ReactNode;
  /** Optional override of the cost-warning copy for remote providers. */
  remoteCostWarning?: string;
}

const DEFAULT_REMOTE_WARNING =
  "This feature sends your screen contents to a remote vision model. " +
  "Each capture is metered and may incur cost on your account. " +
  "You can revoke consent at any time from Settings → Security.";

export function SecurityConsent({
  store,
  provider,
  sessionId,
  children,
  remoteCostWarning,
}: SecurityConsentProps): ReactElement {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.isAllowed(provider).then((v) => {
      if (!cancelled) setAllowed(v);
    });
    return () => {
      cancelled = true;
    };
  }, [store, provider]);

  const onGrant = useCallback(async () => {
    await store.grant({ provider, sessionId });
    setAllowed(true);
  }, [store, provider, sessionId]);

  const onDeny = useCallback(async () => {
    await store.revoke("user_denied_prompt");
    setAllowed(false);
  }, [store]);

  if (allowed === null) {
    return <div data-testid="security-consent-loading" />;
  }
  if (allowed) return <>{children}</>;

  return (
    <div data-testid="security-consent-prompt" className="security-consent">
      <h3>Allow screen capture?</h3>
      <p>
        {appConfig.appName} never captures your screen automatically. Granting
        access lets the agent see what you choose to share while this session is
        active.
      </p>
      {provider === "remote" ? (
        <p data-testid="security-consent-cost-warning">
          <strong>Cost warning.</strong>{" "}
          {remoteCostWarning ?? DEFAULT_REMOTE_WARNING}
        </p>
      ) : null}
      <div className="security-consent-actions">
        <button
          type="button"
          onClick={onDeny}
          data-testid="security-consent-deny"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={onGrant}
          data-testid="security-consent-grant"
        >
          Allow
        </button>
      </div>
    </div>
  );
}
