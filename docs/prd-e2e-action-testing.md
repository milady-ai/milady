# PRD: E2E Conversation Testing with Action Verification

## Audio Transcripts

### Recording 47 — Full Transcript (~19 min)

Okay. So first, the capabilities. The agent has the ability, I can log in with multiple Gmail accounts that are my accounts, and I can also set up a Gmail account and log it in for the agent, so the agent has its own account. I also can set up my own GitHub, and the agent can have its own GitHub, so that it can do things with the GitHub. I also want to have integration locally with Discord, Telegram, Twitter, and Signal. And it is using those as like a client where it can or whatever hack it has to do, even if that's agent browser browsing into a real website, you know, or a plugin or whatever we do. but it has to be connected and fully integrated with my local information. The agent also can be logged in with Telegram, Discord, and Twitter, but uses APIs so that it's all legit. These are just for locally reading my messages and getting access to my information. It also has a browser extension, so the agent has its own browser, but then we also have the LifeOps browser where it can see what I see in my Chrome and Safari. And we also have computer use. And we do want to have like, we want to have some other things like, we also have reminders and we have calendar, right? And alarm. So like these very basic things. and we want to have access to all of those, the ability to set, update, list for all of those things. And we want to know, like, we look at apps like WakaTime that track what app we're using and basically screen activity across apps and we want this so we want to know what app the user using what the context is what other apps are open like how much time they spent on each app And then we also want to start tracking within our LifeOps extension for browser, like how much time they spend on each website and especially tracking socials like Twitter, Facebook, Instagram, et cetera, and how much time is dedicated to those. so this is something we don't have yet but that we really want to add and the other big feature we don't have yet that we want to add is the x so that x.com so that you can get all of the information from x like get you know interesting things on your feed but never have to see the feed you just say like hey i want this or i want to do this and it can search, it can like scroll and pull and summarize and even present that information in like a compelling way in the chat, but you never have to go to X. So this is a, and the same thing, we want to have DM support so that you can handle reading and sending direct messages. and this might require automation through the system. Probably. Who knows? That seems like the most likely thing. And we don't want to get banned, so we don't want to do anything crazy. But the goal is that we can read our incoming DMs and then do things like link in a group chat with the agents in the DMs and then the agent can handle it through the API. but we just have to like handle that first initial linking in and conversation and stuff so that's like the capabilities then there's like kind of my needs right i need a secretary i need an assistant i need an agent that can schedule things that can defend my time that asks me if like I want to schedule with people or not, or how to handle situations until it feels confident. I want it to get information about them and be integrated with our Rolodex or relationship system so that it's like building and tracking relationships. I want it to work across all of my social medias. And then I also really, it's really important to me that it can track when I haven't followed up with someone in a while, or if I have to follow up with someone in a while. If I have to follow up, I want it to remind me every day of the people I haven't followed up with. I want it to be able to draft follow-ups and send them. I want it to be able to do this with email, Discord, Telegram, Twitter DMs, and Signal. and I want all of those to be just like I set it up, log in, it's on my Mac, and I can do anything there, right? So it should be as painless as possible to set up and integrate and like anyone can run this on their Mac and it will just work. Alternatively, like if they have a computer running not on their local machine, like the agent is on a remote, then the app serves as kind of like a bridge. So the same thing, but the agent could be like in the, you know, like in our cloud, but the app is running on their machine. And so they still have the same like benefit of connector and all of that, you know, connectors to the reminders and calendar and like local APIs and all of that stuff. Right. and we are also giving them the agent has like a browser and computer control and shell access so it can pretty much do anything a bunch of different ways but those are more like advanced mode And we really want this to work and like do everything in the kind of non simple mode first So that's basically the whole deal. Then I'm going to talk about some of like the user stories, right? Well, okay, so, you know, I talked about my need for messaging. Um, like I need to, I'm overwhelmed by messages coming in and I don't respond to a lot of them and I need to like triage. I need to determine if they're important or not. I need to know how to like respond and not respond and handle with my agent and all of that. Um, and my agent needs to help me and bring all of this just like into my chat interface where I'm chatting with the agent, like so that I can do this right. You know, all of this should just be in front of me. And so this is email and this is all the messaging. I also have things that I really want to do in my life So I have a whole bunch of to-dos like I need to remember things like put my Invisalign back in and that's like a regular Reminder that I need. I also need to remember to drink water and to stretch and I have I also have to-dos that I want to do every day and like cross off like brushing my teeth twice a day and working out and you know are doing like a set amount of sit-ups and push-ups and all of these things and I want it to evaluate and remind me and I want it to connect with me in the morning and night and just be like hey good night hey by the way these are still the things you know like hey I know you're probably tired but you should really just get these things done right now um so it needs to be like very forceful and reminding me to get the like the night things done and in the morning you know when I wake up it's forceful and reminding me to get the day things done. And it's also pushing like who I have to respond to. And ideally, it's already like, you know, decided like, oh, and I've drafted this to them, you know, can you approve this and then I can approve or I can edit and we can just go through like the daily tasks of everything we need to do every day and make sure that it gets done. Uh, and we're obviously storing all of this information. So, you know, eventually we can start to learn from it and, uh, pull it in as experience. Right. So I want all of this, um, where the agent is helping me, It's summarizing for every day. It's staying in touch with everybody. It's making sure that I stay on top of things. It's flagging things as like low priority, mid priority, high priority. And high priority would be like if someone needs to get paid and they're stressing out and they're going to quit the project. Low priority would be like somebody DMing us out of the blue to like tell us about their project or something like that. And so, and in a lot of cases, like, you know, the agent, if it's like very like, you know, a stranger or something and be like, hey, I'm very overwhelmed right now, but if you want to, like, give me information that I can then go and send to real Shaw, you know, or, like, actually review, I'd love to see that, you know, and ideally, though, the, like, we make a group chat, but it might also be weird to make a group chat sometimes, so sometimes we just send a reply, right, sometimes the agent will handle it and do, like, scheduling, and sometimes we'll reply, so this is another thing is that I want the agent, it has access to my calendar and I want it to be able to schedule things with people meaningfully. Like, hey, here's some times for me, are these good for you? And that means it needs to ask me what are some good times. It needs to know my preferences for times that I enjoy to have meetings. It needs to know if I want to have a meeting with them and then it needs to like schedule with them and figure out what their schedule looks like. it also should ideally be able to like navigate a Calendly and a Google calendar and all of that so that it can you know like work on their side um and schedule with them Uh and that might require the browser you know but that a big use case right Is um like scheduling and coordination. Um, and then I want it to have, like, it has a to-do list. So, you know, it has, um, like, like kind of different kinds of to-do, like, like things that are upcoming, things that are long-term, things that are one-offs and things that are repeat. And so I need to show that information kind of like the upcoming stuff is in my dashboard. And then I have like all of my to-dos and stuff in my life ops dashboard. So I have like a little chat, you know, where I can see, but then I can also see like, Hey, you've got this meeting coming up. And so that kind of, you know, um, I have a dashboard for that. And then I often like miss meetings or I'm late to meetings. And so I really need like reminders. I needed to set an alarm that goes off on my phone and my computer. I needed to set, which, which also means that like, if I have it installed in two places that ideally understands and can like make sure that those intents are, are global to my devices. And, you know, so if I'm running it on my phone, it would be great if it's like not just setting off an alarm on my computer, but it could like call me. It can text me. It can set alarms on my phone. It could set reminders on my phone. All of that stuff, right? So it would be easy to go with my Mac and my iPhone and then eventually everything, right? Android and desktop would be great too, of course. But for me, that's what I need. and for anything important it will make sure that you know like that I have a little bit of space before and after any important meeting and even more space if I have to travel it will give me a dossier of everything I need to know about every upcoming thing every day as well as reminders like an hour before and 10 minutes before and then, you know, like on the dot, especially if it sets an alarm and, you know, that stuff, you know, what it really needs, right? And it will just be constantly like asking me for follow-up, you know, and then summarizing what I say and doing some of it and then pruning those tasks or marking them, you know, and continuing with the things that still need to be done. So obviously needs to have a lot of context and storing this stuff and reviewing it. And so we also need to have a service that kind of goes through and like looks at everything and looks at everything we did and make sure we did it right. And, you know, evaluates and handles all the stuff, right, that we want for our life. and basically like if there's anything else that an assistant does we really want to do all of that stuff we want to be able to do that i think another thing that would be really compelling is also integrating like my proton pass and my one password so that the agent can inject things if like like into fields on websites that are whitelisted and it can also start with like a big default set of like very popular websites, like all socials, all, um, like big shopping, all search, you know, all the things, like all the big things. Um, and, but, um, and, and maybe there's like a website of, or a list of like white listed domains that are not scams, but basically anything that's not a scam, it can go and like use and put this information in, into a field right So the idea is that the agent can go and fill fill stuff out using passwords that I like put in my one password or whatever um or my proton pass And then it can like get through things. Um, another element of this is that it needs to be able to like open up a session or a portal or something to me. Um, so that I can like fix things or press buttons or press captchas and that could be like a remote vnc thing um i think that's probably best if that's possible and it's going to get through like a cloud flare is like you know just like shows me my mac or whatever and lets me control it remotely and that could be cool because then like i just have like a discord like eliza cloud let me have a discord login or gmail login whatever and if those are connected to my account then i can get through and like connect to that um to, to my, you know, to my agent. And so I think that having that, like, ability to, like, call for help, and then like show either a putty terminal, where we can like do login. But ideally, like the full computer, like full computer control from my, like, phone would be ideal. And then, you know, whatever else I have to do around that to, like, you know, do any of those things. Like, it might be a, like, you know, ideally I can control my computer from my phone. I can go and, like, log in or connect or, like, do the cloud code or press the button and make sure that, like, I have pushed it along in whatever way it needs to be pushed along. or I need to like sign something or whatever. So it can like automate everything. And then if it runs into problems with the browser or computer use or anything, it can call me for help and get help. Now, another thing that I want to add is the ability to enter my phone number. And so it can call me. call me and we're going to use Twilio for this so that it can communicate with me over Twilio. And we have, I'll be able, I can enter either Twilio or Blue Bubbles or Blueo. So it can also just use my messaging system to, oh, this, sorry, this is another feature is that it also has access to my iMessage, like my local iMessage on my phone, on my Mac, so it can see all of my iMessages as well, and it can send iMessages on my behalf if I can confirm them, and every single one of these should have a strong prompt, like do not do this until you confirm for anything like sending or whatever. So, um, but oftentimes like they might want like the agent to be able to call or text, um, you know, or whatever. Um, and even if that's like, yeah. And, and in that case, we should have like Eliza cloud set up with Twilio, uh, and or Blueo and we should charge We should make sure that we're charging for them so that like, you know, if an agent sends a blue text, it's, we're actually charging like, you know, three cents for that or whatever, cause we have to pay two cents for it Um but I want that in so that we have the gateway through through like a phone number And we should actually have two phone numbers one for Twilio and one for Bluio And we should have these phone numbers set up so that we can like, like if your agent sets up and connects and you put in your phone number, then now it gateways through to your agent from what you sent. Right. And actually the same thing is true for, um, discord telegram. Um, and at least those two where, um, you can just use, uh, and WhatsApp, I guess, where you can just use our bot, um, to, uh, gateway through as long as your thing is connected. Right. So that's up to, um, you can use our cloud for that and then we just like pass on any costs with a 20 markup if there is right so that's like part of our cloud but i do want this to be part of like life ops is that you can set this up yourself or you can like automate it and this isn't actually part of life ops it's just the interface for life ops should like integrate this and control the core apis and the plugin APIs for those things so that it has like full access and awareness, right? That's kind of the idea there.

### Recording 48 — Full Transcript (~5 min)

Okay, so I want to add a few more features. Like, for me, it needs to remind me regularly to take my vitamins and to put my Invisalign in. It should track my Invisalign and know, like, every two weeks I need to put the next one in, or I guess every ten days. And it should, like, put that on as, like, a reminder or a cron, and, you know, that can be happening. um it needs to like track things about me also like life ops to track like my uh relationship status relationship goals um if there's any individual to-dos um and it should like try to make that like an important part of my um you know the whole application um and the core thing of this whole M'lady app is that I could be out, like, just walking around the world, and my phone can control my computer and I have a full personal assistant that does everything my real personal assistant does And uh from that um I could be like going on hikes and getting all of my work done And so another big part, this is not life offs, but this is just going to need to be like a critical part of Eliza app core and agent, um, is this ability to open like tail scale or ideally i mean maybe put this through eliza cloud or something i don't know that'd be ideal because we don't need like a tail scale setup um or we have tail scale like routed through eliza cloud whatever it is whatever the simple thing is um so that um we can let the like i could jump in emergency wise and control my computer i can control like i can see what the agent's doing. I can help the agent. I can type something in. I can approve something. I can, you know do whatever has to be done in order to solve any problem while I out including like restarting debugging all that stuff So it has to have a really solid remote connection that also secure And it can be secured by either Eliza Cloud with a login or password, or just some sort of pairing code thing. But that's also really important, is that the remote is secured by a pairing code. and only if I'm like local running it locally do I not have to type the parent code in um so that's everything I think is that everything um yeah uh I really want to make sure that like you know it cannot just help me work out but like thinks about how you know to like encourage me and make sure that I do it. It can, like, block websites and, like, applications. If I haven't done things, you know, it should be, like, pretty harsh and strict. And, like, it's basically, like, honestly, this is, like, a parent. You know this is a parent for a lot of us who didn have a parent or have problems and are like addicted to our computers and our phones And so it should be able to block social media and like you know control these things but we self so it going to ask us, and like, you know, not just start this stuff, but like ask us, you know, and when we set this stuff, it will enforce it, but it's, you know, to our preference. The other thing is that it has to be multi-device, like I have my phone and my Mac, so everything has to consider that, and keep that in mind and then i'm going to be connecting to the same agent through both and basically see like the same interface um but they are different devices with different access and like the agent is you know on my if the if i connect with my remote on my ios i can connect to my mac from that or i could have the agent in the cloud and both of them connect to that in which case like the the application is still like a bridge to all of the native features right so that's very important. So I want to make sure that, you know, it's taking care of me in all of these ways and basically doing all of the things, making sure I don't forget anything. I prioritize stuff. I can deprioritize stuff, et cetera.

---

## Current State Analysis

### What EXISTS for E2E Conversation Testing

| Component | Location | Description |
|-----------|----------|-------------|
| Full runtime E2E | `eliza/packages/app-core/test/live-agent/agent-runtime.live.e2e.test.ts` | Real LLM + PGLite, no mocks. Tests startup, shouldRespond, multi-turn memory, REST API, autonomy, triggers |
| `handleMessageAndCollectText()` | Same file | Helper: sends message to runtime.messageService, collects response text via callback |
| `postChatWithRetries()` | Same file | Helper: sends message via REST API with retry logic |
| PGLite runtime helper | `eliza/packages/app-core/test/helpers/pglite-runtime.ts` | Creates real AgentRuntime with in-process PGLite |
| Real runtime helper | `eliza/packages/app-core/test/helpers/real-runtime.ts` | Extends PGLite with optional real LLM + connectors |
| Live provider selector | `test/helpers/live-provider.ts` | Picks cheapest available LLM provider (Groq > OpenAI > Anthropic > etc.) |
| Conditional tests | `test/helpers/conditional-tests.ts` | `itIf()` for gating tests on env vars/API keys |
| Action unit tests | `eliza/packages/typescript/src/__tests__/actions.test.ts` | Action formatting, example parsing, param extraction — no real LLM |
| Context routing tests | `eliza/packages/typescript/src/__tests__/context-routing.test.ts` | Action filtering by context — mocked runtime |
| Callback history tests | `eliza/packages/agent/src/api/conversation-routes.test.ts` | Action callback dedup, formatting, memory persistence |
| Vitest configs | `test/vitest/*.config.ts` | 7 configs: default, integration, e2e, real, live-e2e, real-qa, unit |
| CI workflow | `.github/workflows/test.yml` | regression-matrix, unit-tests, db-check, desktop-contract, cloud-live-e2e, validation-e2e, ui-playwright-smoke |

### What DOES NOT EXIST (Gaps)

| Gap | Impact |
|-----|--------|
| **No action invocation verification in E2E tests** | We test that the agent responds with text, but never verify it chose and executed the correct action |
| **No `expectActionCalled()` helper** | No reusable assertion for "agent invoked action X with params Y" |
| **No conversation scenario tests** | No tests like "user asks to schedule a meeting → agent calls SCHEDULE action with correct params" |
| **No action selection accuracy benchmarks** | No way to measure if the agent picks the right action N% of the time |
| **No action parameter extraction tests in E2E** | We test XML param parsing in unit tests but never verify the full pipeline extracts correct params from natural language |
| **No multi-action chain tests** | No tests for "user asks complex task → agent chains actions A, B, C in correct order" |
| **No negative action tests** | No tests for "user says X → agent should NOT call action Y" |
| **No action timeout/failure recovery tests** | No tests for what happens when an action fails mid-execution |

### How Action Invocation CAN Be Verified (Existing Mechanisms)

The runtime already provides multiple verification surfaces — they just aren't used in tests:

1. **`runtime.getActionResults(messageId)`** — Returns `ActionResult[]` from in-memory cache
2. **Database memories** — `type: "action_result"`, `content.actionName`, `content.actionStatus`
3. **Database logs** — `type: "action_event"` with `ActionLogBody`
4. **Events** — `ACTION_STARTED` / `ACTION_COMPLETED` with actionName, runId, success status
5. **Callback history** — `Memory.content.actionCallbackHistory` for streaming actions
6. **State cache** — `stateCache[messageId + "_action_results"]` holds full results + plan

---

## PRD: E2E Action Verification Test Framework

### Problem Statement

Milady is being built as a comprehensive personal assistant with dozens of actions (scheduling, messaging, reminders, to-dos, relationship tracking, browser control, etc.). We have no way to verify in E2E tests that the agent actually invokes the correct action when a user asks it to do something. We can only verify that the agent produced text output — not that it took the right action.

This means:
- We ship action-dependent features (LifeOps reminders, scheduling, message triage) with zero confidence they work end-to-end
- Regressions in action selection go undetected
- LLM prompt changes can silently break action routing
- We can't benchmark action selection accuracy across model providers

### Goals

1. **Verify action invocation**: Given a user message, assert that the agent called a specific action (or set of actions)
2. **Verify action parameters**: Assert that extracted parameters match expectations
3. **Verify action results**: Assert that action execution produced expected outcomes
4. **Support scenario testing**: Multi-turn conversations that exercise action chains
5. **Support negative testing**: Verify the agent does NOT call certain actions
6. **Enable benchmarking**: Measure action selection accuracy across providers/prompts
7. **Run in CI**: Tests must work with real LLM (Groq for cost) and PGLite

### Non-Goals

- UI testing (covered by Playwright)
- Action handler unit testing (already exists)
- Mock-based action testing (against project philosophy)
- Testing every possible user utterance (use benchmarks for that)

---

## Implementation Plan

### Phase 1: Action Assertion Helpers

**Files to create/modify:**

#### 1.1 `test/helpers/action-assertions.ts` (NEW)

Core assertion utilities that leverage existing runtime mechanisms:

```typescript
import type { AgentRuntime, UUID, ActionResult, Memory } from "@elizaos/core";

export interface ActionInvocation {
  actionName: string;
  actionStatus: "success" | "failed" | string;
  params?: Record<string, unknown>;
  result?: ActionResult;
  runId?: string;
  timestamp?: number;
}

/**
 * After handleMessage completes, query the runtime for action invocations
 * that occurred during processing of the given message.
 */
export async function getActionInvocations(
  runtime: AgentRuntime,
  roomId: UUID,
  sinceTimestamp: number,
): Promise<ActionInvocation[]> {
  // Query action_result memories created after sinceTimestamp
  const memories = await runtime.getMemories({
    roomId,
    tableName: "messages",
    count: 50,
  });

  return memories
    .filter(
      (m) =>
        m.content.type === "action_result" &&
        m.content.actionName &&
        (m.createdAt ?? 0) >= sinceTimestamp,
    )
    .map((m) => ({
      actionName: m.content.actionName as string,
      actionStatus: (m.content.actionStatus as string) ?? "unknown",
      params: m.content.data as Record<string, unknown> | undefined,
      runId: m.content.runId as string | undefined,
      timestamp: m.createdAt,
    }));
}

/**
 * Assert that a specific action was called during message processing.
 */
export function expectActionCalled(
  invocations: ActionInvocation[],
  actionName: string,
  opts?: {
    status?: "success" | "failed";
    params?: Record<string, unknown>;
  },
): ActionInvocation {
  const normalized = actionName.trim().toUpperCase().replace(/_/g, "");
  const match = invocations.find(
    (inv) => inv.actionName.trim().toUpperCase().replace(/_/g, "") === normalized,
  );

  if (!match) {
    const called = invocations.map((i) => i.actionName).join(", ") || "(none)";
    throw new Error(
      `Expected action "${actionName}" to be called, but only these were: ${called}`,
    );
  }

  if (opts?.status) {
    expect(match.actionStatus).toBe(opts.status);
  }

  if (opts?.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      expect(match.params?.[key]).toEqual(value);
    }
  }

  return match;
}

/**
 * Assert that a specific action was NOT called.
 */
export function expectActionNotCalled(
  invocations: ActionInvocation[],
  actionName: string,
): void {
  const normalized = actionName.trim().toUpperCase().replace(/_/g, "");
  const match = invocations.find(
    (inv) => inv.actionName.trim().toUpperCase().replace(/_/g, "") === normalized,
  );

  if (match) {
    throw new Error(
      `Expected action "${actionName}" NOT to be called, but it was (status: ${match.actionStatus})`,
    );
  }
}

/**
 * Assert that actions were called in a specific order.
 */
export function expectActionOrder(
  invocations: ActionInvocation[],
  actionNames: string[],
): void {
  const sorted = [...invocations].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );
  const actualNames = sorted.map((i) =>
    i.actionName.trim().toUpperCase().replace(/_/g, ""),
  );
  const expectedNames = actionNames.map((n) =>
    n.trim().toUpperCase().replace(/_/g, ""),
  );

  for (let i = 0; i < expectedNames.length; i++) {
    const idx = actualNames.indexOf(expectedNames[i]);
    if (idx === -1) {
      throw new Error(
        `Expected action "${actionNames[i]}" in sequence but it was not called`,
      );
    }
    if (i > 0) {
      const prevIdx = actualNames.indexOf(expectedNames[i - 1]);
      if (idx <= prevIdx) {
        throw new Error(
          `Expected "${actionNames[i]}" after "${actionNames[i - 1]}" but order was wrong`,
        );
      }
    }
  }
}
```

#### 1.2 `test/helpers/conversation-harness.ts` (NEW)

Higher-level harness for multi-turn conversation testing:

```typescript
import type { AgentRuntime, UUID } from "@elizaos/core";
import { createMessageMemory, ChannelType, stringToUuid } from "@elizaos/core";
import crypto from "node:crypto";
import { getActionInvocations, type ActionInvocation } from "./action-assertions";
import { withTimeout } from "./test-utils";

export interface ConversationTurn {
  text: string;
  responseText: string;
  actions: ActionInvocation[];
  timestamp: number;
}

export class ConversationHarness {
  private runtime: AgentRuntime;
  private roomId: UUID;
  private userId: UUID;
  private worldId: UUID;
  private turns: ConversationTurn[] = [];

  constructor(
    runtime: AgentRuntime,
    opts?: { roomId?: UUID; userId?: UUID; worldId?: UUID },
  ) {
    this.runtime = runtime;
    this.roomId = opts?.roomId ?? (crypto.randomUUID() as UUID);
    this.userId = opts?.userId ?? (crypto.randomUUID() as UUID);
    this.worldId = opts?.worldId ?? stringToUuid("test-world");
  }

  async setup(): Promise<void> {
    await this.runtime.ensureConnection({
      entityId: this.userId,
      roomId: this.roomId,
      worldId: this.worldId,
      userName: "TestUser",
      source: "test",
      channelId: this.roomId,
      type: ChannelType.DM,
    });
  }

  async send(
    text: string,
    opts?: { timeoutMs?: number },
  ): Promise<ConversationTurn> {
    const beforeTimestamp = Date.now();
    let responseText = "";

    const msg = createMessageMemory({
      id: crypto.randomUUID() as UUID,
      entityId: this.userId,
      roomId: this.roomId,
      content: {
        text,
        source: "test",
        channelType: ChannelType.DM,
      },
    });

    const result = await withTimeout(
      Promise.resolve(
        this.runtime.messageService?.handleMessage(
          this.runtime,
          msg,
          async (content: { text?: string }) => {
            if (content.text) responseText += content.text;
            return [];
          },
        ),
      ),
      opts?.timeoutMs ?? 90_000,
      "handleMessage",
    );

    if (!responseText && result?.responseContent?.text) {
      responseText = result.responseContent.text;
    }

    // Give a moment for action memories to persist
    await new Promise((r) => setTimeout(r, 500));

    const actions = await getActionInvocations(
      this.runtime,
      this.roomId,
      beforeTimestamp,
    );

    const turn: ConversationTurn = {
      text,
      responseText,
      actions,
      timestamp: beforeTimestamp,
    };

    this.turns.push(turn);
    return turn;
  }

  getTurns(): ConversationTurn[] {
    return this.turns;
  }

  getLastTurn(): ConversationTurn | undefined {
    return this.turns[this.turns.length - 1];
  }
}
```

### Phase 2: Action Scenario Test Suite

**File:** `eliza/packages/app-core/test/live-agent/action-invocation.live.e2e.test.ts` (NEW)

This test suite verifies that the agent correctly selects and executes actions in response to natural language:

```typescript
// Test structure (pseudocode for PRD purposes):

describe("Action Invocation E2E", () => {
  // Shared runtime setup (same pattern as agent-runtime.live.e2e.test.ts)

  describe("action selection", () => {
    it("personality update triggers MODIFY_CHARACTER action", async () => {
      const turn = await convo.send("Change your personality to be more concise");
      expectActionCalled(turn.actions, "MODIFY_CHARACTER", { status: "success" });
    });

    it("asking a question does NOT trigger any action", async () => {
      const turn = await convo.send("What is the capital of France?");
      expect(turn.actions).toHaveLength(0);
      expect(turn.responseText.length).toBeGreaterThan(0);
    });
  });

  describe("multi-turn action chains", () => {
    it("follow-up message references prior action context", async () => {
      await convo.send("Create a todo called 'Test PRD review'");
      const turn2 = await convo.send("Mark that todo as high priority");
      // Both turns should have invoked todo-related actions
    });
  });

  describe("action parameter extraction", () => {
    it("extracts contact name from natural language", async () => {
      const turn = await convo.send("Add John Smith to my contacts");
      expectActionCalled(turn.actions, "ADD_CONTACT", { status: "success" });
      // Verify params include extracted name
    });
  });

  describe("negative cases", () => {
    it("does not call SEND_MESSAGE for a simple greeting", async () => {
      const turn = await convo.send("Hey, how are you?");
      expectActionNotCalled(turn.actions, "SEND_MESSAGE");
    });
  });
});
```

### Phase 3: Event-Based Action Spy

For cases where database persistence is slow or unreliable, add an event-based spy:

**File:** `test/helpers/action-spy.ts` (NEW)

```typescript
import type { AgentRuntime } from "@elizaos/core";

export interface SpiedAction {
  name: string;
  status: "started" | "completed";
  success?: boolean;
  timestamp: number;
  runId?: string;
  data?: unknown;
}

export class ActionSpy {
  private actions: SpiedAction[] = [];
  private cleanup: (() => void) | null = null;

  attach(runtime: AgentRuntime): void {
    // Subscribe to ACTION_STARTED and ACTION_COMPLETED events
    const onStarted = (payload: unknown) => {
      this.actions.push({
        name: extractActionName(payload),
        status: "started",
        timestamp: Date.now(),
        runId: extractRunId(payload),
      });
    };

    const onCompleted = (payload: unknown) => {
      this.actions.push({
        name: extractActionName(payload),
        status: "completed",
        success: extractSuccess(payload),
        timestamp: Date.now(),
        runId: extractRunId(payload),
        data: extractData(payload),
      });
    };

    runtime.on("ACTION_STARTED", onStarted);
    runtime.on("ACTION_COMPLETED", onCompleted);

    this.cleanup = () => {
      runtime.off("ACTION_STARTED", onStarted);
      runtime.off("ACTION_COMPLETED", onCompleted);
    };
  }

  detach(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  clear(): void {
    this.actions = [];
  }

  getActions(): SpiedAction[] {
    return [...this.actions];
  }

  getCompletedActions(): SpiedAction[] {
    return this.actions.filter((a) => a.status === "completed");
  }

  wasActionCalled(name: string): boolean {
    const normalized = name.trim().toUpperCase().replace(/_/g, "");
    return this.actions.some(
      (a) =>
        a.status === "completed" &&
        a.name.trim().toUpperCase().replace(/_/g, "") === normalized,
    );
  }
}
```

### Phase 4: Benchmarking & Eval Framework

For measuring action selection accuracy at scale (not per-commit CI, but periodic eval):

**File:** `test/benchmarks/action-selection-benchmark.ts` (NEW)

```typescript
interface ActionBenchmarkCase {
  id: string;
  userMessage: string;
  expectedAction: string | null; // null = no action expected
  expectedParams?: Record<string, unknown>;
  tags: string[]; // e.g., ["scheduling", "critical", "regression"]
}

const BENCHMARK_CASES: ActionBenchmarkCase[] = [
  {
    id: "schedule-meeting-basic",
    userMessage: "Schedule a meeting with John tomorrow at 3pm",
    expectedAction: "SCHEDULE_MEETING",
    expectedParams: { contactName: "John" },
    tags: ["scheduling", "critical"],
  },
  {
    id: "greeting-no-action",
    userMessage: "Hey, good morning!",
    expectedAction: null,
    tags: ["negative", "basic"],
  },
  {
    id: "todo-create",
    userMessage: "Add 'buy groceries' to my to-do list",
    expectedAction: "CREATE_TODO",
    tags: ["todos", "critical"],
  },
  // ... many more cases covering LifeOps features
];

// Runner produces accuracy report:
// - Overall accuracy: N%
// - Per-tag accuracy: scheduling=85%, todos=92%, ...
// - Failures: list of cases where wrong action was chosen
// - Latency: avg/p50/p95 per action selection
```

### Phase 5: Plugin-Specific Action Tests

For each major feature area from the recordings, add targeted action tests:

| Feature Area | Actions to Test | Priority |
|-------------|----------------|----------|
| **To-Do Management** | CREATE_TODO, UPDATE_TODO, COMPLETE_TODO, LIST_TODOS | P0 |
| **Reminders** | SET_REMINDER, LIST_REMINDERS, CLEAR_REMINDER | P0 |
| **Personality** | MODIFY_CHARACTER, UPDATE_RESPONSE_STYLE | P0 (exists partially) |
| **Contacts/Rolodex** | ADD_CONTACT, SEARCH_CONTACTS | P1 |
| **Messaging** | SEND_MESSAGE, DRAFT_MESSAGE, TRIAGE_MESSAGES | P1 |
| **Calendar** | SCHEDULE_MEETING, CHECK_CALENDAR, CANCEL_MEETING | P1 |
| **LifeOps Routines** | SET_ROUTINE, CHECK_ROUTINE, MORNING_CHECKIN | P2 |
| **Browser/Computer** | BROWSE_URL, COMPUTER_ACTION | P2 |
| **Social Media** | SEARCH_X, SUMMARIZE_FEED, SEND_DM | P3 |

---

## Execution Plan

### Sprint 1 (Week 1-2): Foundation
1. Create `test/helpers/action-assertions.ts`
2. Create `test/helpers/conversation-harness.ts`
3. Create `test/helpers/action-spy.ts`
4. Write 5 basic action invocation tests using existing actions (MODIFY_CHARACTER, ADD_CONTACT, etc.)
5. Verify tests pass with Groq in CI

### Sprint 2 (Week 3-4): Coverage
1. Add 15+ action scenario tests covering all P0 features
2. Add multi-turn conversation tests
3. Add negative case tests
4. Add action parameter extraction verification
5. Update CI workflow to include action-invocation tests

### Sprint 3 (Week 5-6): Benchmarking
1. Create benchmark case library (50+ cases)
2. Build benchmark runner with accuracy reporting
3. Run baseline benchmarks across Groq/OpenAI/Anthropic
4. Set up nightly benchmark runs
5. Add benchmark results to PR comments

### Sprint 4 (Week 7-8): LifeOps-Specific
1. Add LifeOps action tests (reminders, routines, tracking)
2. Add scheduling/calendar action tests
3. Add messaging triage action tests
4. Add multi-device scenario tests (simulated)
5. Integration with the features described in recordings

---

## Test Configuration

### Vitest Config Addition

Add to `test/vitest/e2e.config.ts`:
```typescript
// Action invocation tests (subset of live-e2e)
// Include: *.action.live.e2e.test.ts
```

### CI Additions

Add to `.github/workflows/test.yml`:
```yaml
action-e2e:
  name: "Action Invocation E2E"
  needs: [regression-matrix]
  timeout-minutes: 30
  env:
    MILADY_LIVE_TEST: "1"
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
  steps:
    - run: bun run test:e2e:actions
```

### New npm scripts

```json
{
  "test:e2e:actions": "vitest run --config test/vitest/e2e.config.ts --testPathPattern action-invocation",
  "test:benchmark:actions": "vitest run --config test/vitest/real.config.ts --testPathPattern action-selection-benchmark"
}
```

---

## Success Criteria

1. **Action assertion helpers** are reusable and tested
2. **20+ action scenario tests** pass in CI with Groq
3. **Conversation harness** supports multi-turn with action tracking
4. **Negative tests** verify the agent doesn't call wrong actions
5. **Benchmark framework** produces accuracy reports
6. **CI integration** catches action selection regressions on every PR
7. **Documentation** covers how to add new action tests

## Risk Factors

| Risk | Mitigation |
|------|-----------|
| LLM non-determinism | Use retry logic, accept fuzzy matches, run benchmarks with statistical thresholds |
| Groq rate limits | Use `selectLiveProvider()` fallback chain, add backoff |
| Slow tests | Parallelize independent scenarios, share runtime (PGLite constraint) |
| Actions not registered | Pre-check `runtime.actions` in beforeAll, skip if missing |
| Action param formats change | Use flexible matching, not exact equality |
