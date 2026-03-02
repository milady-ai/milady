/**
 * Camera Module — STUB
 *
 * Camera access is not yet available in Electrobun.
 * All calls return a "not-available" response so the UI can show an appropriate state.
 */

function notAvailable(feature: string) {
  return Promise.resolve({
    error: `${feature} not available in Electrobun yet`,
  });
}

export const cameraHandlers: Record<
  string,
  (args: unknown[]) => Promise<unknown>
> = {
  "camera:capturePhoto": () => notAvailable("camera:capturePhoto"),
  "camera:checkPermissions": () => Promise.resolve({ camera: "not-available" }),
  "camera:getDevices": () => Promise.resolve({ devices: [] }),
  "camera:getRecordingState": () => Promise.resolve({ recording: false }),
  "camera:requestPermissions": () =>
    Promise.resolve({ camera: "not-available" }),
  "camera:startPreview": () => notAvailable("camera:startPreview"),
  "camera:startRecording": () => notAvailable("camera:startRecording"),
  "camera:stopPreview": () => Promise.resolve(),
  "camera:stopRecording": () => Promise.resolve(),
  "camera:switchCamera": () => notAvailable("camera:switchCamera"),
};

export function getCameraManager() {
  return { setMainWindow: () => {}, dispose: () => {} };
}
