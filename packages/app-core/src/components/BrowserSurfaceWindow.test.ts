// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserSurfaceWindow } from "./BrowserSurfaceWindow";

vi.mock("../state", () => ({
  useApp: () => ({
    t: (key: string) => key,
  }),
}));

class FakeElectrobunWebview extends HTMLElement {
  static latest: FakeElectrobunWebview | null = null;

  loadURL = vi.fn();
  goBack = vi.fn();
  goForward = vi.fn();
  reload = vi.fn();
  canGoBack = vi.fn(async () => false);
  canGoForward = vi.fn(async () => false);
  on = vi.fn();
  off = vi.fn();

  constructor() {
    super();
    FakeElectrobunWebview.latest = this;
  }
}

describe("BrowserSurfaceWindow", () => {
  let host: HTMLDivElement;
  let root: Root;
  let elementName: string;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    elementName = `electrobun-webview-test-${Math.random().toString(36).slice(2)}`;
    FakeElectrobunWebview.latest = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("shows a runtime fallback when the custom webview tag is unavailable", async () => {
    await act(async () => {
      root.render(React.createElement(BrowserSurfaceWindow));
    });

    expect(host.textContent).toContain(
      "Browser surface is only available in the Electrobun desktop runtime.",
    );
  });

  it("lets the user enter a URL and forwards it to the electrobun webview", async () => {
    customElements.define(elementName, FakeElectrobunWebview);
    const originalGet = window.customElements.get.bind(window.customElements);
    const getSpy = vi
      .spyOn(window.customElements, "get")
      .mockImplementation((name: string) =>
        name === "electrobun-webview"
          ? FakeElectrobunWebview
          : originalGet(name),
      );
    const originalCreateElement = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((
        tagName: string,
        options?: ElementCreationOptions,
      ) =>
        originalCreateElement(
          tagName === "electrobun-webview" ? elementName : tagName,
          options,
        )) as typeof document.createElement);

    try {
      await act(async () => {
        root.render(React.createElement(BrowserSurfaceWindow));
      });

      const input = host.querySelector(
        'input[aria-label="aria.browserAddress"]',
      ) as HTMLInputElement | null;
      const form = host.querySelector("form");

      if (!input || !form) {
        throw new Error("Browser address controls did not render");
      }

      const setInputValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setInputValue) {
        throw new Error("HTMLInputElement.value setter unavailable");
      }

      await act(async () => {
        setInputValue.call(input, "example.com");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      await act(async () => {
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });

      expect(FakeElectrobunWebview.latest?.loadURL).toHaveBeenCalledWith(
        "https://example.com/",
      );
    } finally {
      getSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});
