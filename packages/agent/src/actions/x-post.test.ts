import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postToXAction } from "./x-post";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function makeMessage(text: string) {
  return {
    content: { text },
  } as never;
}

async function callHandler(text: string, params?: Record<string, unknown>) {
  return postToXAction.handler?.(
    {} as never,
    makeMessage(text),
    {} as never,
    params ? ({ parameters: params } as never) : undefined,
  );
}

describe("postToXAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TWITTER_DRY_RUN;
    delete process.env.TWITTER_API_KEY;
    delete process.env.TWITTER_API_SECRET_KEY;
    delete process.env.TWITTER_ACCESS_TOKEN;
    delete process.env.TWITTER_ACCESS_TOKEN_SECRET;
    globalThis.fetch = ORIGINAL_FETCH;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("validates explicit X/Twitter posting intents only when API route is usable", async () => {
    await expect(
      postToXAction.validate?.({} as never, makeMessage("post to x hello")),
    ).resolves.toBe(false);

    process.env.TWITTER_DRY_RUN = "true";
    await expect(
      postToXAction.validate?.({} as never, makeMessage("post to x hello")),
    ).resolves.toBe(true);

    process.env.TWITTER_DRY_RUN = "false";
    await expect(
      postToXAction.validate?.({} as never, makeMessage("hello botdick")),
    ).resolves.toBe(false);
  });

  it("supports dry runs without credentials", async () => {
    process.env.TWITTER_DRY_RUN = "true";

    const result = await callHandler("post to x hello world");

    expect(result).toMatchObject({
      success: true,
      values: { dryRun: true },
    });
    expect(result?.text).toContain("would post \"hello world\"");
  });

  it("reports missing credentials when dry run is off", async () => {
    process.env.TWITTER_DRY_RUN = "false";

    const result = await callHandler("post to x hello world");

    expect(result).toMatchObject({
      success: false,
      values: { error: "MISSING_CREDENTIALS" },
    });
    expect(result?.text).toContain("TWITTER_API_KEY");
  });

  it("posts with credentials and returns the X status URL", async () => {
    process.env.TWITTER_DRY_RUN = "false";
    process.env.TWITTER_API_KEY = "key";
    process.env.TWITTER_API_SECRET_KEY = "secret";
    process.env.TWITTER_ACCESS_TOKEN = "token";
    process.env.TWITTER_ACCESS_TOKEN_SECRET = "token-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: "123" } }),
    });
    globalThis.fetch = fetchMock as never;

    const result = await callHandler("tweet this", { text: "live test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twitter.com/2/tweets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "live test" }),
      }),
    );
    expect(result).toMatchObject({
      success: true,
      values: {
        postId: "123",
        url: "https://x.com/i/web/status/123",
      },
    });
  });
});
