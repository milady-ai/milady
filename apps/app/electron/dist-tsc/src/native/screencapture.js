"use strict";
/**
 * Screen Capture Native Module for Electron
 *
 * Provides native screen capture (screenshots) and screen recording using
 * Electron's desktopCapturer + a hidden renderer for MediaRecorder.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenCaptureManager = void 0;
exports.getScreenCaptureManager = getScreenCaptureManager;
exports.registerScreenCaptureIPC = registerScreenCaptureIPC;
const tslib_1 = require("tslib");
const promises_1 = require("node:fs/promises");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const electron_1 = require("electron");
const RECORDING_BITRATE = {
  low: 1000000,
  medium: 4000000,
  high: 8000000,
  highest: 16000000,
};
// ── Manager ─────────────────────────────────────────────────────────────────
/**
 * Screen Capture Manager
 */
class ScreenCaptureManager {
  constructor() {
    this.mainWindow = null;
    this.recordingWindow = null;
    this.recordingStartTime = 0;
    this._recordingState = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
    this._frameCaptureTimer = null;
    this._frameCaptureActive = false;
    this._frameCaptureSkipping = false;
    this._frameCaptureWindow = null;
    this._captureTarget = null;
    this._frameCaptureOptions = null;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Switch the frame capture target to a different window (e.g. pop-out).
   * Pass null to revert to the main window.
   * If frame capture is active, it restarts with the new target.
   */
  setCaptureTarget(window) {
    this._captureTarget = window;
    console.log(
      `[ScreenCapture] Capture target switched to ${window ? "popout window" : "main window"}`,
    );
    // If frame capture is active (timer-based, not offscreen/gameUrl), restart it
    if (
      this._frameCaptureActive &&
      this._frameCaptureTimer &&
      this._frameCaptureOptions
    ) {
      const opts = this._frameCaptureOptions;
      this.stopFrameCapture();
      void this.startFrameCapture(opts);
    }
  }
  // ── Sources ─────────────────────────────────────────────────────────────
  /**
   * Get available screen/window sources
   */
  async getSources() {
    const sources = await electron_1.desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return {
      sources: sources.map((source) => {
        var _a;
        return {
          id: source.id,
          name: source.name,
          type: source.id.startsWith("screen:") ? "screen" : "window",
          thumbnail: source.thumbnail.toDataURL(),
          appIcon:
            (_a = source.appIcon) === null || _a === void 0
              ? void 0
              : _a.toDataURL(),
        };
      }),
    };
  }
  // ── Screenshot ──────────────────────────────────────────────────────────
  /**
   * Take a screenshot of a specific source
   */
  async takeScreenshot(options) {
    const sources = await electron_1.desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: electron_1.screen.getPrimaryDisplay().workAreaSize,
    });
    let source = sources[0]; // Default to primary screen
    if (options === null || options === void 0 ? void 0 : options.sourceId) {
      const found = sources.find((s) => s.id === options.sourceId);
      if (found) source = found;
    }
    if (!source) {
      throw new Error("No screen source available");
    }
    const thumbnail = source.thumbnail;
    const format =
      (options === null || options === void 0 ? void 0 : options.format) ||
      "png";
    let dataUrl;
    if (format === "jpeg") {
      dataUrl = thumbnail
        .toJPEG(
          (options === null || options === void 0 ? void 0 : options.quality) ||
            90,
        )
        .toString("base64");
    } else {
      dataUrl = thumbnail.toPNG().toString("base64");
    }
    const size = thumbnail.getSize();
    return {
      base64: dataUrl,
      format,
      width: size.width,
      height: size.height,
    };
  }
  /**
   * Capture the main window
   */
  async captureWindow() {
    if (!this.mainWindow) {
      throw new Error("Main window not available");
    }
    const image = await this.mainWindow.webContents.capturePage();
    const size = image.getSize();
    return {
      base64: image.toPNG().toString("base64"),
      format: "png",
      width: size.width,
      height: size.height,
    };
  }
  /**
   * Save screenshot to file
   */
  async saveScreenshot(screenshot, filename) {
    const dir = electron_1.app.getPath("pictures");
    const name =
      (filename === null || filename === void 0 ? void 0 : filename.trim()) ||
      `screenshot-${Date.now()}.${screenshot.format}`;
    const baseName = node_path_1.default.basename(name);
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = node_path_1.default.join(dir, safeName);
    const resolvedDir = node_path_1.default.resolve(dir);
    const resolvedFile = node_path_1.default.resolve(filePath);
    if (!resolvedFile.startsWith(`${resolvedDir}${node_path_1.default.sep}`)) {
      throw new Error("Invalid screenshot path");
    }
    const buffer = Buffer.from(screenshot.base64, "base64");
    await (0, promises_1.writeFile)(filePath, buffer);
    return { path: filePath };
  }
  // ── Recording renderer ─────────────────────────────────────────────────
  /**
   * Create (or reuse) the hidden renderer used for MediaRecorder-based
   * screen recording.  getUserMedia + MediaRecorder require a renderer context.
   */
  async ensureRecordingRenderer() {
    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      return this.recordingWindow;
    }
    this.recordingWindow = new electron_1.BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    // Auto-approve media permission requests for the hidden recording window
    this.recordingWindow.webContents.session.setPermissionRequestHandler(
      (_wc, permission, callback) => {
        callback(permission === "media");
      },
    );
    const html = `<!DOCTYPE html><html><head><title>ScreenRecorder</title></head><body></body></html>`;
    await this.recordingWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    return this.recordingWindow;
  }
  // ── Recording ───────────────────────────────────────────────────────────
  /**
   * Start screen recording.
   *
   * Uses desktopCapturer to identify the source, then spins up a MediaRecorder
   * inside a hidden renderer (since the MediaRecorder API is renderer-only).
   */
  async startRecording(options) {
    var _a, _b, _c, _d;
    if (this._recordingState.isRecording) {
      throw new Error("Recording already in progress");
    }
    // Resolve source ID – default to primary screen
    let sourceId =
      options === null || options === void 0 ? void 0 : options.sourceId;
    if (!sourceId) {
      const sources = await electron_1.desktopCapturer.getSources({
        types: ["screen"],
      });
      if (sources.length === 0) throw new Error("No screen sources available");
      sourceId = sources[0].id;
    }
    const renderer = await this.ensureRecordingRenderer();
    const bitrate =
      (_a =
        options === null || options === void 0 ? void 0 : options.bitrate) !==
        null && _a !== void 0
        ? _a
        : RECORDING_BITRATE[
            (_b =
              options === null || options === void 0
                ? void 0
                : options.quality) !== null && _b !== void 0
              ? _b
              : "medium"
          ];
    const fps =
      (_c = options === null || options === void 0 ? void 0 : options.fps) !==
        null && _c !== void 0
        ? _c
        : 30;
    const enableAudio =
      (_d =
        options === null || options === void 0
          ? void 0
          : options.enableSystemAudio) !== null && _d !== void 0
        ? _d
        : false;
    const cfg = JSON.stringify({ sourceId, bitrate, fps, enableAudio });
    await renderer.webContents.executeJavaScript(`
      (async () => {
        const o = ${cfg};

        // Build constraints using Chromium's desktopCapturer integration
        const constraints = {
          audio: o.enableAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: o.sourceId,
              maxFrameRate: o.fps,
            },
          },
        };

        window._scrStream = await navigator.mediaDevices.getUserMedia(constraints);
        window._scrChunks = [];
        window._scrStart = Date.now();
        window._scrIsRec = true;
        window._scrIsPaused = false;

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9' : 'video/webm';

        window._scrMR = new MediaRecorder(window._scrStream, {
          mimeType: mime,
          videoBitsPerSecond: o.bitrate,
        });

        window._scrMR.ondataavailable = e => {
          if (e.data.size > 0) window._scrChunks.push(e.data);
        };

        window._scrMR.start(1000);
      })()
    `);
    this.recordingStartTime = Date.now();
    this._recordingState = {
      isRecording: true,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
    this.emitRecordingState();
    // Auto-stop when maxDuration is reached
    if (options === null || options === void 0 ? void 0 : options.maxDuration) {
      const dur = options.maxDuration;
      renderer.webContents
        .executeJavaScript(`
        window._scrMaxDurTimeout = setTimeout(() => {
          if (window._scrMR && window._scrMR.state === 'recording') {
            window._scrMR.stop();
            window._scrIsRec = false;
          }
        }, ${dur * 1000});
      `)
        .catch(() => {});
    }
  }
  /**
   * Stop recording, save to file, and return the result.
   */
  async stopRecording() {
    if (!this._recordingState.isRecording) {
      throw new Error("No recording in progress");
    }
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) {
      throw new Error("Recording renderer lost");
    }
    const tempDir = node_path_1.default.join(
      electron_1.app.getPath("temp"),
      "milady-screencapture",
    );
    await (0, promises_1.mkdir)(tempDir, { recursive: true });
    const filePath = node_path_1.default.join(
      tempDir,
      `screenrec-${Date.now()}.webm`,
    );
    const result = await this.recordingWindow.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        if (!window._scrMR) { reject(new Error('No active recorder')); return; }
        if (window._scrMaxDurTimeout) { clearTimeout(window._scrMaxDurTimeout); window._scrMaxDurTimeout = null; }

        const finish = () => {
          const blob = new Blob(window._scrChunks, { type: window._scrMR.mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            const dur = (Date.now() - window._scrStart) / 1000;
            const vt = window._scrStream ? window._scrStream.getVideoTracks()[0] : null;
            const settings = vt ? vt.getSettings() : {};
            resolve({
              base64: b64,
              duration: dur,
              width: settings.width || 0,
              height: settings.height || 0,
              fileSize: blob.size,
              mimeType: window._scrMR.mimeType,
            });

            // Cleanup renderer state
            if (window._scrStream) { window._scrStream.getTracks().forEach(t => t.stop()); window._scrStream = null; }
            window._scrChunks = []; window._scrMR = null;
            window._scrIsRec = false; window._scrIsPaused = false;
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        };

        if (window._scrMR.state === 'inactive') {
          // Already stopped (e.g. maxDuration hit)
          finish();
        } else {
          window._scrMR.onstop = finish;
          window._scrMR.stop();
        }
      })
    `);
    const buffer = Buffer.from(result.base64, "base64");
    await (0, promises_1.writeFile)(filePath, buffer);
    this._recordingState = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
    this.emitRecordingState();
    return {
      path: filePath,
      duration: result.duration,
      width: result.width,
      height: result.height,
      fileSize: result.fileSize,
      mimeType: result.mimeType,
    };
  }
  /**
   * Pause the current recording.
   */
  async pauseRecording() {
    if (!this._recordingState.isRecording || this._recordingState.isPaused)
      return;
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) return;
    await this.recordingWindow.webContents.executeJavaScript(`
      (() => {
        if (window._scrMR && window._scrMR.state === 'recording') {
          window._scrMR.pause();
          window._scrIsPaused = true;
        }
      })()
    `);
    this._recordingState.isPaused = true;
    this.emitRecordingState();
  }
  /**
   * Resume a paused recording.
   */
  async resumeRecording() {
    if (!this._recordingState.isRecording || !this._recordingState.isPaused)
      return;
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) return;
    await this.recordingWindow.webContents.executeJavaScript(`
      (() => {
        if (window._scrMR && window._scrMR.state === 'paused') {
          window._scrMR.resume();
          window._scrIsPaused = false;
        }
      })()
    `);
    this._recordingState.isPaused = false;
    this.emitRecordingState();
  }
  /**
   * Get the current recording state.
   */
  async getRecordingState() {
    if (!this._recordingState.isRecording) {
      return { isRecording: false, isPaused: false, duration: 0, fileSize: 0 };
    }
    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      const live = await this.recordingWindow.webContents.executeJavaScript(`
        (() => ({
          fileSize: (window._scrChunks || []).reduce((s, c) => s + c.size, 0),
        }))()
      `);
      this._recordingState.duration =
        (Date.now() - this.recordingStartTime) / 1000;
      this._recordingState.fileSize = live.fileSize;
    }
    return Object.assign({}, this._recordingState);
  }
  // ── Helpers ─────────────────────────────────────────────────────────────
  emitRecordingState() {
    this.sendToRenderer("screencapture:recordingState", {
      isRecording: this._recordingState.isRecording,
      isPaused: this._recordingState.isPaused,
      duration: this._recordingState.duration,
      fileSize: this._recordingState.fileSize,
    });
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /**
   * Start capturing frames and POSTing them as JPEG to the stream endpoint.
   *
   * If `gameUrl` is provided, opens a dedicated offscreen BrowserWindow that
   * loads only the game — no app chrome, sidebar, or tabs. Uses the `paint`
   * event (correct API for offscreen rendering on macOS) instead of capturePage.
   * Falls back to capturing the main window if no gameUrl.
   */
  async startFrameCapture(options) {
    var _a, _b, _c, _d;
    if (this._frameCaptureActive) return;
    this._frameCaptureOptions = options ? Object.assign({}, options) : {};
    const fps =
      (_a = options === null || options === void 0 ? void 0 : options.fps) !==
        null && _a !== void 0
        ? _a
        : 10;
    const quality =
      (_b =
        options === null || options === void 0 ? void 0 : options.quality) !==
        null && _b !== void 0
        ? _b
        : 70;
    const apiBase =
      (_c =
        options === null || options === void 0 ? void 0 : options.apiBase) !==
        null && _c !== void 0
        ? _c
        : "http://localhost:2138";
    const endpointPath =
      (_d =
        options === null || options === void 0 ? void 0 : options.endpoint) !==
        null && _d !== void 0
        ? _d
        : "/api/stream/frame";
    const endpoint = `${apiBase}${endpointPath}`;
    const interval = Math.round(1000 / fps);
    this._frameCaptureActive = true;
    this._frameCaptureSkipping = false;
    if (options === null || options === void 0 ? void 0 : options.gameUrl) {
      // Offscreen window: use the `paint` event for reliable frame capture
      console.log(
        `[ScreenCapture] Creating offscreen game window for ${options.gameUrl}`,
      );
      this._frameCaptureWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          offscreen: true,
        },
      });
      this._frameCaptureWindow.webContents.setFrameRate(fps);
      // Use the `paint` event — the correct API for offscreen rendering.
      // capturePage() doesn't work on offscreen windows on macOS.
      let framesSent = 0;
      this._frameCaptureWindow.webContents.on(
        "paint",
        (_event, _dirty, image) => {
          if (!this._frameCaptureActive) return;
          if (this._frameCaptureSkipping) return;
          this._frameCaptureSkipping = true;
          try {
            const jpeg = image.toJPEG(quality);
            if (jpeg.length > 100) {
              // Skip tiny/blank frames
              const req = electron_1.net.request({
                method: "POST",
                url: endpoint,
              });
              req.setHeader("Content-Type", "image/jpeg");
              req.on("error", () => {}); // Ignore network errors
              req.end(jpeg);
              framesSent++;
              if (framesSent % 100 === 0) {
                console.log(
                  `[ScreenCapture] Sent ${framesSent} frames (paint event)`,
                );
              }
            }
          } catch (_a) {
            // Skip frame on error
          } finally {
            this._frameCaptureSkipping = false;
          }
        },
      );
      await this._frameCaptureWindow.loadURL(options.gameUrl);
      console.log(
        `[ScreenCapture] Offscreen game window loaded, paint events active at ${fps}fps`,
      );
    } else {
      // Main window: use capturePage() with timer
      const captureTarget =
        this._captureTarget && !this._captureTarget.isDestroyed()
          ? this._captureTarget
          : this.mainWindow;
      if (!captureTarget) throw new Error("Main window not available");
      console.log(
        `[ScreenCapture] Starting frame capture at ${fps}fps → ${endpoint}`,
      );
      this._frameCaptureTimer = setInterval(async () => {
        if (this._frameCaptureSkipping) return;
        if (!this._frameCaptureActive || captureTarget.isDestroyed()) {
          this.stopFrameCapture();
          return;
        }
        this._frameCaptureSkipping = true;
        try {
          const image = await captureTarget.webContents.capturePage();
          const jpeg = image.toJPEG(quality);
          const req = electron_1.net.request({ method: "POST", url: endpoint });
          req.setHeader("Content-Type", "image/jpeg");
          req.on("error", () => {});
          req.end(jpeg);
        } catch (_a) {
          // Skip frame on error
        } finally {
          this._frameCaptureSkipping = false;
        }
      }, interval);
    }
  }
  stopFrameCapture() {
    if (this._frameCaptureTimer) {
      clearInterval(this._frameCaptureTimer);
      this._frameCaptureTimer = null;
    }
    if (this._frameCaptureWindow && !this._frameCaptureWindow.isDestroyed()) {
      this._frameCaptureWindow.close();
      this._frameCaptureWindow = null;
    }
    this._frameCaptureActive = false;
    this._frameCaptureSkipping = false;
    this._frameCaptureOptions = null;
    console.log("[ScreenCapture] Frame capture stopped");
  }
  isFrameCaptureActive() {
    return this._frameCaptureActive;
  }
  /**
   * Clean up all resources
   */
  dispose() {
    this.stopFrameCapture();
    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      this.recordingWindow.webContents
        .executeJavaScript(`
          if (window._scrStream) window._scrStream.getTracks().forEach(t => t.stop());
          if (window._scrMR && window._scrMR.state !== 'inactive') window._scrMR.stop();
        `)
        .catch(() => {});
      this.recordingWindow.close();
      this.recordingWindow = null;
    }
    this._recordingState = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
  }
}
exports.ScreenCaptureManager = ScreenCaptureManager;
// ── Singleton ───────────────────────────────────────────────────────────────
let screenCaptureManager = null;
function getScreenCaptureManager() {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager();
  }
  return screenCaptureManager;
}
// ── IPC registration ────────────────────────────────────────────────────────
/**
 * Register Screen Capture IPC handlers (screenshot + recording)
 */
function registerScreenCaptureIPC() {
  const m = getScreenCaptureManager();
  // Existing screenshot handlers
  electron_1.ipcMain.handle("screencapture:getSources", async () =>
    m.getSources(),
  );
  electron_1.ipcMain.handle(
    "screencapture:takeScreenshot",
    async (_e, options) => m.takeScreenshot(options),
  );
  electron_1.ipcMain.handle("screencapture:captureWindow", async () =>
    m.captureWindow(),
  );
  electron_1.ipcMain.handle(
    "screencapture:saveScreenshot",
    async (_e, screenshot, filename) => m.saveScreenshot(screenshot, filename),
  );
  // Recording handlers
  electron_1.ipcMain.handle(
    "screencapture:startRecording",
    async (_e, options) => m.startRecording(options),
  );
  electron_1.ipcMain.handle("screencapture:stopRecording", async () =>
    m.stopRecording(),
  );
  electron_1.ipcMain.handle("screencapture:pauseRecording", async () =>
    m.pauseRecording(),
  );
  electron_1.ipcMain.handle("screencapture:resumeRecording", async () =>
    m.resumeRecording(),
  );
  electron_1.ipcMain.handle("screencapture:getRecordingState", async () =>
    m.getRecordingState(),
  );
  electron_1.ipcMain.handle(
    "screencapture:startFrameCapture",
    async (_e, options) => m.startFrameCapture(options),
  );
  electron_1.ipcMain.handle("screencapture:stopFrameCapture", async () =>
    m.stopFrameCapture(),
  );
  electron_1.ipcMain.handle("screencapture:isFrameCaptureActive", async () =>
    m.isFrameCaptureActive(),
  );
}
