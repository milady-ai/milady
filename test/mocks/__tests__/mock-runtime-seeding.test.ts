import { LifeOpsService } from "@elizaos/app-lifeops/lifeops/service";
import { afterEach, describe, expect, it } from "vitest";
import { createMockedTestRuntime } from "../helpers/mock-runtime.ts";

const INTERNAL_URL = new URL("http://127.0.0.1:31337");

describe("mock runtime seeding", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it("seeds a connected Google grant with canonical capabilities and realistic feeds", async () => {
    const mocked = await createMockedTestRuntime({
      envs: ["google"],
      seedX: false,
    });
    cleanups.push(mocked.cleanup);

    const service = new LifeOpsService(mocked.runtime);
    const status = await service.getGoogleConnectorStatus(INTERNAL_URL);
    expect(status.connected).toBe(true);
    expect(status.grantedCapabilities).toEqual(
      expect.arrayContaining([
        "google.basic_identity",
        "google.calendar.read",
        "google.calendar.write",
        "google.gmail.triage",
        "google.gmail.send",
      ]),
    );

    const [triage, calendarResponse] = await Promise.all([
      service.getGmailTriage(INTERNAL_URL, { maxResults: 4, forceSync: true }),
      fetch(
        `${process.env.MILADY_MOCK_GOOGLE_BASE}/calendar/v3/calendars/primary/events?${new URLSearchParams(
          {
            singleEvents: "true",
            orderBy: "startTime",
            showDeleted: "false",
            maxResults: "50",
            timeMin: new Date().toISOString(),
            timeMax: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            fields:
              "items(id,status,summary,description,location,htmlLink,hangoutLink,iCalUID,recurringEventId,created,updated,start,end,organizer(email,displayName,self),attendees(email,displayName,responseStatus,self,organizer,optional),conferenceData(entryPoints(uri,label,entryPointType)))",
          },
        )}`,
      ).then(
        (response) =>
          response.json() as Promise<{
            items?: Array<{ summary?: string }>;
          }>,
      ),
    ]);

    expect(triage.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        "Invoice 4831 received",
        "Can you review the product brief?",
      ]),
    );
    expect(
      (calendarResponse.items ?? []).map((event) => event.summary),
    ).toEqual(
      expect.arrayContaining([
        "Intro meeting with Julia Chen",
        "1:1 with Alex",
      ]),
    );
  });

  it("seeds an X connector grant when the X mock is enabled", async () => {
    const mocked = await createMockedTestRuntime({
      envs: ["x-twitter"],
      seedGoogle: false,
    });
    cleanups.push(mocked.cleanup);

    const service = new LifeOpsService(mocked.runtime);
    const status = await service.getXConnectorStatus();
    expect(status.connected).toBe(true);
    expect(status.grantedCapabilities).toEqual(
      expect.arrayContaining(["x.read", "x.write"]),
    );
  });

  it("seeds local relationships and screen-time fixtures for benchmark runs", async () => {
    const mocked = await createMockedTestRuntime({
      envs: ["google"],
      seedX: false,
    });
    cleanups.push(mocked.cleanup);

    const service = new LifeOpsService(mocked.runtime);
    const today = new Date().toISOString().slice(0, 10);
    const [relationships, daily] = await Promise.all([
      service.listRelationships({ limit: 10 }),
      service.getScreenTimeDaily({ date: today, limit: 10 }),
    ]);

    expect(relationships.map((relationship) => relationship.name)).toEqual(
      expect.arrayContaining(["David Park", "Marcus Walters", "Jane Patel"]),
    );
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.map((row) => row.identifier)).toEqual(
      expect.arrayContaining(["com.apple.Safari", "com.microsoft.VSCode"]),
    );
  });
});
