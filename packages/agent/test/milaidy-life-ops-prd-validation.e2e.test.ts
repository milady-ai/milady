/**
 * PRD validation inventory for Milaidy life-ops.
 *
 * Replace each `it.todo()` with executable assertions as the corresponding
 * implementation lands. This file keeps the PRD's milestone and acceptance
 * surface inside the repo so the delivery scope does not drift.
 */

import { describe, expect, it } from "vitest";

type Phase = "P0" | "P1" | "P2" | "P3";
type Domain =
  | "onboarding"
  | "tasks"
  | "habits"
  | "goals"
  | "reminders"
  | "calendar"
  | "gmail"
  | "workflows"
  | "privacy"
  | "channels"
  | "browser"
  | "x";

type Scenario = {
  id: string;
  phase: Phase;
  domain: Domain;
  title: string;
};

const contractScenarios: Scenario[] = [
  {
    id: "P0-01",
    phase: "P0",
    domain: "onboarding",
    title:
      "conversational onboarding asks for the user's name when unknown and explains unlocked connector capabilities",
  },
  {
    id: "P0-02",
    phase: "P0",
    domain: "tasks",
    title:
      '"Remind me to brush my teeth every morning and every night" creates one durable definition with separate bounded occurrences',
  },
  {
    id: "P0-03",
    phase: "P0",
    domain: "habits",
    title:
      "morning and night occurrences only surface when their relevance windows are active",
  },
  {
    id: "P0-04",
    phase: "P0",
    domain: "reminders",
    title:
      "snoozing a habit occurrence by 30 minutes reliably resurfaces it after restart",
  },
  {
    id: "P0-05",
    phase: "P0",
    domain: "tasks",
    title:
      "completing a recurring habit marks only the current occurrence and does not retire the definition",
  },
  {
    id: "P0-06",
    phase: "P0",
    domain: "habits",
    title:
      "progressive routine rules store the progression formula, not only the latest numeric target",
  },
  {
    id: "P0-07",
    phase: "P0",
    domain: "goals",
    title:
      "goals remain first-class objects with their own review surface and may suggest supporting tasks without collapsing into todos",
  },
  {
    id: "P0-08",
    phase: "P0",
    domain: "reminders",
    title:
      "the right rail shows next urgent tasks and active reminders without rendering every recurring item all day",
  },
  {
    id: "P0-09",
    phase: "P0",
    domain: "privacy",
    title:
      "personal routines, health-adjacent habits, and emotional goals default to private surfaces and are blocked from public contexts",
  },
  {
    id: "P1-01",
    phase: "P1",
    domain: "calendar",
    title:
      "desktop local mode completes Google OAuth via installed-app PKCE plus loopback callback for calendar read access",
  },
  {
    id: "P1-02",
    phase: "P1",
    domain: "calendar",
    title:
      "remote or hosted mode completes Google OAuth via web-server callback while exposing the same connector status contract to the UI",
  },
  {
    id: "P1-03",
    phase: "P1",
    domain: "calendar",
    title:
      "today's calendar widget shows upcoming events in order and supports click-through into fuller detail",
  },
  {
    id: "P1-04",
    phase: "P1",
    domain: "calendar",
    title:
      "the agent answers next-event context questions with time, attendees, location, preparation needs, and linked mail context when available",
  },
  {
    id: "P1-05",
    phase: "P1",
    domain: "calendar",
    title:
      '"Schedule something for me tomorrow afternoon" requires calendar write capability and creates the expected event window',
  },
  {
    id: "P1-06",
    phase: "P1",
    domain: "reminders",
    title:
      "calendar event reminders are emitted through the same reminder and escalation engine used for tasks",
  },
  {
    id: "P1-07",
    phase: "P1",
    domain: "gmail",
    title:
      "Gmail triage surfaces important new mail and likely-reply-needed messages with clearly scoped permissions",
  },
  {
    id: "P1-08",
    phase: "P1",
    domain: "gmail",
    title:
      "reply drafting is allowed but message send remains blocked until the user explicitly confirms or enables a trusted automation",
  },
  {
    id: "P1-09",
    phase: "P1",
    domain: "gmail",
    title:
      "adding Gmail after Calendar triggers an explicit re-consent flow and updates the recorded granted capabilities",
  },
  {
    id: "P2-01",
    phase: "P2",
    domain: "channels",
    title:
      "phone number capture requires explicit consent and records whether SMS and voice escalation are individually allowed",
  },
  {
    id: "P2-02",
    phase: "P2",
    domain: "reminders",
    title:
      "multi-step escalation respects quiet hours, channel policies, urgency, and prior acknowledgment state",
  },
  {
    id: "P2-03",
    phase: "P2",
    domain: "workflows",
    title:
      "scheduled workflows are inspectable, editable, pausable, and attributable to a clear origin",
  },
  {
    id: "P2-04",
    phase: "P2",
    domain: "workflows",
    title:
      "workflow actions may create tasks, check calendar or mail state, summarize information, and run browser actions under policy gates",
  },
  {
    id: "P2-05",
    phase: "P2",
    domain: "reminders",
    title:
      "the user can inspect why a reminder fired, which connector was used, and which escalation step executed",
  },
  {
    id: "P3-01",
    phase: "P3",
    domain: "x",
    title:
      "X read and write capabilities are stored separately and presented as distinct permissions",
  },
  {
    id: "P3-02",
    phase: "P3",
    domain: "x",
    title:
      "posting to X never happens without per-post confirmation or an independently approved trusted posting policy",
  },
  {
    id: "P3-03",
    phase: "P3",
    domain: "browser",
    title:
      "agent-controlled browser sessions expose visible state including awaiting confirmation, navigating, and done",
  },
  {
    id: "P3-04",
    phase: "P3",
    domain: "browser",
    title:
      "browser-side account-affecting actions require explicit confirmation before execution",
  },
];

const liveScenarios: Scenario[] = [
  {
    id: "LIVE-01",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google desktop OAuth loopback callback exchanges a code and stores a refresh token locally",
  },
  {
    id: "LIVE-02",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google remote HTTPS callback exchanges a code and surfaces connected status to the Milady UI",
  },
  {
    id: "LIVE-03",
    phase: "P1",
    domain: "calendar",
    title:
      "real Google Calendar sync refreshes upcoming events and recovers cleanly after access token expiry",
  },
  {
    id: "LIVE-04",
    phase: "P1",
    domain: "gmail",
    title:
      "real Gmail triage reads the configured mailbox with the approved scope set and never sends mail automatically",
  },
  {
    id: "LIVE-05",
    phase: "P1",
    domain: "gmail",
    title:
      "revoking Google access on the account side forces connector status back to disconnected or needs-reauth",
  },
  {
    id: "LIVE-06",
    phase: "P2",
    domain: "channels",
    title:
      "Twilio or approved private channel escalation fires only on allowed channels and records the delivery audit trail",
  },
  {
    id: "LIVE-07",
    phase: "P2",
    domain: "calendar",
    title:
      "Workspace admin policy blocks produce a surfaced permission error instead of a silent connector failure",
  },
  {
    id: "LIVE-08",
    phase: "P3",
    domain: "browser",
    title:
      "real browser-session visibility stays in sync while the agent navigates and waits for user approval",
  },
];

const requiredDomains: Domain[] = [
  "onboarding",
  "tasks",
  "habits",
  "goals",
  "reminders",
  "calendar",
  "gmail",
  "workflows",
  "privacy",
  "channels",
  "browser",
  "x",
];

function assertUniqueScenarioIds(scenarios: Scenario[]): void {
  const ids = scenarios.map((scenario) => scenario.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe("Milaidy PRD validation inventory", () => {
  it("covers every milestone phase", () => {
    const phases = [...new Set(contractScenarios.map((scenario) => scenario.phase))].sort();
    expect(phases).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("covers every required product domain", () => {
    const domains = new Set(contractScenarios.map((scenario) => scenario.domain));
    for (const domain of requiredDomains) {
      expect(domains.has(domain)).toBe(true);
    }
  });

  it("keeps contract scenario ids unique", () => {
    assertUniqueScenarioIds(contractScenarios);
  });

  it("keeps live scenario ids unique", () => {
    assertUniqueScenarioIds(liveScenarios);
  });
});

for (const phase of ["P0", "P1", "P2", "P3"] as const) {
  describe(`Milaidy PRD contract coverage ${phase}`, () => {
    for (const scenario of contractScenarios.filter(
      (candidate) => candidate.phase === phase,
    )) {
      it.todo(`[${scenario.id}] ${scenario.title}`);
    }
  });
}

const describeLive =
  process.env.MILADY_LIFEOPS_LIVE_TEST === "1" ? describe : describe.skip;

describeLive("Milaidy PRD live connector coverage", () => {
  for (const scenario of liveScenarios) {
    it.todo(`[${scenario.id}] ${scenario.title}`);
  }
});
