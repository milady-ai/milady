import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deriveSolanaAddress } from "@miladyai/agent/api/wallet";
import { expect, type Page, type Route, test } from "@playwright/test";
import { ethers } from "ethers";
import {
  BROWSER_WALLET_READY_TYPE,
  BROWSER_WALLET_REQUEST_TYPE,
  BROWSER_WALLET_RESPONSE_TYPE,
} from "../../../../packages/app-core/src/browser-workspace-wallet";
import { installDefaultAppMocks, openAppPath, seedAppStorage } from "./helpers";

type BrowserWorkspaceTab = {
  id: string;
  title: string;
  url: string;
  partition: string;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  lastFocusedAt: string | null;
};

type BrowserWorkspaceState = {
  nextId: number;
  solanaWalletMessages: string[];
  walletMessages: string[];
  tabs: BrowserWorkspaceTab[];
  walletRequests: Array<Record<string, unknown>>;
};

type BrowserWorkspaceFixture = {
  counterUrl: string;
  tasksUrl: string;
  walletBridgeUrl: string;
  close: () => Promise<void>;
};

const DEFAULT_PARTITION = "persist:milady-browser";
const LOCAL_EVM_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f094538f2d7d7d5d2a4f9cce6f6d8d3c5b5a8e7f";
const LOCAL_WALLET_ADDRESS = new ethers.Wallet(LOCAL_EVM_PRIVATE_KEY).address;
const LOCAL_SOLANA_SEED = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 1),
);
const LOCAL_SOLANA_PRIVATE_KEY = JSON.stringify(Array.from(LOCAL_SOLANA_SEED));
const LOCAL_SOLANA_ADDRESS = deriveSolanaAddress(LOCAL_SOLANA_PRIVATE_KEY);
const SOLANA_PKCS8_DER_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const BROWSER_WALLET_TX_HASH = "0xbrowserwallettx";

function now(): string {
  return new Date().toISOString();
}

function inferTitle(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "") || "Milady Browser";
}

function createTab(
  state: BrowserWorkspaceState,
  url: string,
  visible: boolean,
  title?: string,
): BrowserWorkspaceTab {
  const timestamp = now();
  return {
    id: `btab_${state.nextId++}`,
    title: title?.trim() || inferTitle(url),
    url,
    partition: DEFAULT_PARTITION,
    visible,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastFocusedAt: visible ? timestamp : null,
  };
}

async function fulfillJson(
  route: Route,
  payload: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

function readRequestJson<T>(route: Route): T {
  const raw = route.request().postData() ?? "{}";
  return JSON.parse(raw) as T;
}

async function signEvmMessage(message: string): Promise<string> {
  return new ethers.Wallet(LOCAL_EVM_PRIVATE_KEY).signMessage(message);
}

function signSolanaMessageBase64(message: string): string {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([SOLANA_PKCS8_DER_PREFIX, LOCAL_SOLANA_SEED]),
    format: "der",
    type: "pkcs8",
  });
  return crypto
    .sign(null, Buffer.from(message, "utf8"), privateKey)
    .toString("base64");
}

async function installBrowserWorkspaceMocks(
  page: Page,
  state: BrowserWorkspaceState,
): Promise<void> {
  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/navigate$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/navigate")[0] ?? "",
      );
      const payload = readRequestJson<{ url?: string }>(route);
      const nextUrl = payload.url?.trim() || "about:blank";
      const timestamp = now();

      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: inferTitle(nextUrl),
              updatedAt: timestamp,
              url: nextUrl,
            }
          : tab,
      );

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/show$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/show")[0] ?? "",
      );
      const timestamp = now();
      state.tabs = state.tabs.map((tab) => ({
        ...tab,
        visible: tab.id === tabId,
        lastFocusedAt: tab.id === tabId ? timestamp : tab.lastFocusedAt,
      }));

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(
    /\/api\/browser-workspace\/tabs\/[^/]+\/hide$/,
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const tabId = decodeURIComponent(
        request.url().split("/tabs/")[1]?.split("/hide")[0] ?? "",
      );
      const timestamp = now();
      state.tabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              updatedAt: timestamp,
              visible: false,
            }
          : tab,
      );

      await fulfillJson(route, {
        tab: state.tabs.find((tab) => tab.id === tabId) ?? null,
      });
    },
  );

  await page.route(/\/api\/browser-workspace\/tabs\/[^/]+$/, async (route) => {
    const request = route.request();
    if (request.method() !== "DELETE") {
      await route.fallback();
      return;
    }
    const tabId = decodeURIComponent(
      request.url().split("/tabs/")[1]?.split("?")[0] ?? "",
    );
    const previousLength = state.tabs.length;
    state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
    await fulfillJson(route, { closed: state.tabs.length !== previousLength });
  });

  await page.route("**/api/browser-workspace/tabs", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const payload = readRequestJson<{
      show?: boolean;
      title?: string;
      url?: string;
    }>(route);
    const nextUrl = payload.url?.trim() || "about:blank";
    const tab = createTab(state, nextUrl, payload.show === true, payload.title);

    if (tab.visible) {
      state.tabs = state.tabs.map((entry) => ({
        ...entry,
        visible: false,
      }));
    }
    state.tabs = [...state.tabs, tab];

    await fulfillJson(route, { tab });
  });

  await page.route("**/api/browser-workspace", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      mode: "web",
      tabs: state.tabs,
    });
  });
}

async function installWalletMocks(
  page: Page,
  state: BrowserWorkspaceState,
  options: { localReady: boolean; stewardConnected: boolean },
): Promise<void> {
  const walletConfig = options.localReady
    ? {
        selectedRpcProviders: {
          evm: "eliza-cloud",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
        walletNetwork: "mainnet",
        legacyCustomChains: [],
        alchemyKeySet: false,
        infuraKeySet: false,
        ankrKeySet: false,
        heliusKeySet: false,
        birdeyeKeySet: false,
        evmChains: [
          "Ethereum",
          "Base",
          "Arbitrum",
          "Optimism",
          "Polygon",
          "BSC",
          "Avalanche",
        ],
        evmAddress: LOCAL_WALLET_ADDRESS,
        solanaAddress: LOCAL_SOLANA_ADDRESS,
        walletSource: "local",
        automationMode: "full",
        pluginEvmLoaded: true,
        pluginEvmRequired: true,
        executionReady: true,
        executionBlockedReason: null,
        solanaSigningAvailable: true,
      }
    : {
        selectedRpcProviders: {
          evm: "eliza-cloud",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
        walletNetwork: "mainnet",
        legacyCustomChains: [],
        alchemyKeySet: false,
        infuraKeySet: false,
        ankrKeySet: false,
        heliusKeySet: false,
        birdeyeKeySet: false,
        evmChains: [],
        evmAddress: options.stewardConnected ? LOCAL_WALLET_ADDRESS : null,
        solanaAddress: options.localReady ? LOCAL_SOLANA_ADDRESS : null,
        walletSource: options.stewardConnected ? "steward" : "none",
        automationMode: "full",
        pluginEvmLoaded: options.stewardConnected,
        pluginEvmRequired: options.stewardConnected,
        executionReady: options.localReady,
        executionBlockedReason: options.localReady
          ? null
          : "No EVM wallet is active yet.",
        solanaSigningAvailable: options.localReady,
      };

  await page.route("**/api/wallet/addresses", async (route) => {
    await fulfillJson(route, {
      evmAddress:
        options.localReady || options.stewardConnected
          ? LOCAL_WALLET_ADDRESS
          : null,
      solanaAddress: options.localReady ? LOCAL_SOLANA_ADDRESS : null,
    });
  });

  await page.route("**/api/wallet/config", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(route, walletConfig);
  });

  await page.route("**/api/wallet/steward-status", async (route) => {
    await fulfillJson(route, {
      configured: options.stewardConnected,
      available: options.stewardConnected,
      connected: options.stewardConnected,
      agentId: options.stewardConnected ? "agent-browser" : undefined,
      walletAddresses: {
        evm: options.stewardConnected ? LOCAL_WALLET_ADDRESS : null,
        solana: null,
      },
      error: null,
    });
  });

  await page.route("**/api/wallet/steward-pending-approvals", async (route) => {
    await fulfillJson(route, []);
  });

  await page.route("**/api/wallet/browser-transaction", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const payload = readRequestJson<Record<string, unknown>>(route);
    state.walletRequests.push(payload);
    await fulfillJson(route, {
      approved: true,
      mode: options.stewardConnected ? "steward" : "local-key",
      pending: false,
      txHash: BROWSER_WALLET_TX_HASH,
    });
  });

  await page.route("**/api/wallet/browser-sign-message", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fallback();
      return;
    }
    const payload = readRequestJson<{ message?: string }>(route);
    state.walletMessages.push(payload.message ?? "");
    await fulfillJson(route, {
      mode: "local-key",
      signature: await signEvmMessage(payload.message ?? ""),
    });
  });

  await page.route(
    "**/api/wallet/browser-solana-sign-message",
    async (route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const payload = readRequestJson<{
        message?: string;
        messageBase64?: string;
      }>(route);
      const message = payload.message
        ? payload.message
        : payload.messageBase64
          ? Buffer.from(payload.messageBase64, "base64").toString("utf8")
          : "";
      state.solanaWalletMessages.push(message);
      await fulfillJson(route, {
        address: LOCAL_SOLANA_ADDRESS,
        mode: "local-key",
        signatureBase64: signSolanaMessageBase64(message),
      });
    },
  );
}

function browserWalletFixtureHtml(): string {
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8" /><title>Wallet Sign-In Fixture</title></head>
      <body>
        <h1>Wallet Sign-In Fixture</h1>
        <p id="wallet-ready">waiting</p>
        <p id="evm-signin-result">idle</p>
        <p id="evm-sign-message-result">idle</p>
        <p id="solana-signin-result">idle</p>
        <p id="solana-sign-message-result">idle</p>
        <button id="evm-sign-in" type="button">EVM sign in</button>
        <button id="evm-sign-message" type="button">EVM sign message</button>
        <button id="solana-sign-in" type="button">Solana sign in</button>
        <button id="solana-sign-message" type="button">Solana sign message</button>
        <script>
          const pending = new Map();
          let sequence = 0;
          const encoder = new TextEncoder();

          function parentOrigin() {
            try {
              return new URL(document.referrer).origin;
            } catch {
              return "*";
            }
          }

          function sendRequest(method, params) {
            return new Promise((resolve, reject) => {
              const requestId = "wallet-" + (++sequence);
              pending.set(requestId, { resolve, reject });
              window.parent.postMessage(
                {
                  type: "${BROWSER_WALLET_REQUEST_TYPE}",
                  requestId,
                  method,
                  params
                },
                parentOrigin()
              );
            });
          }

          function bytesToBase64(bytes) {
            let value = "";
            for (const byte of bytes) {
              value += String.fromCharCode(byte);
            }
            return btoa(value);
          }

          function base64ToBytes(value) {
            const binary = atob(value);
            return Uint8Array.from(binary, (character) => character.charCodeAt(0));
          }

          function publicKey(address) {
            return {
              toBase58() {
                return address;
              },
              toString() {
                return address;
              }
            };
          }

          window.ethereum = {
            async request({ method, params }) {
              return sendRequest(method, params);
            }
          };

          window.solana = {
            isMilady: true,
            isConnected: false,
            publicKey: null,
            async connect() {
              const result = await sendRequest("solana_connect");
              this.isConnected = true;
              this.publicKey = publicKey(result.address);
              return { publicKey: this.publicKey };
            },
            async signMessage(message) {
              const payload =
                message instanceof Uint8Array ? message : encoder.encode(String(message));
              const result = await sendRequest("solana_signMessage", {
                messageBase64: bytesToBase64(payload)
              });
              if (!this.publicKey) {
                this.publicKey = publicKey(result.address);
              }
              this.isConnected = true;
              return {
                publicKey: this.publicKey,
                signature: base64ToBytes(result.signatureBase64)
              };
            }
          };

          window.addEventListener("message", (event) => {
            if (event.data?.type === "${BROWSER_WALLET_READY_TYPE}") {
              const state = event.data.state;
              const networks = [];
              if (state?.evmConnected) networks.push("evm");
              if (state?.solanaConnected) networks.push("solana");
              document.getElementById("wallet-ready").textContent =
                networks.length > 0 ? "ready:" + networks.join(",") : "unavailable";
              return;
            }

            if (event.data?.type !== "${BROWSER_WALLET_RESPONSE_TYPE}") {
              return;
            }

            const entry = pending.get(event.data.requestId);
            if (!entry) {
              return;
            }

            pending.delete(event.data.requestId);
            if (event.data.ok) {
              entry.resolve(event.data.result);
              return;
            }

            entry.reject(new Error(event.data.error || "Browser wallet request failed."));
          });

          document.getElementById("evm-sign-in").addEventListener("click", async () => {
            try {
              const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
              const signature = await window.ethereum.request({
                method: "personal_sign",
                params: ["Sign in to the Milady browser wallet fixture", accounts[0]]
              });
              document.getElementById("evm-signin-result").textContent =
                accounts[0] + ":" + signature;
            } catch (error) {
              document.getElementById("evm-signin-result").textContent = "error:" + error.message;
            }
          });

          document.getElementById("evm-sign-message").addEventListener("click", async () => {
            try {
              const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
              const signature = await window.ethereum.request({
                method: "personal_sign",
                params: ["Browser says hi", accounts[0]]
              });
              document.getElementById("evm-sign-message-result").textContent = signature;
            } catch (error) {
              document.getElementById("evm-sign-message-result").textContent = "error:" + error.message;
            }
          });

          document.getElementById("solana-sign-in").addEventListener("click", async () => {
            try {
              const { publicKey } = await window.solana.connect();
              const signed = await window.solana.signMessage(
                encoder.encode("Sign in to the Milady browser wallet fixture")
              );
              document.getElementById("solana-signin-result").textContent =
                publicKey.toBase58() + ":" + bytesToBase64(signed.signature);
            } catch (error) {
              document.getElementById("solana-signin-result").textContent = "error:" + error.message;
            }
          });

          document.getElementById("solana-sign-message").addEventListener("click", async () => {
            try {
              const signed = await window.solana.signMessage(
                encoder.encode("Solana says hi")
              );
              document.getElementById("solana-sign-message-result").textContent =
                bytesToBase64(signed.signature);
            } catch (error) {
              document.getElementById("solana-sign-message-result").textContent = "error:" + error.message;
            }
          });

          window.addEventListener("load", () => {
            window.setTimeout(() => {
              document.getElementById("evm-sign-in").click();
            }, 50);
          });
        </script>
      </body>
    </html>`;
}

async function startBrowserWorkspaceFixture(): Promise<BrowserWorkspaceFixture> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/wallet-bridge") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(browserWalletFixtureHtml());
      return;
    }

    if (url.pathname === "/tasks") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html>
        <html lang="en">
          <head><meta charset="utf-8" /><title>Tasks Fixture</title></head>
          <body>
            <h1>Tasks Fixture</h1>
            <p id="tasks-state">0 completed</p>
            <label>
              <input
                id="task-one"
                type="checkbox"
                onchange="document.getElementById('tasks-state').textContent = this.checked ? '1 completed' : '0 completed'"
              />
              Finish browser workspace smoke task
            </label>
          </body>
        </html>`);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Counter Fixture</title></head>
        <body>
          <h1>Counter Fixture</h1>
          <p>Persistent counter state for the browser workspace smoke test.</p>
          <div id="count">0</div>
          <button
            id="increment"
            type="button"
            onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent || '0') + 1)"
          >
            Increment
          </button>
        </body>
      </html>`);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const primaryBase = `http://127.0.0.1:${address.port}`;
  const secondaryBase = `http://localhost:${address.port}`;

  return {
    counterUrl: `${primaryBase}/counter`,
    tasksUrl: `${secondaryBase}/tasks`,
    walletBridgeUrl: `${secondaryBase}/wallet-bridge`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

test.beforeEach(async ({ page }) => {
  await installDefaultAppMocks(page);
  await seedAppStorage(page);
});

test("browser workspace keeps live website tabs mounted while switching between them", async ({
  page,
}) => {
  const fixture = await startBrowserWorkspaceFixture();
  const state: BrowserWorkspaceState = {
    nextId: 1,
    solanaWalletMessages: [],
    walletMessages: [],
    tabs: [],
    walletRequests: [],
  };

  try {
    await installBrowserWorkspaceMocks(page, state);
    await installWalletMocks(page, state, {
      localReady: false,
      stewardConnected: false,
    });

    await openAppPath(page, "/browser");
    await expect(page.getByText("No browser tabs yet")).toBeVisible();

    await page.getByPlaceholder("Enter a URL").fill(fixture.counterUrl);
    await page.getByRole("button", { name: "Open", exact: true }).click();

    const counterFrame = page.frameLocator('iframe[title="127.0.0.1"]');
    await expect(
      counterFrame.getByRole("heading", { name: "Counter Fixture" }),
    ).toBeVisible();
    await counterFrame.getByRole("button", { name: "Increment" }).click();
    await expect(counterFrame.locator("#count")).toHaveText("1");

    await page.getByPlaceholder("Enter a URL").fill(fixture.tasksUrl);
    await page.getByRole("button", { name: "New tab" }).first().click();

    const tasksFrame = page.frameLocator('iframe[title="localhost"]');
    await expect(
      tasksFrame.getByRole("heading", { name: "Tasks Fixture" }),
    ).toBeVisible();
    await tasksFrame.locator("#task-one").check();
    await expect(tasksFrame.locator("#tasks-state")).toHaveText("1 completed");
    await expect(page.locator("iframe")).toHaveCount(2);

    await page.getByRole("button", { name: "127.0.0.1" }).first().click();
    await expect(counterFrame.locator("#count")).toHaveText("1");
    await page.getByRole("button", { name: "localhost" }).first().click();
    await expect(tasksFrame.locator("#tasks-state")).toHaveText("1 completed");
  } finally {
    await fixture.close();
  }
});

test("browser workspace exposes a wallet bridge to embedded pages without rendering a wallet sidebar", async ({
  page,
}) => {
  const fixture = await startBrowserWorkspaceFixture();
  const state: BrowserWorkspaceState = {
    nextId: 1,
    solanaWalletMessages: [],
    walletMessages: [],
    tabs: [],
    walletRequests: [],
  };

  try {
    await installBrowserWorkspaceMocks(page, state);
    await installWalletMocks(page, state, {
      localReady: true,
      stewardConnected: false,
    });

    await openAppPath(page, "/browser");
    await expect(page.getByText("Agent wallet")).toHaveCount(0);

    await page.getByPlaceholder("Enter a URL").fill(fixture.walletBridgeUrl);
    await page.getByRole("button", { name: "Open", exact: true }).click();

    const walletFrame = page.frameLocator('iframe[title="localhost"]');
    const expectedEvmSignInSignature = await signEvmMessage(
      "Sign in to the Milady browser wallet fixture",
    );
    const expectedEvmMessageSignature = await signEvmMessage("Browser says hi");
    const expectedSolanaSignInSignature = signSolanaMessageBase64(
      "Sign in to the Milady browser wallet fixture",
    );
    const expectedSolanaMessageSignature =
      signSolanaMessageBase64("Solana says hi");
    await expect(
      walletFrame.getByRole("heading", { name: "Wallet Sign-In Fixture" }),
    ).toBeVisible();
    await expect(walletFrame.locator("#wallet-ready")).toHaveText(
      "ready:evm,solana",
    );

    await expect(page.getByText("Wallet connected")).toBeVisible();
    await walletFrame.getByRole("button", { name: "EVM sign message" }).click();
    await walletFrame.getByRole("button", { name: "Solana sign in" }).click();
    await walletFrame
      .getByRole("button", { name: "Solana sign message" })
      .click();

    await expect(walletFrame.locator("#evm-signin-result")).toHaveText(
      `${LOCAL_WALLET_ADDRESS}:${expectedEvmSignInSignature}`,
    );
    await expect(walletFrame.locator("#evm-sign-message-result")).toHaveText(
      expectedEvmMessageSignature,
    );
    await expect(walletFrame.locator("#solana-signin-result")).toHaveText(
      `${LOCAL_SOLANA_ADDRESS}:${expectedSolanaSignInSignature}`,
    );
    await expect(walletFrame.locator("#solana-sign-message-result")).toHaveText(
      expectedSolanaMessageSignature,
    );
    expect([...state.walletMessages].sort()).toEqual([
      "Browser says hi",
      "Sign in to the Milady browser wallet fixture",
    ]);
    expect([...state.solanaWalletMessages].sort()).toEqual([
      "Sign in to the Milady browser wallet fixture",
      "Solana says hi",
    ]);
  } finally {
    await fixture.close();
  }
});
