// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseApp,
  mockGetMemoryFeed,
  mockBrowseMemories,
  mockGetMemoriesByEntity,
  mockGetMemoryStats,
  mockGetRelationshipsPeople,
} = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockGetMemoryFeed: vi.fn(),
  mockBrowseMemories: vi.fn(),
  mockGetMemoriesByEntity: vi.fn(),
  mockGetMemoryStats: vi.fn(),
  mockGetRelationshipsPeople: vi.fn(),
}));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../utils/format", () => ({
  formatDateTime: (_ts: number, _opts?: unknown) => "2026-04-08",
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getMemoryFeed: (...args: unknown[]) => mockGetMemoryFeed(...args),
    browseMemories: (...args: unknown[]) => mockBrowseMemories(...args),
    getMemoriesByEntity: (...args: unknown[]) =>
      mockGetMemoriesByEntity(...args),
    getMemoryStats: (...args: unknown[]) => mockGetMemoryStats(...args),
    getRelationshipsPeople: (...args: unknown[]) =>
      mockGetRelationshipsPeople(...args),
  },
}));

vi.mock("lucide-react", () => ({
  RefreshCw: ({ className }: { className?: string }) => (
    <span className={className}>refresh</span>
  ),
  Search: ({ className }: { className?: string }) => (
    <span className={className}>search</span>
  ),
}));

vi.mock("@miladyai/ui", () => {
  const Button = ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  );

  const PagePanelRoot = ({
    children,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
    compact?: boolean;
  }) => <div {...props}>{children}</div>;
  const PagePanel = Object.assign(PagePanelRoot, {
    SummaryCard: ({
      children,
    }: {
      children?: ReactNode;
      compact?: boolean;
      className?: string;
    }) => <div data-testid="summary-card">{children}</div>,
    Loading: ({ heading }: { heading?: ReactNode }) => (
      <div data-testid="loading">{heading}</div>
    ),
    Empty: ({
      title,
      description,
    }: {
      title?: ReactNode;
      description?: ReactNode;
      variant?: string;
      className?: string;
    }) => (
      <div data-testid="empty">
        <div>{title}</div>
        <div>{description}</div>
      </div>
    ),
  });

  const SidebarContentRoot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const SidebarContent = Object.assign(SidebarContentRoot, {
    SectionLabel: ({
      children,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <div>{children}</div>,
    Item: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      active?: boolean;
      "aria-current"?: string;
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    ItemIcon: ({ children }: { children?: ReactNode; active?: boolean }) => (
      <span>{children}</span>
    ),
    ItemTitle: ({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    ),
    ItemDescription: ({ children }: { children?: ReactNode }) => (
      <span>{children}</span>
    ),
  });

  return {
    Button,
    MetaPill: ({ children }: { children?: ReactNode; compact?: boolean }) => (
      <span>{children}</span>
    ),
    PageLayout: ({
      sidebar,
      children,
    }: {
      sidebar?: ReactNode;
      children?: ReactNode;
      contentHeader?: ReactNode;
      "data-testid"?: string;
    }) => (
      <div data-testid="memory-viewer-view">
        <div data-testid="sidebar-container">{sidebar}</div>
        <div data-testid="content-container">{children}</div>
      </div>
    ),
    PagePanel,
    SegmentedControl: ({
      value,
      onValueChange,
      items,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      items: Array<{ value: string; label: string; testId?: string }>;
      buttonClassName?: string;
    }) => (
      <div data-testid="segmented-control">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            data-testid={item.testId}
            data-active={value === item.value}
            onClick={() => onValueChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    ),
    Sidebar: ({ children }: { children?: ReactNode; testId?: string }) => (
      <div>{children}</div>
    ),
    SidebarContent,
    SidebarHeader: ({
      search,
    }: {
      search?: {
        value?: string;
        onChange?: (event: { target: { value: string } }) => void;
        placeholder?: string;
        "aria-label"?: string;
        onClear?: () => void;
      };
    }) => (
      <input
        aria-label={search?.["aria-label"] ?? search?.placeholder ?? "Search"}
        value={search?.value ?? ""}
        onChange={(event) =>
          search?.onChange?.({ target: { value: event.target.value } })
        }
      />
    ),
    SidebarPanel: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarScrollRegion: ({
      children,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <div>{children}</div>,
  };
});

import { MemoryViewerView } from "./MemoryViewerView";

function buildMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem-1",
    type: "facts",
    text: "User prefers async communication.",
    entityId: "entity-1",
    roomId: "room-1",
    agentId: "agent-1",
    createdAt: Date.now() - 60_000,
    metadata: null,
    source: "client_chat",
    ...overrides,
  };
}

describe("MemoryViewerView", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    });

    mockGetMemoryStats.mockResolvedValue({
      total: 14,
      byType: { messages: 8, facts: 4, memories: 2, documents: 0 },
    });

    mockGetMemoryFeed.mockResolvedValue({
      memories: [
        buildMemory({
          id: "mem-1",
          type: "facts",
          text: "A fact about the user.",
        }),
        buildMemory({ id: "mem-2", type: "messages", text: "Hello world" }),
      ],
      count: 2,
      limit: 50,
      hasMore: false,
    });

    mockBrowseMemories.mockResolvedValue({
      memories: [
        buildMemory({ id: "mem-10", type: "facts", text: "Browsed fact" }),
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    mockGetMemoriesByEntity.mockResolvedValue({
      memories: [
        buildMemory({
          id: "mem-20",
          type: "facts",
          text: "Entity-specific memory",
          entityId: "person-entity-1",
        }),
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    mockGetRelationshipsPeople.mockResolvedValue({
      people: [
        {
          groupId: "group-1",
          primaryEntityId: "person-entity-1",
          displayName: "Chris",
          memberEntityIds: ["person-entity-1"],
          aliases: [],
          platforms: ["discord"],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: null,
          categories: [],
          tags: [],
          factCount: 3,
          relationshipCount: 1,
          isOwner: false,
          profiles: [],
          lastInteractionAt: "2026-04-08T12:00:00.000Z",
        },
        {
          groupId: "group-2",
          primaryEntityId: "person-entity-2",
          displayName: "Alice",
          memberEntityIds: ["person-entity-2"],
          aliases: [],
          platforms: ["telegram"],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: null,
          categories: [],
          tags: [],
          factCount: 1,
          relationshipCount: 0,
          isOwner: false,
          profiles: [],
          lastInteractionAt: null,
        },
      ],
      stats: { totalPeople: 2, totalRelationships: 0, totalIdentities: 2 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders feed view with stats and memory cards", async () => {
    render(<MemoryViewerView />);

    // Stats load
    await waitFor(() => expect(mockGetMemoryStats).toHaveBeenCalledTimes(1));

    // Feed loads
    await waitFor(() => expect(mockGetMemoryFeed).toHaveBeenCalledTimes(1));

    // Stats totals rendered
    expect(await screen.findByText("14")).toBeTruthy();

    // Memory cards rendered
    expect(await screen.findByText("A fact about the user.")).toBeTruthy();
    expect(screen.getByText("Hello world")).toBeTruthy();
  });

  it("renders people list in sidebar", async () => {
    render(<MemoryViewerView />);

    await waitFor(() =>
      expect(mockGetRelationshipsPeople).toHaveBeenCalledTimes(1),
    );

    // People appear in sidebar (name renders in both ItemIcon and ItemTitle)
    const chrisElements = await screen.findAllByText("Chris");
    expect(chrisElements.length).toBeGreaterThanOrEqual(1);
    const aliceElements = screen.getAllByText("Alice");
    expect(aliceElements.length).toBeGreaterThanOrEqual(1);
  });

  it("switches to browse view when Browse is clicked", async () => {
    render(<MemoryViewerView />);

    await waitFor(() => expect(mockGetMemoryFeed).toHaveBeenCalled());

    const browseButtons = screen.getAllByTestId("memory-view-browse");
    fireEvent.click(browseButtons[0]);

    await waitFor(() => expect(mockBrowseMemories).toHaveBeenCalled());
    expect(screen.getByTestId("memory-browser")).toBeTruthy();
  });

  it("filters memories by person when a person is clicked", async () => {
    render(<MemoryViewerView />);

    // Wait for people to load
    await waitFor(() =>
      expect(mockGetRelationshipsPeople).toHaveBeenCalledTimes(1),
    );

    // Click on Chris in sidebar
    const chrisButtons = screen.getAllByRole("button", { name: /Chris/i });
    fireEvent.click(chrisButtons[0]);

    // Should switch to browse mode and load entity-specific memories
    await waitFor(() =>
      expect(mockGetMemoriesByEntity).toHaveBeenCalledWith(
        "person-entity-1",
        expect.objectContaining({ limit: 50, offset: 0 }),
      ),
    );

    expect(await screen.findByText("Entity-specific memory")).toBeTruthy();
  });

  it("shows empty state when feed has no memories", async () => {
    mockGetMemoryFeed.mockResolvedValue({
      memories: [],
      count: 0,
      limit: 50,
      hasMore: false,
    });

    render(<MemoryViewerView />);

    await waitFor(() => expect(mockGetMemoryFeed).toHaveBeenCalled());
    expect(await screen.findByText("No memories yet")).toBeTruthy();
  });

  it("shows Load older button when hasMore is true", async () => {
    mockGetMemoryFeed.mockResolvedValue({
      memories: [
        buildMemory({ id: "mem-99", type: "messages", text: "First batch" }),
      ],
      count: 1,
      limit: 50,
      hasMore: true,
    });

    render(<MemoryViewerView />);

    await waitFor(() => expect(mockGetMemoryFeed).toHaveBeenCalled());
    expect(await screen.findByText("Load older")).toBeTruthy();
  });

  it("shows error state when stats fail", async () => {
    mockGetMemoryStats.mockRejectedValue(new Error("stats failed"));

    render(<MemoryViewerView />);

    expect(
      await screen.findByText("Could not load memory stats."),
    ).toBeTruthy();
  });
});
