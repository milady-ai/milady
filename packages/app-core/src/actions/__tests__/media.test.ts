import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadElizaConfig } from "../../config/config";
import { createImageProvider } from "../../providers/media-provider";

const mockImageGenerate = vi.fn();
const mockVideoGenerate = vi.fn();
const mockAudioGenerate = vi.fn();
const mockVisionAnalyze = vi.fn();

vi.mock("../../providers/media-provider", () => ({
  createImageProvider: vi.fn(() => ({
    generate: mockImageGenerate,
  })),
  createVideoProvider: vi.fn(() => ({
    generate: mockVideoGenerate,
  })),
  createAudioProvider: vi.fn(() => ({
    generate: mockAudioGenerate,
  })),
  createVisionProvider: vi.fn(() => ({
    analyze: mockVisionAnalyze,
  })),
}));

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(() => ({ media: {}, cloud: {} })),
}));

async function loadMediaActions() {
  vi.resetModules();
  return await import("../../actions/media");
}

const loadElizaConfigMock = vi.mocked(loadElizaConfig);
const createImageProviderMock = vi.mocked(createImageProvider);

describe("media actions", () => {
  beforeEach(() => {
    createImageProviderMock.mockClear();
    loadElizaConfigMock.mockClear();
    mockImageGenerate.mockReset();
    mockVideoGenerate.mockReset();
    mockAudioGenerate.mockReset();
    mockVisionAnalyze.mockReset();
    loadElizaConfigMock.mockReturnValue({ media: {}, cloud: {} } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires a prompt for image generation", async () => {
    const { generateImageAction } = await loadMediaActions();
    const result = await generateImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "   " } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("I need a prompt");
  });

  it("returns generated image result", async () => {
    mockImageGenerate.mockResolvedValue({
      success: true,
      data: {
        imageUrl: "https://example.com/image.png",
        revisedPrompt: "sunset by the sea",
      },
    });

    const { generateImageAction } = await loadMediaActions();
    const result = await generateImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "sunset at beach" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toContain(
      'Here\'s the generated image based on: "sunset by the sea"',
    );
    expect(result.data?.imageUrl).toBe("https://example.com/image.png");
    expect(result.attachments).toEqual([
      {
        type: "image",
        url: "https://example.com/image.png",
        base64: undefined,
        mimeType: "image/png",
      },
    ]);
  });

  it("returns image failure when provider fails", async () => {
    mockImageGenerate.mockResolvedValue({
      success: false,
      error: "provider unavailable",
    });

    const { generateImageAction } = await loadMediaActions();
    const result = await generateImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "sunset" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("provider unavailable");
  });

  it("does not fall back to Eliza Cloud media unless media routing selects it", async () => {
    loadElizaConfigMock.mockReturnValue({
      media: {},
      cloud: { apiKey: "ck-cloud" },
      serviceRouting: {
        llmText: {
          backend: "elizacloud",
          transport: "cloud-proxy",
        },
      },
    } as never);
    mockImageGenerate.mockResolvedValue({
      success: false,
      error: "provider unavailable",
    });

    const { generateImageAction } = await loadMediaActions();
    await generateImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "sunset" } },
    );

    expect(createImageProviderMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        elizaCloudApiKey: "ck-cloud",
        cloudMediaDisabled: true,
      }),
    );
  });

  it("keeps Eliza Cloud media enabled when media routing selects it explicitly", async () => {
    loadElizaConfigMock.mockReturnValue({
      media: {},
      cloud: { apiKey: "ck-cloud" },
      serviceRouting: {
        media: {
          backend: "elizacloud",
          transport: "cloud-proxy",
          accountId: "elizacloud",
        },
      },
    } as never);
    mockImageGenerate.mockResolvedValue({
      success: false,
      error: "provider unavailable",
    });

    const { generateImageAction } = await loadMediaActions();
    await generateImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "sunset" } },
    );

    expect(createImageProviderMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        elizaCloudApiKey: "ck-cloud",
        cloudMediaDisabled: false,
      }),
    );
  });

  it("requires a prompt for video generation", async () => {
    const { generateVideoAction } = await loadMediaActions();
    const result = await generateVideoAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("I need a prompt to generate a video");
  });

  it("generates video output", async () => {
    mockVideoGenerate.mockResolvedValue({
      success: true,
      data: {
        videoUrl: "https://example.com/video.mp4",
        thumbnailUrl: "https://example.com/video-thumb.png",
        duration: 12,
      },
    });

    const { generateVideoAction } = await loadMediaActions();
    const result = await generateVideoAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "cat dancing" } },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      videoUrl: "https://example.com/video.mp4",
      duration: 12,
    });
    expect(result.attachments).toEqual([
      {
        type: "video",
        url: "https://example.com/video.mp4",
        mimeType: "video/mp4",
      },
    ]);
  });

  it("generates audio output", async () => {
    mockAudioGenerate.mockResolvedValue({
      success: true,
      data: {
        audioUrl: "https://example.com/song.mp3",
        title: "ambient track",
        duration: 40,
      },
    });

    const { generateAudioAction } = await loadMediaActions();
    const result = await generateAudioAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { prompt: "ambient music for focus" } },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      audioUrl: "https://example.com/song.mp3",
      title: "ambient track",
    });
    expect(result.attachments).toEqual([
      {
        type: "audio",
        url: "https://example.com/song.mp3",
        mimeType: "audio/mpeg",
        title: "ambient track",
      },
    ]);
  });

  it("requires an image input for analysis", async () => {
    const { analyzeImageAction } = await loadMediaActions();
    const result = await analyzeImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: {} },
    );

    expect(result.success).toBe(false);
    expect(result.text).toContain("I need an image to analyze");
  });

  it("analyzes image and returns description", async () => {
    mockVisionAnalyze.mockResolvedValue({
      success: true,
      data: {
        description: "A sunset over city lights",
        labels: ["sunset", "city"],
        confidence: 0.98,
      },
    });

    const { analyzeImageAction } = await loadMediaActions();
    const result = await analyzeImageAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { imageUrl: "https://example.com/source.png" } },
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      description: "A sunset over city lights",
      labels: ["sunset", "city"],
      confidence: 0.98,
    });
  });
});
