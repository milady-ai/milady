import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentGrid } from "../components/dashboard/AgentGrid";
import { CreateAgentForm } from "../components/dashboard/CreateAgentForm";
import { CreditsPanel } from "../components/dashboard/CreditsPanel";
import { CloudClient } from "../lib/cloud-api";

const useAgentsMock = vi.fn();
const useAuthMock = vi.fn();
const useCloudLoginMock = vi.fn();

vi.mock("../lib/AgentProvider", () => ({
  useAgents: () => useAgentsMock(),
}));

vi.mock("../lib/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../components/dashboard/useCloudLogin", () => ({
  useCloudLogin: () => useCloudLoginMock(),
}));

describe("homepage pricing regression coverage", () => {
  beforeEach(() => {
    useAgentsMock.mockReturnValue({
      agents: [],
      filteredAgents: [],
      loading: false,
      isRefreshing: false,
      error: null,
      clearError: vi.fn(),
      refresh: vi.fn(),
    });
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      token: null,
      signOut: vi.fn(),
    });
    useCloudLoginMock.mockReturnValue({
      error: null,
      isAuthenticated: true,
      manualLoginUrl: null,
      signIn: vi.fn(),
      state: "idle",
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the credits panel pricing breakdown for hosted costs", async () => {
    useAgentsMock.mockReturnValue({
      agents: [
        {
          id: "cloud-1",
          source: "cloud",
          billing: { costPerHour: 0.01 },
        },
      ],
    });
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      token: "test-token",
      signOut: vi.fn(),
    });

    vi.spyOn(CloudClient.prototype, "getCreditsBalance").mockResolvedValue({
      balance: 500,
      currency: "credits",
    });
    vi.spyOn(CloudClient.prototype, "getCurrentSession").mockResolvedValue({
      credits: 12,
      requests: 34,
      tokens: 56,
    });
    vi.spyOn(CloudClient.prototype, "getBillingSettings").mockResolvedValue({
      settings: {
        autoTopUp: {
          enabled: true,
          hasPaymentMethod: true,
          threshold: 5,
          amount: 10,
        },
        limits: {
          minAmount: 5,
          maxAmount: 100,
        },
      },
    });
    vi.spyOn(CloudClient.prototype, "getCreditsSummary").mockResolvedValue({
      organization: {
        creditBalance: 500,
        autoTopUpEnabled: true,
        autoTopUpThreshold: 5,
        autoTopUpAmount: 10,
        hasPaymentMethod: true,
      },
      agentsSummary: {
        total: 1,
        totalAllocated: 25,
        totalSpent: 10,
        totalAvailable: 15,
        withBudget: 1,
        paused: 0,
      },
      pricing: {
        creditsPerDollar: 100,
        minimumTopUp: 5,
      },
    });

    render(<CreditsPanel />);

    // Wait for the overview tab to load
    await waitFor(() => {
      expect(screen.getByText("PRICING")).toBeTruthy();
    });

    // Overview tab: pricing rates section
    expect(screen.getByText("RUNNING AGENT")).toBeTruthy();
    expect(screen.getByText("IDLE AGENT")).toBeTruthy();

    // Switch to PURCHASE tab to check credit pack content
    fireEvent.click(screen.getByText("PURCHASE"));

    await waitFor(() => {
      expect(screen.getByText("CREDIT PACKS")).toBeTruthy();
    });

    // Pack names in current implementation
    expect(screen.getByText("STARTER")).toBeTruthy();
    expect(screen.getByText("STANDARD")).toBeTruthy();
    expect(screen.getByText("PRO")).toBeTruthy();

    // Min deposit footer uses API value ($5.00) when available
    // Use selector:'p' to scope to the leaf paragraph element in the purchase footer
    expect(
      screen.getByText(/Minimum deposit:/, { selector: "p" }),
    ).toBeTruthy();
  });

  it("shows the pricing note in the authenticated create form", () => {
    render(<CreateAgentForm onCreated={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(/HOSTING/)).toBeTruthy();
    expect(screen.getByText(/\$0\.01\/hr running/)).toBeTruthy();
    expect(screen.getByText(/\$0\.0025\/hr idle/)).toBeTruthy();
    expect(screen.getByText(/min\. balance \$5\.00/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deploy" })).toBeTruthy();
  });

  it("shows the pricing preview in the empty agents state", () => {
    render(<AgentGrid />);

    expect(screen.getByText("NO AGENTS FOUND")).toBeTruthy();
    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getByText("IDLE")).toBeTruthy();
    expect(screen.getByText("MIN. DEPOSIT")).toBeTruthy();
    expect(screen.getByText("$0.01/hr")).toBeTruthy();
    expect(screen.getByText("$0.0025/hr")).toBeTruthy();
    expect(screen.getByText("$5.00")).toBeTruthy();
    expect(screen.getByText("+ CREATE CLOUD AGENT")).toBeTruthy();
  });

  it("shows the API-provided minimumTopUp in the credits panel pricing section", async () => {
    useAgentsMock.mockReturnValue({ agents: [] });
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      token: "tok",
      signOut: vi.fn(),
    });
    vi.spyOn(CloudClient.prototype, "getCreditsBalance").mockResolvedValue({
      balance: 100,
      currency: "credits",
    });
    vi.spyOn(CloudClient.prototype, "getCurrentSession").mockResolvedValue({});
    vi.spyOn(CloudClient.prototype, "getBillingSettings").mockResolvedValue({});
    vi.spyOn(CloudClient.prototype, "getCreditsSummary").mockResolvedValue({
      organization: null,
      agentsSummary: null,
      pricing: { creditsPerDollar: 100, minimumTopUp: 10 },
    });

    render(<CreditsPanel />);

    // Wait for data to load then switch to purchase tab
    await waitFor(() => {
      expect(screen.getByText("PURCHASE")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("PURCHASE"));

    await waitFor(() => {
      // API returned minimumTopUp: 10 → should render $10.00, not the fallback $5.00
      const minDepositEl = screen.getByText(/Minimum deposit:/, {
        selector: "p",
      });
      expect(minDepositEl.textContent).toContain("$10.00");
    });
  });

  it("falls back to the static minimum deposit when pricing.minimumTopUp is absent", async () => {
    useAgentsMock.mockReturnValue({ agents: [] });
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      token: "tok",
      signOut: vi.fn(),
    });
    vi.spyOn(CloudClient.prototype, "getCreditsBalance").mockResolvedValue({
      balance: 100,
      currency: "credits",
    });
    vi.spyOn(CloudClient.prototype, "getCurrentSession").mockResolvedValue({});
    vi.spyOn(CloudClient.prototype, "getBillingSettings").mockResolvedValue({});
    vi.spyOn(CloudClient.prototype, "getCreditsSummary").mockResolvedValue({
      organization: null,
      agentsSummary: null,
      pricing: { creditsPerDollar: 100 },
    });

    render(<CreditsPanel />);

    // Wait for data to load then switch to purchase tab
    await waitFor(() => {
      expect(screen.getByText("PURCHASE")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("PURCHASE"));

    await waitFor(() => {
      // No minimumTopUp in API response → falls back to hardcoded $5.00
      const minDepositEl = screen.getByText(/Minimum deposit:/, {
        selector: "p",
      });
      expect(minDepositEl.textContent).toContain("$5.00");
    });
  });

  it("renders running and idle rate labels from shared constants in the create form", () => {
    render(<CreateAgentForm onCreated={vi.fn()} onCancel={vi.fn()} />);

    // Verify the pricing note renders the correct rates from pricing-constants
    const pricingNote = screen.getByText(/\$0\.01\/hr running/);
    expect(pricingNote).toBeTruthy();
    expect(pricingNote.textContent).toContain("$0.0025/hr idle");
    expect(pricingNote.textContent).toContain("min. balance $5.00");
  });
});
