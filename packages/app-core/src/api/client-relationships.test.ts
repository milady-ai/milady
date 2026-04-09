import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetWebsiteBlockerPlugin } = vi.hoisted(() => ({
  mockGetWebsiteBlockerPlugin: vi.fn(),
}));

vi.mock("../bridge/native-plugins", () => ({
  getWebsiteBlockerPlugin: mockGetWebsiteBlockerPlugin,
}));

import { MiladyClient } from "./client";

describe("MiladyClient relationships API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockGetWebsiteBlockerPlugin.mockReset();
  });

  it("fetches and unwraps the relationships graph snapshot", async () => {
    mockGetWebsiteBlockerPlugin.mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({
        data: {
          people: [
            {
              groupId: "group-1",
              primaryEntityId: "person-1",
            },
          ],
          relationships: [],
          stats: {
            totalPeople: 1,
            totalRelationships: 0,
            totalIdentities: 1,
          },
        },
      } as never);

    const client = new MiladyClient("http://127.0.0.1:31337");
    const graph = await client.getRelationshipsGraph({
      search: "chris",
      platform: "discord",
      limit: 25,
      offset: 10,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/relationships/graph?search=chris&platform=discord&limit=25&offset=10",
    );
    expect(graph.stats.totalPeople).toBe(1);
  });

  it("unwraps people and stats separately for the people list", async () => {
    mockGetWebsiteBlockerPlugin.mockReturnValue(null);
    vi.spyOn(MiladyClient.prototype, "fetch").mockResolvedValue({
      data: [
        {
          groupId: "group-1",
          primaryEntityId: "person-1",
          displayName: "Chris",
        },
      ],
      stats: {
        totalPeople: 1,
        totalRelationships: 2,
        totalIdentities: 3,
      },
    } as never);

    const client = new MiladyClient("http://127.0.0.1:31337");
    const result = await client.getRelationshipsPeople();

    expect(result.people[0]?.displayName).toBe("Chris");
    expect(result.stats.totalRelationships).toBe(2);
  });

  it("fetches and unwraps a single person detail", async () => {
    mockGetWebsiteBlockerPlugin.mockReturnValue(null);
    const fetchSpy = vi
      .spyOn(MiladyClient.prototype, "fetch")
      .mockResolvedValue({
        data: {
          groupId: "group-1",
          primaryEntityId: "person 1",
          displayName: "Chris",
          memberEntityIds: [],
          aliases: [],
          platforms: [],
          identities: [],
          emails: [],
          phones: [],
          websites: [],
          preferredCommunicationChannel: null,
          categories: [],
          tags: [],
          factCount: 0,
          relationshipCount: 0,
          facts: [],
          recentConversations: [],
          relationships: [],
          identityEdges: [],
        },
      } as never);

    const client = new MiladyClient("http://127.0.0.1:31337");
    const person = await client.getRelationshipsPerson("person 1");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/relationships/people/person%201",
    );
    expect(person.displayName).toBe("Chris");
  });
});
