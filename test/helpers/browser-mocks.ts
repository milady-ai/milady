/**
 * Shared browser API mock helpers for test setup files.
 *
 * Used by both test/setup.ts and apps/app/test/setup.ts to avoid
 * duplicating Storage, Canvas2D, and console error suppression logic.
 */

import { vi } from "vitest";

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
    canvas: typeof document !== "undefined"
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

  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn((contextType: string) =>
      contextType === "2d" ? createCanvas2DContext() : null,
    ),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "toDataURL", {
    value: vi.fn(() => "data:image/png;base64,dGVzdA=="),
    writable: true,
    configurable: true,
  });
}

/**
 * Suppress known noisy console.error messages from React test tooling.
 */
export function suppressReactTestConsoleErrors(): void {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      (first.includes("react-test-renderer is deprecated") ||
        first.includes(
          "The current testing environment is not configured to support act(...)",
        ))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
}
