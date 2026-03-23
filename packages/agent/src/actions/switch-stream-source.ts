/**
 * SWITCH_STREAM_SOURCE action — changes the content being captured and streamed.
 *
 * When triggered the action:
 *   1. Validates the requested sourceType against the allowed set
 *   2. Requires customUrl when sourceType is "custom-url"
 *   3. POSTs to the local API to apply the new stream source
 *
 * All stream-switching logic is handled server-side — this action is a
 * thin wrapper that validates inputs and forwards the request.
 *
 * @module actions/switch-stream-source
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for the stream source endpoint. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

const VALID_SOURCE_TYPES = ["stream-tab", "game", "custom-url"] as const;
type ValidSourceType = (typeof VALID_SOURCE_TYPES)[number];

export const switchStreamSourceAction: Action = {
  name: "SWITCH_STREAM_SOURCE",

  similes: ["CHANGE_STREAM", "STREAM_GAME", "STREAM_URL", "SET_STREAM_SOURCE"],

  description:
    "Switches what content is being captured and streamed. " +
    'Use "stream-tab" to capture the stream browser tab, "game" to capture a game window, ' +
    'or "custom-url" to stream from a specific URL.',

  validate: async () => true,

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters as {
      sourceType?: string;
      customUrl?: string;
    } | undefined;

    const sourceType = params?.sourceType?.trim() as ValidSourceType | undefined;
    if (!sourceType || !VALID_SOURCE_TYPES.includes(sourceType)) {
      throw new Error(`Invalid sourceType. Must be one of: ${VALID_SOURCE_TYPES.join(", ")}.`);
    }

    const customUrl = params?.customUrl?.trim();
    if (sourceType === "custom-url" && !customUrl) {
      throw new Error('customUrl is required when sourceType is "custom-url".');
    }

    const response = await fetch(`http://127.0.0.1:${API_PORT}/api/stream/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType, customUrl }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to switch stream source (HTTP ${response.status}).`);
    }

    const label = sourceType === "custom-url" ? `${sourceType} (${customUrl})` : sourceType;
    return {
      text: `Switched stream source to ${label}.`,
      success: true,
    };
  },

  parameters: [
    {
      name: "sourceType",
      description:
        'The stream source type to switch to: "stream-tab", "game", or "custom-url".',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "customUrl",
      description:
        'The URL to stream from. Required when sourceType is "custom-url".',
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
