// @vitest-environment jsdom

import type { RelationshipsGraphSnapshot } from "@miladyai/app-core/api";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelationshipsGraphPanel } from "./RelationshipsGraphPanel";

function makeSnapshot(count: number): RelationshipsGraphSnapshot {
  const people = Array.from({ length: count }, (_, index) => ({
    groupId: `group-${index}`,
    primaryEntityId: `person-${index}`,
    memberEntityIds: [`entity-${index}`],
    displayName: `Person ${index}`,
    aliases: [],
    platforms: ["discord"],
    identities: [],
    emails: [],
    phones: [],
    websites: [],
    preferredCommunicationChannel: null,
    categories: [],
    tags: [],
    factCount: 0,
    relationshipCount: index === 0 || index === count - 1 ? 1 : 2,
    isOwner: index === 0,
    profiles: [],
    lastInteractionAt: `2026-04-${String((index % 9) + 1).padStart(2, "0")}T12:00:00.000Z`,
  }));

  const relationships = Array.from({ length: count - 1 }, (_, index) => ({
    id: `edge-${index}`,
    sourcePersonId: `group-${index}`,
    targetPersonId: `group-${index + 1}`,
    sourcePersonName: `Person ${index}`,
    targetPersonName: `Person ${index + 1}`,
    relationshipTypes: ["conversation", "direct_exchange"],
    sentiment: "neutral",
    strength: 0.6,
    interactionCount: 3,
    lastInteractionAt: "2026-04-09T00:00:00.000Z",
    rawRelationshipIds: [`room:${index}`],
  }));

  return {
    people,
    relationships,
    stats: {
      totalPeople: count,
      totalRelationships: relationships.length,
      totalIdentities: count,
    },
  };
}

describe("RelationshipsGraphPanel", () => {
  it("renders a focused global subgraph instead of every loaded node", () => {
    render(
      <RelationshipsGraphPanel
        snapshot={makeSnapshot(60)}
        selectedGroupId={null}
        onSelectGroupId={() => undefined}
      />,
    );

    expect(screen.getByText(/Most connected subgraph/)).toBeTruthy();
    expect(screen.getAllByRole("button").length).toBeLessThan(60);
  });

  it("renders the selected neighborhood instead of the full graph", () => {
    render(
      <RelationshipsGraphPanel
        snapshot={makeSnapshot(60)}
        selectedGroupId="group-0"
        onSelectGroupId={() => undefined}
      />,
    );

    expect(screen.getByText(/Selected neighborhood/)).toBeTruthy();
    expect(screen.getByLabelText("Select Person 0")).toBeTruthy();
    expect(screen.getByLabelText("Select Person 1")).toBeTruthy();
    expect(screen.queryByLabelText("Select Person 59")).toBeNull();
  });
});
