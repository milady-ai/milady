// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp, mockGetRelationshipsGraph, mockGetRelationshipsPerson } =
  vi.hoisted(() => ({
    mockUseApp: vi.fn(),
    mockGetRelationshipsGraph: vi.fn(),
    mockGetRelationshipsPerson: vi.fn(),
  }));

vi.mock("../../state", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getRelationshipsGraph: (...args: unknown[]) =>
      mockGetRelationshipsGraph(...args),
    getRelationshipsPerson: (...args: unknown[]) =>
      mockGetRelationshipsPerson(...args),
  },
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
  }) => <div {...props}>{children}</div>;
  const PagePanel = Object.assign(PagePanelRoot, {
    SummaryCard: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    Loading: ({ heading }: { heading?: ReactNode }) => <div>{heading}</div>,
    Empty: ({
      title,
      description,
    }: {
      title?: ReactNode;
      description?: ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        <div>{description}</div>
      </div>
    ),
  });

  const SidebarContentRoot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  const SidebarContent = Object.assign(SidebarContentRoot, {
    SectionLabel: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    Item: ({
      children,
      onClick,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      active?: boolean;
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
    }) => (
      <div>
        <div>{sidebar}</div>
        <div>{children}</div>
      </div>
    ),
    PagePanel,
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
      };
    }) => (
      <input
        aria-label={search?.placeholder ?? "Search"}
        value={search?.value ?? ""}
        onChange={(event) =>
          search?.onChange?.({ target: { value: event.target.value } })
        }
      />
    ),
    SidebarPanel: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    SidebarScrollRegion: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

vi.mock("./RelationshipsGraphPanel", () => ({
  RelationshipsGraphPanel: ({
    snapshot,
    onSelectGroupId,
  }: {
    snapshot: {
      people: Array<{ groupId: string; displayName: string }>;
    } | null;
    onSelectGroupId: (groupId: string) => void;
    selectedGroupId: string | null;
  }) => (
    <div>
      <div>graph-count:{snapshot?.people.length ?? 0}</div>
      {snapshot?.people.map((person) => (
        <button
          key={person.groupId}
          type="button"
          onClick={() => onSelectGroupId(person.groupId)}
        >
          graph:{person.displayName}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("./RelationshipsIdentityCluster", () => ({
  RelationshipsIdentityCluster: ({
    person,
  }: {
    person: { displayName: string; memberEntityIds: string[] };
  }) => (
    <div>
      cluster:{person.displayName}:{person.memberEntityIds.length}
    </div>
  ),
}));

import { RelationshipsView } from "./RelationshipsView";

describe("RelationshipsView", () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue({
      t: (key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key,
    });
    mockGetRelationshipsGraph.mockResolvedValue({
      people: [
        {
          groupId: "group-1",
          primaryEntityId: "person-1",
          displayName: "Chris",
          memberEntityIds: ["discord:1", "telegram:1"],
          aliases: ["thatdog72"],
          platforms: ["discord", "telegram"],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: "discord",
          categories: [],
          tags: [],
          factCount: 2,
          relationshipCount: 3,
          lastInteractionAt: "2026-04-08T12:00:00.000Z",
        },
        {
          groupId: "group-2",
          primaryEntityId: "person-2",
          displayName: "Alice",
          memberEntityIds: ["discord:2"],
          aliases: [],
          platforms: ["discord"],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: null,
          categories: [],
          tags: [],
          factCount: 1,
          relationshipCount: 1,
          lastInteractionAt: "2026-04-07T12:00:00.000Z",
        },
      ],
      relationships: [],
      stats: {
        totalPeople: 2,
        totalRelationships: 0,
        totalIdentities: 3,
      },
    });
    mockGetRelationshipsPerson.mockImplementation(async (id: string) => ({
      groupId: id === "person-1" ? "group-1" : "group-2",
      primaryEntityId: id,
      displayName: id === "person-1" ? "Chris" : "Alice",
      memberEntityIds:
        id === "person-1" ? ["discord:1", "telegram:1"] : ["discord:2"],
      aliases: id === "person-1" ? ["thatdog72"] : [],
      platforms: ["discord"],
      identities: [
        {
          entityId: `${id}:discord`,
          names: [id === "person-1" ? "Chris" : "Alice"],
          platforms: ["discord"],
          handles: [
            {
              entityId: `${id}:discord`,
              platform: "discord",
              handle: id === "person-1" ? "thatdog72" : "alice",
            },
          ],
        },
      ],
      emails: id === "person-1" ? ["chris@example.com"] : [],
      phones: [],
      websites: [],
      preferredCommunicationChannel: "discord",
      categories: [],
      tags: [],
      factCount: 1,
      relationshipCount: 0,
      lastInteractionAt: "2026-04-08T12:00:00.000Z",
      facts: [
        {
          id: `${id}:fact`,
          sourceType: "memory",
          text:
            id === "person-1" ? "Prefers async updates." : "Works on growth.",
          confidence: 0.8,
        },
      ],
      recentConversations: [
        {
          roomId: `${id}:room`,
          roomName: "Discord DM",
          messages: [
            {
              id: `${id}:message`,
              speaker: id === "person-1" ? "Chris" : "Alice",
              text: "Latest note from the room.",
            },
          ],
        },
      ],
      relationships: [],
      identityEdges: [],
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the graph, selects the first person, and renders detail data", async () => {
    render(<RelationshipsView />);

    await waitFor(() =>
      expect(mockGetRelationshipsGraph).toHaveBeenCalledWith({
        search: undefined,
        platform: undefined,
        limit: 200,
      }),
    );

    await screen.findByText("Chris");
    expect(await screen.findByText("chris@example.com")).toBeTruthy();
    expect(await screen.findByText("Prefers async updates.")).toBeTruthy();
    expect(screen.getByText("cluster:Chris:2")).toBeTruthy();
  });

  it("switches detail panes when a different person is selected", async () => {
    render(<RelationshipsView />);
    await waitFor(() => {
      expect(mockGetRelationshipsPerson).toHaveBeenCalledWith("person-1");
    });

    const aliceButtons = screen.getAllByRole("button", { name: /Alice/i });
    expect(aliceButtons.length).toBeGreaterThan(0);
    fireEvent.click(aliceButtons[0]);

    await waitFor(() => {
      expect(mockGetRelationshipsPerson).toHaveBeenCalledWith("person-2");
    });
    expect(await screen.findByText("Works on growth.")).toBeTruthy();
  });
});
