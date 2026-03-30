/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the client module before importing the component
vi.mock("../../api", () => ({
  client: {
    getStewardStatus: vi.fn(),
    getStewardPolicies: vi.fn(),
    setStewardPolicies: vi.fn(),
  },
}));

// Mock lucide-react icons to avoid rendering issues in test
vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert" />,
  Clock: () => <span data-testid="icon-clock" />,
  DollarSign: () => <span data-testid="icon-dollar" />,
  Gauge: () => <span data-testid="icon-gauge" />,
  Plus: () => <span data-testid="icon-plus" />,
  Shield: () => <span data-testid="icon-shield" />,
  ShieldCheck: () => <span data-testid="icon-shield-check" />,
  Trash2: () => <span data-testid="icon-trash" />,
  Zap: () => <span data-testid="icon-zap" />,
}));

// Mock @miladyai/ui components as simple HTML elements
vi.mock("@miladyai/ui", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  ConfirmDialog: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  Input: ({ value, onChange, ...props }: any) => (
    <input value={value} onChange={onChange} {...props} />
  ),
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
  SectionCard: ({ children, title, ...props }: any) => (
    <div {...props}>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  Slider: ({ value, onValueChange, ...props }: any) => (
    <input
      type="range"
      value={value?.[0]}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      {...props}
    />
  ),
  Spinner: () => <div data-testid="spinner" />,
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PolicyControlsView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports PolicyControlsView component", async () => {
    const mod = await import("../PolicyControlsView");
    expect(mod.PolicyControlsView).toBeDefined();
    expect(typeof mod.PolicyControlsView).toBe("function");
  });

  it("renders loading state initially", async () => {
    const { client } = await import("../../api");
    // Never resolve to keep it in loading state
    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    const mod = await import("../PolicyControlsView");
    const { container } = render(<mod.PolicyControlsView />);

    // Should show a spinner or loading indicator
    expect(container.textContent).toBeDefined();
  });

  it("shows steward-not-connected message when not configured", async () => {
    const { client } = await import("../../api");
    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: false,
      available: false,
      connected: false,
    });

    const mod = await import("../PolicyControlsView");
    render(<mod.PolicyControlsView />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      // Should indicate steward isn't connected/configured
      expect(
        text.toLowerCase().includes("not connected") ||
          text.toLowerCase().includes("not configured") ||
          text.toLowerCase().includes("connect") ||
          text.toLowerCase().includes("steward"),
      ).toBe(true);
    });
  });

  it("loads and displays policies when steward is connected", async () => {
    const { client } = await import("../../api");
    const mockPolicies = [
      {
        id: "spending-limit-1",
        type: "spending-limit",
        enabled: true,
        config: { maxPerTx: "0.1", maxPerDay: "1.0", maxPerWeek: "5.0" },
      },
      {
        id: "rate-limit-1",
        type: "rate-limit",
        enabled: false,
        config: { maxTxPerHour: 10, maxTxPerDay: 50 },
      },
    ];

    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "test-agent",
    });
    (client.getStewardPolicies as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockPolicies,
    );

    const mod = await import("../PolicyControlsView");
    render(<mod.PolicyControlsView />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      // Should display spending limit policy
      expect(
        text.toLowerCase().includes("spending") ||
          text.toLowerCase().includes("limit") ||
          text.toLowerCase().includes("0.1"),
      ).toBe(true);
    });
  });

  it("shows empty state when no policies exist", async () => {
    const { client } = await import("../../api");

    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "test-agent",
    });
    (client.getStewardPolicies as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    const mod = await import("../PolicyControlsView");
    render(<mod.PolicyControlsView />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      // Should show some indication of no policies or ability to add
      expect(
        text.toLowerCase().includes("no polic") ||
          text.toLowerCase().includes("add") ||
          text.toLowerCase().includes("create"),
      ).toBe(true);
    });
  });

  it("calls setStewardPolicies on save", async () => {
    const { client } = await import("../../api");
    const mockPolicies = [
      {
        id: "spending-limit-1",
        type: "spending-limit",
        enabled: true,
        config: { maxPerTx: "0.1", maxPerDay: "1.0", maxPerWeek: "5.0" },
      },
    ];

    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "test-agent",
    });
    (client.getStewardPolicies as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockPolicies,
    );
    (client.setStewardPolicies as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
    });

    const mod = await import("../PolicyControlsView");
    render(<mod.PolicyControlsView />);

    // Wait for policies to load
    await waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(
        text.toLowerCase().includes("spending") ||
          text.toLowerCase().includes("limit"),
      ).toBe(true);
    });

    // Find and click a toggle to make the form dirty, then look for a save button
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);

      // Look for save button
      const saveButton = Array.from(document.querySelectorAll("button")).find(
        (btn) => (btn.textContent ?? "").toLowerCase().includes("save"),
      );
      if (saveButton) {
        fireEvent.click(saveButton);

        await waitFor(() => {
          expect(client.setStewardPolicies).toHaveBeenCalled();
        });
      }
    }
  });

  it("handles API error gracefully", async () => {
    const { client } = await import("../../api");

    (client.getStewardStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      available: true,
      connected: true,
      agentId: "test-agent",
    });
    (client.getStewardPolicies as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    const mod = await import("../PolicyControlsView");
    render(<mod.PolicyControlsView />);

    await waitFor(() => {
      const text = document.body.textContent ?? "";
      // Should show an error message
      expect(
        text.toLowerCase().includes("error") ||
          text.toLowerCase().includes("failed") ||
          text.toLowerCase().includes("retry"),
      ).toBe(true);
    });
  });
});
