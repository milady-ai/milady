import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIFEOPS_GITHUB_CALLBACK_EVENT,
  type LifeOpsGithubCallbackDetail,
} from "../events";
import {
  consumeQueuedLifeOpsGithubCallback,
  dispatchLifeOpsGithubCallbackFromWindowMessage,
  dispatchQueuedLifeOpsGithubCallbackFromUrl,
  drainLifeOpsGithubCallbacks,
  LIFEOPS_GITHUB_POST_MESSAGE_TYPE,
  queueLifeOpsGithubCallback,
  readLifeOpsGithubCallbackFromUrl,
  readLifeOpsGithubCallbackFromWindowMessage,
} from "./lifeops-github";

function createDetail(): LifeOpsGithubCallbackDetail {
  return {
    target: "agent",
    status: "connected",
    connectionId: "conn-1",
    agentId: "agent-1",
    githubUsername: "octocat",
    bindingMode: "shared-owner",
    message: null,
    restarted: true,
  };
}

let previousWindow: Window | undefined;

beforeEach(() => {
  previousWindow = (globalThis as typeof globalThis & { window?: Window })
    .window;
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  const nextWindow = (globalThis as typeof globalThis & { window?: Window })
    .window as Window | undefined;
  if (nextWindow) {
    nextWindow.__MILADY_LIFEOPS_GITHUB_CALLBACK_QUEUE__ = [];
  }
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", {
      value: previousWindow,
      configurable: true,
      writable: true,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  vi.restoreAllMocks();
});

describe("lifeops github callback helpers", () => {
  it("reads a callback payload from a popup postMessage payload", () => {
    expect(
      readLifeOpsGithubCallbackFromWindowMessage({
        type: LIFEOPS_GITHUB_POST_MESSAGE_TYPE,
        target: "agent",
        status: "connected",
        connectionId: "conn-1",
        agentId: "agent-1",
        githubUsername: "octocat",
        bindingMode: "shared-owner",
        restarted: true,
      }),
    ).toEqual(createDetail());
  });

  it("reads a callback payload from a milady deep link", () => {
    expect(
      readLifeOpsGithubCallbackFromUrl(
        "milady://lifeops?github_target=owner&github_status=connected&connection_id=conn-1&message=ok",
      ),
    ).toEqual({
      target: "owner",
      status: "connected",
      connectionId: "conn-1",
      agentId: null,
      githubUsername: null,
      bindingMode: null,
      message: "ok",
      restarted: undefined,
    });
  });

  it("queues, drains, and consumes callback payloads", () => {
    const detail = createDetail();
    queueLifeOpsGithubCallback(detail);
    expect(drainLifeOpsGithubCallbacks()).toEqual([detail]);
    queueLifeOpsGithubCallback(detail);
    consumeQueuedLifeOpsGithubCallback(detail);
    expect(drainLifeOpsGithubCallbacks()).toEqual([]);
  });

  it("dispatches the app event for popup payloads", () => {
    const listener = vi.fn();
    window.addEventListener(
      LIFEOPS_GITHUB_CALLBACK_EVENT,
      listener as EventListener,
    );

    expect(
      dispatchLifeOpsGithubCallbackFromWindowMessage({
        type: LIFEOPS_GITHUB_POST_MESSAGE_TYPE,
        target: "agent",
        status: "connected",
      }),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("queues and dispatches deep-link payloads", () => {
    const listener = vi.fn();
    window.addEventListener(
      LIFEOPS_GITHUB_CALLBACK_EVENT,
      listener as EventListener,
    );

    expect(
      dispatchQueuedLifeOpsGithubCallbackFromUrl(
        "milady://lifeops?github_target=agent&github_status=error&agent_id=agent-1&message=denied",
      ),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(drainLifeOpsGithubCallbacks()).toEqual([
      {
        target: "agent",
        status: "error",
        connectionId: null,
        agentId: "agent-1",
        githubUsername: null,
        bindingMode: null,
        message: "denied",
        restarted: undefined,
      },
    ]);
  });
});
