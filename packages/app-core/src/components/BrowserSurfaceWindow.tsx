import type { WebviewTagElement } from "electrobun/view";
import {
  type FormEvent,
  createElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import "../styles/browser-surface.css";
import { useApp } from "../state";
import {
  DEFAULT_BROWSER_HOME,
  normalizeBrowserAddressInput,
  readBrowserNavigationUrl,
} from "./browser-surface";

export function BrowserSurfaceWindow() {
  const { t } = useApp();
  const webviewRef = useRef<WebviewTagElement | null>(null);
  const [webviewTagAvailable, setWebviewTagAvailable] = useState(false);
  const [addressValue, setAddressValue] = useState(DEFAULT_BROWSER_HOME);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_BROWSER_HOME);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const syncNavigationState = useEffectEvent(async () => {
    const webview = webviewRef.current;
    if (!webview) return;

    try {
      const [nextCanGoBack, nextCanGoForward] = await Promise.all([
        webview.canGoBack(),
        webview.canGoForward(),
      ]);
      setCanGoBack(nextCanGoBack);
      setCanGoForward(nextCanGoForward);
    } catch {
      setCanGoBack(false);
      setCanGoForward(false);
    }
  });

  const applyNavigationUrl = useEffectEvent((nextUrl: string) => {
    setCurrentUrl(nextUrl);
    setAddressValue(nextUrl);
  });

  const navigateTo = useEffectEvent((rawInput: string) => {
    const nextUrl = normalizeBrowserAddressInput(rawInput);
    const webview = webviewRef.current;

    applyNavigationUrl(nextUrl);
    setIsLoading(true);
    webview?.loadURL(nextUrl);
  });

  useEffect(() => {
    setWebviewTagAvailable(
      typeof window !== "undefined" &&
        Boolean(window.customElements.get("electrobun-webview")),
    );
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (
      !webviewTagAvailable ||
      !webview ||
      typeof webview.on !== "function" ||
      typeof webview.off !== "function"
    ) {
      return;
    }

    const handleNavigation = (event: any) => {
      const nextUrl = readBrowserNavigationUrl(event.detail);
      if (nextUrl) {
        applyNavigationUrl(nextUrl);
      }
      setIsLoading(false);
      void syncNavigationState();
    };

    const handleDomReady = () => {
      setIsLoading(false);
      void syncNavigationState();
    };

    const handleNewWindowOpen = (event: any) => {
      const nextUrl = readBrowserNavigationUrl(event.detail);
      if (nextUrl) {
        navigateTo(nextUrl);
      }
    };

    webview.on("did-navigate", handleNavigation);
    webview.on("did-navigate-in-page", handleNavigation);
    webview.on("did-commit-navigation", handleNavigation);
    webview.on("dom-ready", handleDomReady);
    webview.on("new-window-open", handleNewWindowOpen);
    void syncNavigationState();

    return () => {
      webview.off("did-navigate", handleNavigation);
      webview.off("did-navigate-in-page", handleNavigation);
      webview.off("did-commit-navigation", handleNavigation);
      webview.off("dom-ready", handleDomReady);
      webview.off("new-window-open", handleNewWindowOpen);
    };
  }, [
    applyNavigationUrl,
    navigateTo,
    syncNavigationState,
    webviewTagAvailable,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateTo(addressValue);
  };

  return (
    <div className="browser-surface">
      <header className="browser-surface__toolbar">
        <div className="browser-surface__controls">
          <button
            className="browser-surface__nav-btn"
            disabled={!canGoBack}
            onClick={() => {
              webviewRef.current?.goBack();
            }}
            type="button"
          >
            Back
          </button>
          <button
            className="browser-surface__nav-btn"
            disabled={!canGoForward}
            onClick={() => {
              webviewRef.current?.goForward();
            }}
            type="button"
          >
            Forward
          </button>
          <button
            className="browser-surface__nav-btn"
            onClick={() => {
              setIsLoading(true);
              webviewRef.current?.reload();
            }}
            type="button"
          >
            Reload
          </button>
          <button
            className="browser-surface__nav-btn browser-surface__nav-btn--accent"
            onClick={() => {
              navigateTo(DEFAULT_BROWSER_HOME);
            }}
            type="button"
          >
            Home
          </button>
        </div>

        <form className="browser-surface__address" onSubmit={handleSubmit}>
          <input
            aria-label={t("aria.browserAddress")}
            autoCapitalize="none"
            autoCorrect="off"
            className="browser-surface__address-input"
            onChange={(event) => {
              setAddressValue(event.target.value);
            }}
            placeholder={t("browsersurface.enterUrlOrSearch")}
            spellCheck={false}
            type="text"
            value={addressValue}
          />
          <button className="browser-surface__go-btn" type="submit">
            Go
          </button>
        </form>
      </header>

      <div className="browser-surface__status">
        <span
          className="browser-surface__status-indicator"
          data-loading={isLoading}
        >
          {isLoading ? "Loading" : "Ready"}
        </span>
        <span className="browser-surface__status-url">{currentUrl}</span>
      </div>

      <div className="browser-surface__viewport">
        {webviewTagAvailable ? (
          createElement("electrobun-webview", {
            className: "browser-surface__webview",
            partition: "milady-browser",
            ref: (node: HTMLElement | null) => {
              webviewRef.current = node as WebviewTagElement | null;
            },
            src: DEFAULT_BROWSER_HOME,
          })
        ) : (
          <div className="flex flex-1 items-center justify-center bg-black/5 px-6 text-center text-sm text-muted">
            Browser surface is only available in the Electrobun desktop runtime.
          </div>
        )}
      </div>
    </div>
  );
}
