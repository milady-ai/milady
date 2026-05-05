import type {
  Action,
  ActionResult,
  HandlerOptions,
  Memory,
} from "@elizaos/core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

type PublishKind = "thought" | "post" | "project";

type PublishHomepageParams = {
  kind?: PublishKind;
  title?: string;
  body?: string;
  text?: string;
  tag?: string;
  date?: string;
  time?: string;
  url?: string;
  deploy?: boolean | string;
};

type HomepageThought = {
  time: string;
  title: string;
  body: string;
};

type HomepagePost = {
  tag: string;
  date: string;
  title: string;
  body: string;
};

type HomepageProject = {
  title: string;
  url: string;
};

type HomepageContent = {
  thoughts: HomepageThought[];
  posts: HomepagePost[];
  projects: HomepageProject[];
};

const ACTION_NAME = "PUBLISH_HOMEPAGE_CONTENT";

function failure(text: string, error: string): ActionResult {
  return {
    text,
    success: false,
    values: { success: false, error },
    data: { actionName: ACTION_NAME },
  };
}

function getHomepageDir(): string {
  return resolve(
    process.env.BOTDICK_HOMEPAGE_DIR?.trim() || "botdick-homepage",
  );
}

function getContentPath(): string {
  return resolve(getHomepageDir(), "content.js");
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|1)$/i.test(value.trim());
  return false;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function readContent(path = getContentPath()): HomepageContent {
  if (!existsSync(path)) {
    throw new Error(`Missing homepage content file: ${path}`);
  }
  const source = readFileSync(path, "utf8");
  const match = source.match(
    /window\.BOTDICK_CONTENT\s*=\s*([\s\S]*?)\s*;?\s*$/,
  );
  if (!match?.[1]) {
    throw new Error("Homepage content file is not in the expected format");
  }
  const parsed = JSON.parse(match[1]) as Partial<HomepageContent>;
  return {
    thoughts: Array.isArray(parsed.thoughts) ? parsed.thoughts : [],
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
  };
}

function writeContent(content: HomepageContent, path = getContentPath()): void {
  writeFileSync(
    path,
    `window.BOTDICK_CONTENT = ${JSON.stringify(content, null, 2)};\n`,
  );
}

function deployHomepage(): { ok: boolean; output: string } {
  const repoRoot = resolve(getHomepageDir(), "..");
  const scriptPath = resolve(repoRoot, "scripts/deploy-cloudflare-pages-subdomain.mjs");
  const result = spawnSync(
    "node",
    [
      scriptPath,
      "--input-dir",
      getHomepageDir(),
      "--project-name",
      "botdick-homepage",
      "--bot-name",
      "botdick",
      "--project-title",
      "homepage",
      "--skip-domain",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );

  return {
    ok: result.status === 0,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function getParams(options?: HandlerOptions): PublishHomepageParams {
  const params = options?.parameters as PublishHomepageParams | undefined;
  return params || {};
}

function inferKind(params: PublishHomepageParams, message: Memory): PublishKind | "" {
  if (params.kind) return params.kind;
  const text = message.content?.text;
  if (typeof text !== "string") return "";
  if (/\b(project|link)\b/i.test(text)) return "project";
  if (/\b(blog|post|dispatch)\b/i.test(text)) return "post";
  if (/\b(thought|note|status)\b/i.test(text)) return "thought";
  return "";
}

function entrySummary(kind: PublishKind, title: string): string {
  if (kind === "project") return `linked project "${title}"`;
  if (kind === "post") return `published post "${title}"`;
  return `published thought "${title}"`;
}

export const publishHomepageContentAction: Action = {
  name: ACTION_NAME,

  similes: [
    "PUBLISH_BOTDICK_POST",
    "PUBLISH_BOTDICK_THOUGHT",
    "PUBLISH_BOTDICK_PROJECT",
    "ADD_HOMEPAGE_POST",
    "ADD_HOMEPAGE_THOUGHT",
    "ADD_PROJECT_LINK",
  ],

  description:
    "Publish botdick-owned homepage content by appending a thought, blog post, " +
    "or project link to botdick-homepage/content.js. Use when asked to update " +
    "botdick's homepage, blog, thoughts, or projects. Set deploy=true only when " +
    "the user explicitly asks to deploy after publishing.",

  validate: async (_runtime, message) => {
    const text = message.content?.text;
    if (typeof text !== "string") return false;
    return /\b(botdick|homepage|blog|post|thought|project)\b/i.test(text);
  },

  handler: async (_runtime, message, _state, options) => {
    const params = getParams(options as HandlerOptions | undefined);
    const kind = inferKind(params, message as Memory);

    if (kind !== "thought" && kind !== "post" && kind !== "project") {
      return failure(
        "Blocked: choose kind thought, post, or project.",
        "MISSING_KIND",
      );
    }

    const title = normalizeString(params.title);
    const body = normalizeString(params.body || params.text);
    const url = normalizeString(params.url);

    if (!title) {
      return failure("Blocked: title is required.", "MISSING_TITLE");
    }

    const contentPath = getContentPath();
    let content: HomepageContent;
    try {
      content = readContent(contentPath);
    } catch (error) {
      return failure(
        `Blocked: could not read homepage content: ${error instanceof Error ? error.message : String(error)}`,
        "READ_FAILED",
      );
    }

    if (kind === "project") {
      if (!url) return failure("Blocked: project url is required.", "MISSING_URL");
      content.projects.unshift({ title, url });
    } else if (kind === "post") {
      if (!body) return failure("Blocked: post body is required.", "MISSING_BODY");
      content.posts.unshift({
        tag: normalizeString(params.tag) || "post",
        date: normalizeString(params.date) || today(),
        title,
        body,
      });
    } else {
      if (!body) return failure("Blocked: thought body is required.", "MISSING_BODY");
      content.thoughts.unshift({
        time: normalizeString(params.time) || currentTime(),
        title,
        body,
      });
    }

    try {
      writeContent(content, contentPath);
    } catch (error) {
      return failure(
        `Blocked: could not write homepage content: ${error instanceof Error ? error.message : String(error)}`,
        "WRITE_FAILED",
      );
    }

    const deploy = asBoolean(params.deploy);
    if (deploy) {
      const result = deployHomepage();
      if (!result.ok) {
        return failure(
          `${entrySummary(kind, title)}, but deploy failed:\n${result.output}`,
          "DEPLOY_FAILED",
        );
      }
      return {
        text: `${entrySummary(kind, title)} and deployed: https://botdick-homepage.pages.dev`,
        success: true,
        values: { success: true, kind, title, deployed: true },
        data: { actionName: ACTION_NAME, kind, title, url },
      };
    }

    return {
      text: `${entrySummary(kind, title)}. Not deployed yet.`,
      success: true,
      values: { success: true, kind, title, deployed: false },
      data: { actionName: ACTION_NAME, kind, title, url },
    };
  },

  parameters: [
    {
      name: "kind",
      description: "Content kind to publish: thought, post, or project.",
      required: true,
      schema: { type: "string" as const, enum: ["thought", "post", "project"] },
    },
    {
      name: "title",
      description: "Title for the thought, post, or project.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "body",
      description: "Body text for a thought or post.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "url",
      description: "Project URL when kind=project.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "deploy",
      description: "Set true only when the user explicitly asks to deploy.",
      required: false,
      schema: { type: "boolean" as const },
    },
  ],
};
