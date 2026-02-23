// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRetakeCapture } from "../../src/hooks/useRetakeCapture";

function HookHost({
  iframeRef,
  active,
  fps,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  active: boolean;
  fps?: number;
}) {
  useRetakeCapture(iframeRef, active, fps);
  return null;
}

describe("useRetakeCapture", () => {
  let invokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(window, {
      electron: {
        ipcRenderer: {
          invoke: invokeSpy,
        },
      },
    });
  });

  afterEach(() => {
    delete window.electron;
    vi.restoreAllMocks();
  });

  it("does not start capture when active is false", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    act(() => {
      TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: false }),
      );
    });

    expect(invokeSpy).not.toHaveBeenCalled();
  });

  it("stops capture on unmount after starting", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: true }),
      );
    });

    expect(invokeSpy).toHaveBeenCalledWith("screencapture:startFrameCapture", {
      fps: 15,
      quality: 70,
      endpoint: "/api/retake/frame",
    });

    act(() => {
      renderer.unmount();
    });

    expect(invokeSpy).toHaveBeenCalledWith("screencapture:stopFrameCapture");
  });
});
