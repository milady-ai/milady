/**
 * Screen Capture Module — STUB
 *
 * Screen capture and recording are not yet available in Electrobun.
 * All calls return a "not-available" response.
 */

function notAvailable(feature: string) {
  return Promise.resolve({ error: `${feature} not available in Electrobun yet` });
}

export const screenCaptureHandlers: Record<string, (args: unknown[]) => Promise<unknown>> = {
  "screencapture:getSources": () => Promise.resolve({ sources: [] }),
  "screencapture:takeScreenshot": () => notAvailable("screencapture:takeScreenshot"),
  "screencapture:saveScreenshot": () => notAvailable("screencapture:saveScreenshot"),
  "screencapture:captureWindow": () => notAvailable("screencapture:captureWindow"),
  "screencapture:startRecording": () => notAvailable("screencapture:startRecording"),
  "screencapture:stopRecording": () => notAvailable("screencapture:stopRecording"),
  "screencapture:pauseRecording": () => notAvailable("screencapture:pauseRecording"),
  "screencapture:resumeRecording": () => notAvailable("screencapture:resumeRecording"),
  "screencapture:getRecordingState": () => Promise.resolve({ recording: false, state: "inactive" }),
  "screencapture:startFrameCapture": () => notAvailable("screencapture:startFrameCapture"),
  "screencapture:stopFrameCapture": () => notAvailable("screencapture:stopFrameCapture"),
  "screencapture:isFrameCaptureActive": () => Promise.resolve({ active: false }),
};

export function getScreenCaptureManager() {
  return { setMainWindow: () => {}, dispose: () => {}, setCaptureTarget: () => {} };
}
