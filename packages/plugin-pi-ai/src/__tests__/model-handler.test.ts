import { describe, expect, it } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
  createPiAiImageDescriptionHandler,
  validatePublicImageUrl,
} from "../model-handler.ts";

describe("validatePublicImageUrl", () => {
  it("rejects non-https urls", async () => {
    await expect(
      validatePublicImageUrl("http://example.com/image.png"),
    ).rejects.toThrow("must use https://");
  });

  it("rejects localhost", async () => {
    await expect(
      validatePublicImageUrl("https://localhost/image.png"),
    ).rejects.toThrow("blocked host");
  });

  it("rejects private ip ranges", async () => {
    await expect(
      validatePublicImageUrl("https://192.168.1.9/image.png"),
    ).rejects.toThrow("blocked host");
  });

  it("rejects ipv4-mapped ipv6 private addresses", async () => {
    await expect(
      validatePublicImageUrl("https://[::ffff:127.0.0.1]/image.png"),
    ).rejects.toThrow("blocked host");
  });

  it("rejects malformed urls", async () => {
    await expect(validatePublicImageUrl("not-a-url")).rejects.toThrow(
      "valid absolute URL",
    );
  });

  it("accepts public ip literal urls", async () => {
    const parsed = await validatePublicImageUrl("https://1.1.1.1/image.png");
    expect(parsed.hostname).toBe("1.1.1.1");
  });

  it("rejects hostnames resolving to private addresses", async () => {
    await expect(
      validatePublicImageUrl("https://cdn.example.com/image.png", {
        dnsLookupFn: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toThrow("resolving to 127.0.0.1");
  });
});

describe("createPiAiImageDescriptionHandler", () => {
  const runtime = {} as IAgentRuntime;
  const model = { provider: "anthropic", id: "claude-sonnet" } as Model<Api>;

  it("follows redirects and returns analyzed description", async () => {
    const calls: string[] = [];
    const handler = createPiAiImageDescriptionHandler(
      () => model,
      {},
      {
        fetchImpl: async (url: string | URL) => {
          const asString = String(url);
          calls.push(asString);
          if (asString.includes("redirect.example")) {
            return new Response(null, {
              status: 302,
              headers: { location: "https://cdn.example/final.png" },
            });
          }

          return new Response(Buffer.from("small-image"), {
            status: 200,
            headers: {
              "content-type": "image/png",
              "content-length": "11",
            },
          });
        },
        dnsLookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
        streamImpl: async function* () {
          yield { type: "text_delta", delta: "Looks like a test image." };
          yield {
            type: "done",
            reason: "stop",
            message: { usage: { input: 1, output: 1, totalTokens: 2 } },
          };
        },
      },
    );

    const result = (await handler(runtime, {
      imageUrl: "https://redirect.example/image.png",
    })) as { description: string };

    expect(calls).toEqual([
      "https://redirect.example/image.png",
      "https://cdn.example/final.png",
    ]);
    expect(result.description).toContain("test image");
  });

  it("rejects oversized images via content-length", async () => {
    const handler = createPiAiImageDescriptionHandler(
      () => model,
      {},
      {
        maxImageBytes: 8,
        fetchImpl: async () =>
          new Response(null, {
            status: 200,
            headers: {
              "content-type": "image/png",
              "content-length": "1024",
            },
          }),
        dnsLookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
        streamImpl: async function* () {
          yield { type: "text_delta", delta: "unused" };
        },
      },
    );

    await expect(
      handler(runtime, { imageUrl: "https://cdn.example/image.png" }),
    ).rejects.toThrow("Image too large");
  });

  it("rejects non-image content type", async () => {
    const handler = createPiAiImageDescriptionHandler(
      () => model,
      {},
      {
        fetchImpl: async () =>
          new Response("not an image", {
            status: 200,
            headers: {
              "content-type": "text/html",
              "content-length": "12",
            },
          }),
        dnsLookupFn: async () => [{ address: "93.184.216.34", family: 4 }],
        streamImpl: async function* () {
          yield { type: "text_delta", delta: "unused" };
        },
      },
    );

    await expect(
      handler(runtime, { imageUrl: "https://cdn.example/image.png" }),
    ).rejects.toThrow("Invalid content-type");
  });

  it("rejects dns-rebinding style private resolution", async () => {
    const handler = createPiAiImageDescriptionHandler(
      () => model,
      {},
      {
        fetchImpl: async () =>
          new Response(Buffer.from("image"), {
            status: 200,
            headers: { "content-type": "image/png", "content-length": "5" },
          }),
        dnsLookupFn: async () => [{ address: "10.0.0.2", family: 4 }],
        streamImpl: async function* () {
          yield { type: "text_delta", delta: "unused" };
        },
      },
    );

    await expect(
      handler(runtime, { imageUrl: "https://rebind.example/image.png" }),
    ).rejects.toThrow("blocked host");
  });
});
