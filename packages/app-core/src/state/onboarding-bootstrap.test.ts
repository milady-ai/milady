import { describe, expect, it, vi } from "vitest";
import {
  deriveDetectedProviderPrefill,
  detectExistingOnboardingConnection,
} from "./onboarding-bootstrap";

describe("detectExistingOnboardingConnection", () => {
  it("returns null when no API endpoint is available", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: false,
          getOnboardingStatus: vi.fn(),
          getConfig: vi.fn(),
        },
        timeoutMs: 5,
      }),
    ).resolves.toBeNull();
  });

  it("adopts the local connection when onboarding is already complete", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: true,
          getOnboardingStatus: vi.fn(async () => ({ complete: true })),
          getConfig: vi.fn(),
        },
        timeoutMs: 50,
      }),
    ).resolves.toEqual({
      activeServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      detectedExistingInstall: true,
    });
  });

  it("adopts the local connection when saved config can be resumed", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: true,
          getOnboardingStatus: vi.fn(async () => ({ complete: false })),
          getConfig: vi.fn(async () => ({
            env: {
              vars: {
                OPENROUTER_API_KEY: "sk-or-test",
              },
            },
          })),
        },
        timeoutMs: 50,
      }),
    ).resolves.toEqual({
      activeServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      detectedExistingInstall: true,
    });
  });

  it("adopts the local connection when legacy agent workspace state exists", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: true,
          getOnboardingStatus: vi.fn(async () => ({ complete: false })),
          getConfig: vi.fn(async () => ({
            agents: {
              defaults: {
                workspace: "/Users/test/.eliza/agents/main",
              },
            },
          })),
        },
        timeoutMs: 50,
      }),
    ).resolves.toEqual({
      activeServer: {
        id: "local:embedded",
        kind: "local",
        label: "This device",
      },
      detectedExistingInstall: true,
    });
  });

  it("falls back to static onboarding when no reusable setup is found", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: true,
          getOnboardingStatus: vi.fn(async () => ({ complete: false })),
          getConfig: vi.fn(async () => ({})),
        },
        timeoutMs: 50,
      }),
    ).resolves.toBeNull();
  });

  it("times out instead of blocking first-run onboarding", async () => {
    await expect(
      detectExistingOnboardingConnection({
        client: {
          apiAvailable: true,
          getOnboardingStatus: vi.fn(
            () => new Promise<{ complete: boolean }>(() => {}),
          ),
          getConfig: vi.fn(),
        },
        timeoutMs: 1,
      }),
    ).resolves.toBeNull();
  });
});

describe("deriveDetectedProviderPrefill", () => {
  it("prefills the first detected provider with a usable api key", () => {
    expect(
      deriveDetectedProviderPrefill([
        { id: "pi-ai" },
        { id: "openrouter", apiKey: " sk-or-test " },
      ]),
    ).toEqual({
      serverTarget: "local",
      providerId: "openrouter",
      apiKey: "sk-or-test",
    });
  });

  it("returns null when no detected provider includes an api key", () => {
    expect(
      deriveDetectedProviderPrefill([
        { id: "pi-ai" },
        { id: "openrouter", apiKey: "   " },
      ]),
    ).toBeNull();
  });
});
