import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LifeOpsScreenContextSampler,
  analyzeLifeOpsScreenBuffer,
} from "./screen-context";

async function createJpeg(
  text: string,
  options: {
    background?: string;
    foreground?: string;
    width?: number;
    height?: number;
  } = {},
): Promise<Buffer> {
  const width = options.width ?? 960;
  const height = options.height ?? 540;
  const background = options.background ?? "#ffffff";
  const foreground = options.foreground ?? "#111111";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${background}" />
      <text x="40" y="96" font-family="Arial, sans-serif" font-size="42" fill="${foreground}">${text}</text>
      <text x="40" y="160" font-family="Arial, sans-serif" font-size="28" fill="${foreground}">${text}</text>
    </svg>
  `;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

describe("lifeops screen context", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    vi.restoreAllMocks();
  });

  it("returns a disabled summary when no frame exists", async () => {
    const sampler = new LifeOpsScreenContextSampler({
      framePath: path.join(os.tmpdir(), `missing-${Date.now()}.jpg`),
    });

    const summary = await sampler.sample(1_000);

    expect(summary.source).toBe("disabled");
    expect(summary.available).toBe(false);
    expect(summary.disabledReason).toContain("browser-capture frame");
    expect(summary.contextTags).toContain("disabled");
  });

  it("classifies work and leisure screenshots from OCR text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "screen-context-"));
    tempDirs.push(dir);

    const workFramePath = path.join(dir, "work.jpg");
    const leisureFramePath = path.join(dir, "leisure.jpg");
    await fs.writeFile(workFramePath, await createJpeg("Inbox Calendar Meeting"));
    await fs.writeFile(
      leisureFramePath,
      await createJpeg("YouTube Instagram", {
        background: "#0b1020",
        foreground: "#f9fafb",
      }),
    );

    const workSummary = await analyzeLifeOpsScreenBuffer({
      framePath: workFramePath,
      frameBytes: await fs.readFile(workFramePath),
      ocrText: "Inbox Calendar Meeting",
      capturedAtMs: 10,
      sampledAtMs: 20,
      stale: false,
    });
    const leisureSummary = await analyzeLifeOpsScreenBuffer({
      framePath: leisureFramePath,
      frameBytes: await fs.readFile(leisureFramePath),
      ocrText: "YouTube Instagram",
      capturedAtMs: 10,
      sampledAtMs: 20,
      stale: false,
    });

    expect(workSummary.source).toBe("vision");
    expect(workSummary.focus).toBe("work");
    expect(workSummary.busy).toBe(true);
    expect(workSummary.ocrAvailable).toBe(true);
    expect(workSummary.contextTags).toContain("work");

    expect(leisureSummary.focus).toBe("leisure");
    expect(leisureSummary.busy).toBe(false);
    expect(leisureSummary.ocrAvailable).toBe(true);
    expect(leisureSummary.contextTags).toContain("leisure");
  });

  it("throttles repeated sampling and reuses the last summary", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "screen-context-"));
    tempDirs.push(dir);
    const framePath = path.join(dir, "frame.jpg");
    await fs.writeFile(framePath, await createJpeg("Terminal GitHub"));

    const ocr = {
      extractText: vi.fn().mockResolvedValue("Terminal GitHub"),
    };

    const sampler = new LifeOpsScreenContextSampler({
      framePath,
      minSampleIntervalMs: 1_000,
      ocr,
    });

    const first = await sampler.sample(1_000);
    const second = await sampler.sample(1_500);

    expect(first.throttled).toBe(false);
    expect(first.focus).toBe("work");
    expect(second.throttled).toBe(true);
    expect(second.focus).toBe("work");
    expect(second.sampledAtMs).toBe(1_500);
    expect(ocr.extractText).toHaveBeenCalledTimes(1);
  });

  it("detects stale frames as unavailable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "screen-stale-"));
    tempDirs.push(dir);
    const framePath = path.join(dir, "frame.jpg");
    await fs.writeFile(framePath, await createJpeg("Calendar"));
    const past = Date.now() - 40 * 60_000;
    await fs.utimes(framePath, past / 1000, past / 1000);

    const sampler = new LifeOpsScreenContextSampler({
      framePath,
      maxFrameAgeMs: 10 * 60_000,
      ocr: {
        extractText: vi.fn().mockResolvedValue("Calendar"),
      },
    });

    const summary = await sampler.sample(Date.now());

    expect(summary.stale).toBe(true);
    expect(summary.available).toBe(false);
    expect(summary.disabledReason).toContain("stale");
  });
});
