import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishHomepageContentAction } from "./publish-homepage";

const ORIGINAL_ENV = { ...process.env };

function makeMessage(text: string) {
  return {
    content: { text },
  } as never;
}

function readContent(file: string) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/window\.BOTDICK_CONTENT\s*=\s*([\s\S]*?)\s*;?\s*$/);
  if (!match?.[1]) throw new Error("bad content file");
  return JSON.parse(match[1]);
}

function setupHomepage() {
  const dir = mkdtempSync(join(tmpdir(), "botdick-homepage-"));
  const contentPath = join(dir, "content.js");
  writeFileSync(
    contentPath,
    `window.BOTDICK_CONTENT = ${JSON.stringify({
      thoughts: [],
      posts: [],
      projects: [],
    })};\n`,
  );
  process.env.BOTDICK_HOMEPAGE_DIR = dir;
  return { dir, contentPath };
}

async function callHandler(params: Record<string, unknown>) {
  return publishHomepageContentAction.handler?.(
    {} as never,
    makeMessage("publish this on botdick homepage"),
    {} as never,
    { parameters: params } as never,
  );
}

describe("publishHomepageContentAction", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("appends a blog post to homepage content", async () => {
    const { contentPath } = setupHomepage();

    const result = await callHandler({
      kind: "post",
      title: "first real post",
      body: "this is the body",
      tag: "log",
      date: "2026-04-29",
    });

    expect(result).toMatchObject({
      success: true,
      values: { kind: "post", deployed: false },
    });
    expect(readContent(contentPath).posts[0]).toMatchObject({
      tag: "log",
      date: "2026-04-29",
      title: "first real post",
      body: "this is the body",
    });
  });

  it("appends an empty-homepage project link", async () => {
    const { contentPath } = setupHomepage();

    const result = await callHandler({
      kind: "project",
      title: "tiny site",
      url: "https://botdick-project.pages.dev",
    });

    expect(result).toMatchObject({
      success: true,
      values: { kind: "project", deployed: false },
    });
    expect(readContent(contentPath).projects[0]).toMatchObject({
      title: "tiny site",
      url: "https://botdick-project.pages.dev",
    });
  });

  it("requires project urls", async () => {
    setupHomepage();

    const result = await callHandler({
      kind: "project",
      title: "missing url",
    });

    expect(result).toMatchObject({
      success: false,
      values: { error: "MISSING_URL" },
    });
  });
});
