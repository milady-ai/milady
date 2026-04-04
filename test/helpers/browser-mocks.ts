/**
 * Shared browser API mock helpers for test setup files.
 *
 * Used by both test/setup.ts and apps/app/test/setup.ts to avoid
 * duplicating Storage, Canvas2D, and console error suppression logic.
 */

import { vi } from "vitest";

const CANVAS_PATCH_MARK = Symbol.for("milady.test.canvasMocksInstalled");
const CONSOLE_PATCH_MARK = Symbol.for("milady.test.consoleErrorPatched");
const CONSOLE_WARN_PATCH_MARK = Symbol.for("milady.test.consoleWarnPatched");
const CONSOLE_LOG_PATCH_MARK = Symbol.for("milady.test.consoleLogPatched");
const MEDIA_PATCH_MARK = Symbol.for("milady.test.mediaMocksInstalled");
const AUDIO_PATCH_MARK = Symbol.for("milady.test.audioMocksInstalled");

/**
 * Create an in-memory Storage mock backed by a Map.
 * Wraps methods in vi.fn() so tests can assert on storage calls.
 */
export function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  } as Storage;
}

/** Type guard: does the value implement the Storage interface? */
export function hasStorageApi(value: unknown): value is Storage {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Storage).getItem === "function" &&
      typeof (value as Storage).setItem === "function" &&
      typeof (value as Storage).removeItem === "function" &&
      typeof (value as Storage).clear === "function",
  );
}

/**
 * Create a Canvas 2D rendering context mock with vi.fn() stubs
 * for all commonly-used methods.
 */
export function createCanvas2DContext(): CanvasRenderingContext2D {
  return {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
    })),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createPattern: vi.fn(() => null),
    canvas:
      typeof document !== "undefined"
        ? document.createElement("canvas")
        : ({} as HTMLCanvasElement),
    lineWidth: 1,
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
  } as CanvasRenderingContext2D;
}

/**
 * Install canvas mocks on HTMLCanvasElement.prototype if available.
 */
export function installCanvasMocks(): void {
  if (typeof globalThis.HTMLCanvasElement === "undefined") return;
  const prototype = globalThis.HTMLCanvasElement
    .prototype as HTMLCanvasElement["prototype"] & {
    [CANVAS_PATCH_MARK]?: boolean;
  };
  if (prototype[CANVAS_PATCH_MARK]) return;

  Object.defineProperty(prototype, "getContext", {
    value: vi.fn((contextType: string) =>
      contextType === "2d" ? createCanvas2DContext() : null,
    ),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(prototype, "toDataURL", {
    value: vi.fn(() => "data:image/png;base64,dGVzdA=="),
    writable: true,
    configurable: true,
  });

  prototype[CANVAS_PATCH_MARK] = true;
}

/**
 * Install HTMLMediaElement and Audio mocks to avoid jsdom "Not implemented"
 * warnings when tests exercise preview/playback flows.
 */
export function installMediaElementMocks(): void {
  if (typeof globalThis.HTMLMediaElement === "undefined") return;

  const prototype = globalThis.HTMLMediaElement.prototype as
    HTMLMediaElement["prototype"] & {
      [MEDIA_PATCH_MARK]?: boolean;
    };
  if (!prototype[MEDIA_PATCH_MARK]) {
    Object.defineProperty(prototype, "load", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(prototype, "play", {
      value: vi.fn(() => Promise.resolve()),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(prototype, "pause", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    prototype[MEDIA_PATCH_MARK] = true;
  }

  const globalObject = globalThis as typeof globalThis & {
    Audio?: typeof Audio & {
      [AUDIO_PATCH_MARK]?: boolean;
    };
  };
  if (typeof document === "undefined") return;
  if (globalObject.Audio?.[AUDIO_PATCH_MARK]) return;

  const MockAudio = vi.fn(function MockAudio(src?: string) {
    const audio = document.createElement("audio");
    if (typeof src === "string") {
      audio.src = src;
    }
    return audio;
  }) as unknown as typeof Audio & {
    [AUDIO_PATCH_MARK]?: boolean;
  };
  MockAudio[AUDIO_PATCH_MARK] = true;

  Object.defineProperty(globalObject, "Audio", {
    value: MockAudio,
    writable: true,
    configurable: true,
  });
}

/**
 * Suppress known noisy console.error messages from React test tooling.
 */
export function suppressReactTestConsoleErrors(): void {
  const currentConsoleError = console.error as typeof console.error & {
    [CONSOLE_PATCH_MARK]?: boolean;
  };
  if (currentConsoleError[CONSOLE_PATCH_MARK]) {
    return;
  }
  const originalConsoleError = console.error.bind(console);
  const patchedConsoleError = ((...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      (first.includes("react-test-renderer is deprecated") ||
        first.includes(
          "The current testing environment is not configured to support act(...)",
        ) ||
        first.includes("was not wrapped in act(...)"))
    ) {
      return;
    }
    originalConsoleError(...args);
  }) as typeof console.error & {
    [CONSOLE_PATCH_MARK]?: boolean;
  };
  patchedConsoleError[CONSOLE_PATCH_MARK] = true;
  console.error = patchedConsoleError;

  const currentConsoleWarn = console.warn as typeof console.warn & {
    [CONSOLE_WARN_PATCH_MARK]?: boolean;
  };
  if (!currentConsoleWarn[CONSOLE_WARN_PATCH_MARK]) {
    const originalConsoleWarn = console.warn.bind(console);
    const patchedConsoleWarn = ((...args: unknown[]) => {
      const first = args[0];
      if (
        typeof first === "string" &&
        (first.includes("[openExternalUrl]") ||
          first.includes("[RenderGuard]") ||
          first.includes("[persistence] localStorage operation failed:") ||
          first.includes(
            "[Gateway] mDNS discovery not available - desktop bridge not configured",
          ))
      ) {
        return;
      }
      originalConsoleWarn(...args);
    }) as typeof console.warn & {
      [CONSOLE_WARN_PATCH_MARK]?: boolean;
    };
    patchedConsoleWarn[CONSOLE_WARN_PATCH_MARK] = true;
    console.warn = patchedConsoleWarn;
  }

  const currentConsoleLog = console.log as typeof console.log & {
    [CONSOLE_LOG_PATCH_MARK]?: boolean;
  };
  if (!currentConsoleLog[CONSOLE_LOG_PATCH_MARK]) {
    const originalConsoleLog = console.log.bind(console);
    const patchedConsoleLog = ((...args: unknown[]) => {
      const first = args[0];
      if (
        typeof first === "string" &&
        first.includes("[shell] switchShellView:")
      ) {
        return;
      }
      originalConsoleLog(...args);
    }) as typeof console.log & {
      [CONSOLE_LOG_PATCH_MARK]?: boolean;
    };
    patchedConsoleLog[CONSOLE_LOG_PATCH_MARK] = true;
    console.log = patchedConsoleLog;
  }
}
