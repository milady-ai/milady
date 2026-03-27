import { Button, Input } from "@miladyai/ui";
import type { WebviewTagElement } from "electrobun/view";
import {
  createElement,
  type FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseWindowShellRoute } from "../platform/window-shell";
import { useApp } from "../state";
import {
  DEFAULT_BROWSER_HOME,
  isAllowedBrowserStartUrl,
  normalizeBrowserAddressInput,
  readBrowserNavigationUrl,
} from "./browser-surface";

/* ── Shared style constants ─────────────────────────────────────────── */

const yellowAccentStyle = {
  borderColor: "rgba(var(--accent-rgb, 240, 185, 11), 0.42)",
  background:
    "linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, white 8%) 0%, var(--accent) 100%)",
  color: "var(--accent-foreground, #1a1f26)",
  boxShadow:
    "0 0 14px rgba(var(--accent-rgb, 240, 185, 11), 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
} as const;

const navBtnBase =
  "h-10 px-[0.95rem] rounded-[0.8rem] border border-[rgba(94,97,102,0.72)] bg-[rgba(30,31,35,0.95)] text-[color:var(--chrome-highlight,#f5f7fa)] text-[0.9rem] font-semibold cursor-pointer transition-[background,border-color,color,box-shadow] duration-150 hover:enabled:bg-[rgba(42,45,49,0.98)] hover:enabled:border-[rgba(201,204,209,0.35)] disabled:opacity-[0.42] disabled:cursor-not-allowed";

const toolbarStyle = {
  border: "1px solid rgba(var(--accent-rgb, 240, 185, 11), 0.28)",
  background:
    "linear-gradient(180deg, rgba(30, 31, 35, 0.96), rgba(18, 18, 20, 0.92))",
  boxShadow:
    "0 16px 40px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
} as const;

const viewportStyle = {
  border: "1px solid rgba(42, 45, 49, 0.98)",
  boxShadow:
    "0 24px 60px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.03)",
} as const;

const containerStyle = {
  background:
    "radial-gradient(circle at top, rgba(var(--accent-rgb, 240, 185, 11), 0.08), transparent 28%), linear-gradient(180deg, rgba(18, 18, 20, 0.98), rgba(11, 11, 12, 1))",
} as const;

function readBrowserShellSeedUrl(): string | null {
  if (typeof window === "undefined") return null;
  const route = parseWindowShellRoute(window.location.search);
  if (route.mode !== "surface" || route.tab !== "browser") return null;
  const raw = route.browse?.trim();
  if (!raw || !isAllowedBrowserStartUrl(raw)) return null;
  return normalizeBrowserAddressInput(raw);
}

export function BrowserSurfaceWindow() {
  const { t } = useApp();
  const browseSeed = useMemo(() => readBrowserShellSeedUrl(), []);
  const initialUrl = browseSeed ?? DEFAULT_BROWSER_HOME;
  const webviewRef = useRef<WebviewTagElement | null>(null);
  const [webviewTagAvailable, setWebviewTagAvailable] = useState(false);
  const [addressValue, setAddressValue] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [webviewInitError, setWebviewInitError] = useState<string | null>(null);

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

  const attachWebviewRef = useEffectEvent((node: HTMLElement | null) => {
    webviewRef.current = node as WebviewTagElement | null;
    if (!node) return;
    try {
      // Set sandbox as an attribute to avoid assigning into potential
      // getter-only custom element properties in certain runtime builds.
      node.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-popups",
      );
      setWebviewInitError(null);
    } catch (err) {
      setWebviewInitError(
        err instanceof Error
          ? err.message
          : "Failed to initialize browser view",
      );
    }
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

    const handleNavigation = (event: unknown) => {
      const nextUrl = readBrowserNavigationUrl(
        (event as Record<string, unknown>)?.detail,
      );
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

    const handleNewWindowOpen = (event: unknown) => {
      const nextUrl = readBrowserNavigationUrl(
        (event as Record<string, unknown>)?.detail,
      );
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
  }, [webviewTagAvailable]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateTo(addressValue);
  };

  return (
    <div
      className="flex min-h-full flex-col gap-3.5 p-4 text-[color:var(--text-strong,#f5f7fa)]"
      style={containerStyle}
    >
      <header
        className="flex items-center gap-3 rounded-2xl p-3 max-[900px]:flex-col max-[900px]:items-stretch"
        style={toolbarStyle}
      >
        <div className="flex shrink-0 items-center gap-2 max-[900px]:flex-wrap">
          <Button
            aria-label={t("aria.browserBack")}
            variant="ghost"
            className={navBtnBase}
            disabled={!canGoBack}
            onClick={() => {
              webviewRef.current?.goBack();
            }}
          >
            Back
          </Button>
          <Button
            aria-label={t("aria.browserForward")}
            variant="ghost"
            className={navBtnBase}
            disabled={!canGoForward}
            onClick={() => {
              webviewRef.current?.goForward();
            }}
          >
            Forward
          </Button>
          <Button
            aria-label={t("aria.browserReload")}
            variant="ghost"
            className={navBtnBase}
            onClick={() => {
              setIsLoading(true);
              webviewRef.current?.reload();
            }}
          >
            Reload
          </Button>
          <Button
            aria-label={t("aria.browserHome")}
            variant="default"
            className={navBtnBase}
            onClick={() => {
              navigateTo(DEFAULT_BROWSER_HOME);
            }}
            style={yellowAccentStyle}
          >
            Home
          </Button>
        </div>

        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={handleSubmit}
        >
          <Input
            aria-label={t("aria.browserAddress")}
            autoCapitalize="none"
            autoCorrect="off"
            className="h-10 w-full min-w-0 rounded-[0.8rem] border border-[rgba(94,97,102,0.72)] bg-[rgba(11,11,12,0.95)] px-[0.9rem] text-[0.95rem] text-[color:var(--chrome-highlight,#f5f7fa)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none focus:border-[rgba(var(--accent-rgb,240,185,11),0.48)] focus:shadow-[0_0_0_1px_rgba(var(--accent-rgb,240,185,11),0.36),0_0_16px_rgba(var(--accent-rgb,240,185,11),0.12)]"
            onChange={(event) => {
              setAddressValue(event.target.value);
            }}
            placeholder={t("browsersurface.enterUrlOrSearch")}
            spellCheck={false}
            type="text"
            value={addressValue}
          />
          <Button
            variant="default"
            className={navBtnBase}
            style={yellowAccentStyle}
            type="submit"
          >
            Go
          </Button>
        </form>
      </header>

      <div className="flex min-w-0 items-center gap-3 px-0.5 text-[0.82rem] text-[color:var(--text-muted,#a1a1aa)]">
        <span
          aria-live="polite"
          className={`shrink-0 rounded-full border border-[rgba(94,97,102,0.72)] bg-[rgba(30,31,35,0.9)] px-[0.55rem] py-[0.2rem] ${isLoading ? "border-[rgba(var(--accent-rgb,240,185,11),0.42)] text-[color:var(--accent-hover,var(--accent))]" : ""}`}
        >
          {isLoading ? "Loading" : "Ready"}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {currentUrl}
        </span>
      </div>

      <div
        className="flex min-h-0 flex-1 overflow-hidden rounded-[1.1rem] bg-white"
        style={viewportStyle}
      >
        {webviewTagAvailable && !webviewInitError ? (
          createElement("electrobun-webview", {
            className: "h-full min-h-0 w-full bg-white",
            partition: "milady-browser",
            ref: attachWebviewRef,
            src: initialUrl,
          })
        ) : webviewTagAvailable && webviewInitError ? (
          <div className="flex flex-1 items-center justify-center bg-black/5 px-6 text-center text-sm text-muted">
            Browser surface failed to initialize. {webviewInitError}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-black/5 px-6 text-center text-sm text-muted">
            Browser surface is only available in the Electrobun desktop runtime.
          </div>
        )}
      </div>
    </div>
  );
}
