// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SecretsView } from "@miladyai/app-core/components";

const { mockGetSecrets, mockUpdateSecrets } = vi.hoisted(() => ({
  mockGetSecrets: vi.fn(),
  mockUpdateSecrets: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getSecrets: mockGetSecrets,
    updateSecrets: mockUpdateSecrets,
  },
}));

describe("SecretsView picker keyboard behavior", () => {
  beforeEach(() => {
    mockGetSecrets.mockReset();
    mockUpdateSecrets.mockReset();
    const storage = globalThis.localStorage;
    if (storage && typeof storage.clear === "function") {
      storage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps picker open on Enter/Space and closes on Escape", async () => {
    mockGetSecrets.mockResolvedValue({
      secrets: [
        {
          key: "OPENAI_API_KEY",
          description: "OpenAI key",
          category: "ai-provider",
          sensitive: true,
          required: false,
          isSet: false,
          maskedValue: null,
          usedBy: [
            {
              pluginId: "openai",
              pluginName: "OpenAI",
              enabled: true,
            },
          ],
        },
      ],
    });

    render(<SecretsView />);

    const addSecretButton = await screen.findByRole("button", {
      name: "secretsview.AddSecret",
    });

    await act(async () => {
      fireEvent.click(addSecretButton);
    });

    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(dialog, { key: " " });
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
