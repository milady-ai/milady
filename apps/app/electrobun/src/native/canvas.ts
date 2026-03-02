/**
 * Canvas (embedded webview windows) Module — STUB
 *
 * Canvas popout windows using BrowserView are not yet ported to Electrobun.
 */

function notAvailable(feature: string) {
  return Promise.resolve({
    error: `${feature} not available in Electrobun yet`,
  });
}

export const canvasHandlers: Record<
  string,
  (args: unknown[]) => Promise<unknown>
> = {
  "canvas:createWindow": () => notAvailable("canvas:createWindow"),
  "canvas:destroyWindow": () => Promise.resolve(),
  "canvas:show": () => Promise.resolve(),
  "canvas:hide": () => Promise.resolve(),
  "canvas:focus": () => Promise.resolve(),
  "canvas:navigate": () => notAvailable("canvas:navigate"),
  "canvas:resize": () => Promise.resolve(),
  "canvas:getBounds": () =>
    Promise.resolve({ x: 0, y: 0, width: 0, height: 0 }),
  "canvas:setBounds": () => Promise.resolve(),
  "canvas:eval": () => notAvailable("canvas:eval"),
  "canvas:snapshot": () => notAvailable("canvas:snapshot"),
  "canvas:listWindows": () => Promise.resolve({ windows: [] }),
  "canvas:a2uiPush": () => Promise.resolve(),
  "canvas:a2uiReset": () => Promise.resolve(),
};

export function getCanvasManager() {
  return { setMainWindow: () => {}, dispose: () => {} };
}
