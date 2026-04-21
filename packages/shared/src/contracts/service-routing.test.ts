import { describe, expect, it } from "vitest";

import {
  buildDefaultElizaCloudServiceRouting,
  buildElizaCloudServiceRoute,
  normalizeServiceRouteConfig,
  normalizeServiceRoutingConfig,
} from "./service-routing.js";

describe("service routing", () => {
  it("preserves per-step llm model overrides when normalizing a route", () => {
    expect(
      normalizeServiceRouteConfig({
        backend: "elizacloud",
        transport: "cloud-proxy",
        shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
        plannerModel: "google/gemini-2.5-flash-ft-plan",
        responseModel: "anthropic/claude-sonnet-4.6",
        mediaDescriptionModel: "google/gemini-2.5-flash-lite-ft-media",
      }),
    ).toEqual({
      backend: "elizacloud",
      transport: "cloud-proxy",
      shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
      plannerModel: "google/gemini-2.5-flash-ft-plan",
      responseModel: "anthropic/claude-sonnet-4.6",
      mediaDescriptionModel: "google/gemini-2.5-flash-lite-ft-media",
    });
  });

  it("preserves per-step llm model overrides inside serviceRouting.llmText", () => {
    expect(
      normalizeServiceRoutingConfig({
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          nanoModel: "google/gemini-2.5-flash-lite-nano-ft",
          smallModel: "google/gemini-2.5-flash-lite",
          mediumModel: "google/gemini-2.5-flash-ft-medium",
          largeModel: "google/gemini-2.5-flash",
          megaModel: "google/gemini-2.5-pro-ft",
          shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
          plannerModel: "google/gemini-2.5-flash-ft-plan",
          responseModel: "google/gemini-2.5-flash-ft-response",
        },
      }),
    ).toEqual({
      llmText: {
        backend: "elizacloud",
        transport: "cloud-proxy",
        nanoModel: "google/gemini-2.5-flash-lite-nano-ft",
        smallModel: "google/gemini-2.5-flash-lite",
        mediumModel: "google/gemini-2.5-flash-ft-medium",
        largeModel: "google/gemini-2.5-flash",
        megaModel: "google/gemini-2.5-pro-ft",
        shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
        plannerModel: "google/gemini-2.5-flash-ft-plan",
        responseModel: "google/gemini-2.5-flash-ft-response",
      },
    });
  });

  it("builds elizacloud routes with per-step model defaults", () => {
    expect(
      buildElizaCloudServiceRoute({
        nanoModel: "google/gemini-2.5-flash-lite-nano-ft",
        smallModel: "google/gemini-2.5-flash-lite",
        mediumModel: "google/gemini-2.5-flash-ft-medium",
        largeModel: "google/gemini-2.5-flash",
        megaModel: "google/gemini-2.5-pro-ft",
        shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
        plannerModel: "google/gemini-2.5-flash-ft-plan",
        responseModel: "google/gemini-2.5-flash-ft-response",
        mediaDescriptionModel: "google/gemini-2.5-flash-lite-ft-media",
      }),
    ).toEqual({
      backend: "elizacloud",
      transport: "cloud-proxy",
      accountId: "elizacloud",
      nanoModel: "google/gemini-2.5-flash-lite-nano-ft",
      smallModel: "google/gemini-2.5-flash-lite",
      mediumModel: "google/gemini-2.5-flash-ft-medium",
      largeModel: "google/gemini-2.5-flash",
      megaModel: "google/gemini-2.5-pro-ft",
      shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
      plannerModel: "google/gemini-2.5-flash-ft-plan",
      responseModel: "google/gemini-2.5-flash-ft-response",
      mediaDescriptionModel: "google/gemini-2.5-flash-lite-ft-media",
    });
  });

  it("propagates per-step model defaults when building cloud routing", () => {
    expect(
      buildDefaultElizaCloudServiceRouting({
        includeInference: true,
        mediumModel: "google/gemini-2.5-flash-ft-medium",
        shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
        plannerModel: "google/gemini-2.5-flash-ft-plan",
      }),
    ).toMatchObject({
      llmText: {
        mediumModel: "google/gemini-2.5-flash-ft-medium",
        shouldRespondModel: "google/gemini-2.5-flash-lite-ft-should",
        plannerModel: "google/gemini-2.5-flash-ft-plan",
      },
    });
  });

  it("preserves response-handler and action-planner aliases", () => {
    expect(
      normalizeServiceRouteConfig({
        backend: "elizacloud",
        transport: "cloud-proxy",
        responseHandlerModel: "google/gemini-2.5-flash-lite-ft-should",
        actionPlannerModel: "google/gemini-2.5-flash-ft-plan",
      }),
    ).toEqual({
      backend: "elizacloud",
      transport: "cloud-proxy",
      responseHandlerModel: "google/gemini-2.5-flash-lite-ft-should",
      actionPlannerModel: "google/gemini-2.5-flash-ft-plan",
    });
  });
});
