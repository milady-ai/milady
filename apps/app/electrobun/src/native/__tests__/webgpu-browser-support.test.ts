import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the webgpu-browser-support module.
 *
 * Validates:
 * - Chrome Beta detection across platforms
 * - WebGPU Chromium flags
 * - macOS version detection
 * - checkWebGpuSupport() status for each platform scenario
 */

// We need to mock fs and os before importing the module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock("node:os", () => ({
  release: vi.fn(() => "25.0.0"), // Darwin 25 = macOS 26
}));

const fs = await import("node:fs");
const osModule = await import("node:os");

const {
  detectChromeBeta,
  getChromeBetaDownloadUrl,
  getWebGpuChromiumFlags,
  getMacOSMajorVersion,
  checkWebGpuSupport,
} = await import("../webgpu-browser-support");

describe("detectChromeBeta", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it("returns found: false when no Chrome Beta exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = detectChromeBeta();
    expect(result.found).toBe(false);
    expect(result.path).toBeNull();
    expect(result.downloadUrl).toContain("google.com/chrome/beta");
  });

  it("returns found: true when Chrome Beta exists", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      // Candidate paths contain "Chrome" (capital C) or "chrome-beta"
      return (
        typeof p === "string" &&
        (p.includes("Chrome") || p.includes("chrome-beta"))
      );
    });
    const result = detectChromeBeta();
    expect(result.found).toBe(true);
    expect(result.path).not.toBeNull();
  });

  it("always provides a downloadUrl", () => {
    const result = detectChromeBeta();
    expect(result.downloadUrl).toBeTruthy();
  });
});

describe("getChromeBetaDownloadUrl", () => {
  it("returns a URL containing chrome/beta", () => {
    const url = getChromeBetaDownloadUrl();
    expect(url).toContain("chrome/beta");
  });
});

describe("getWebGpuChromiumFlags", () => {
  it("always includes --enable-unsafe-webgpu", () => {
    const flags = getWebGpuChromiumFlags();
    expect(flags).toContain("--enable-unsafe-webgpu");
  });

  it("returns an array of strings", () => {
    const flags = getWebGpuChromiumFlags();
    expect(Array.isArray(flags)).toBe(true);
    for (const flag of flags) {
      expect(typeof flag).toBe("string");
    }
  });
});

describe("getMacOSMajorVersion", () => {
  it("maps Darwin 25 to macOS 26 on darwin", () => {
    if (process.platform !== "darwin") return;
    vi.mocked(osModule.release).mockReturnValue("25.2.0");
    expect(getMacOSMajorVersion()).toBe(26);
  });

  it("maps Darwin 24 to macOS 15 on darwin", () => {
    if (process.platform !== "darwin") return;
    vi.mocked(osModule.release).mockReturnValue("24.0.0");
    expect(getMacOSMajorVersion()).toBe(15);
  });

  it("maps Darwin 20–23 to macOS 11–14 on darwin", () => {
    if (process.platform !== "darwin") return;
    const pairs: [string, number][] = [
      ["20.6.0", 11],
      ["21.6.0", 12],
      ["22.6.0", 13],
      ["23.5.0", 14],
    ];
    for (const [release, expected] of pairs) {
      vi.mocked(osModule.release).mockReturnValue(release);
      expect(getMacOSMajorVersion()).toBe(expected);
    }
  });

  it("maps Darwin 26 to macOS 27 on darwin (continued N+1 pattern)", () => {
    if (process.platform !== "darwin") return;
    vi.mocked(osModule.release).mockReturnValue("26.0.0");
    expect(getMacOSMajorVersion()).toBe(27);
  });

  it("returns null on non-darwin platforms", () => {
    if (process.platform === "darwin") return;
    const version = getMacOSMajorVersion();
    expect(version).toBeNull();
  });
});

describe("checkWebGpuSupport", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset().mockReturnValue(false);
    vi.mocked(osModule.release).mockReturnValue("25.0.0");
  });

  it("returns a status object with required fields", () => {
    const status = checkWebGpuSupport("native");
    expect(status).toHaveProperty("available");
    expect(status).toHaveProperty("reason");
    expect(status).toHaveProperty("renderer");
    expect(status).toHaveProperty("chromeBetaPath");
    expect(status).toHaveProperty("downloadUrl");
  });

  it("returns available: true for macOS native renderer on macOS 26+", () => {
    if (process.platform !== "darwin") return;
    vi.mocked(osModule.release).mockReturnValue("25.0.0"); // Darwin 25 = macOS 26 (Tahoe)
    const status = checkWebGpuSupport("native");
    expect(status.available).toBe(true);
    expect(status.renderer).toBe("native");
  });

  it("returns available: false for CEF renderer (flags needed)", () => {
    const status = checkWebGpuSupport("cef");
    expect(status.available).toBe(false);
    expect(status.renderer).toBe("cef");
    expect(status.reason).toContain("enable-unsafe-webgpu");
    expect(status.reason).toContain("WebGL");
  });

  it("macOS native < 26 explains WebGL fallback (not app blocking)", () => {
    if (process.platform !== "darwin") return;
    vi.mocked(osModule.release).mockReturnValue("24.0.0"); // macOS 15
    const status = checkWebGpuSupport("native");
    expect(status.available).toBe(false);
    expect(status.renderer).toBe("native");
    expect(status.reason).toContain("WebGL");
    expect(status.reason).toContain("navigator.gpu");
    expect(status.reason).not.toMatch(/is required\.?$/);
  });
});
