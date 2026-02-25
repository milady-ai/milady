"use strict";
/**
 * Camera Native Module for Electron
 *
 * Uses a hidden BrowserWindow renderer for getUserMedia / MediaRecorder access,
 * since these Web APIs require a renderer context.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraManager = void 0;
exports.getCameraManager = getCameraManager;
exports.registerCameraIPC = registerCameraIPC;
const tslib_1 = require("tslib");
const promises_1 = require("node:fs/promises");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const electron_1 = require("electron");
const VIDEO_BITRATE = {
  low: 1000000,
  medium: 2500000,
  high: 5000000,
  highest: 8000000,
};
// ── Manager ─────────────────────────────────────────────────────────────────
/**
 * Camera Manager – orchestrates webcam access through a hidden renderer window.
 */
class CameraManager {
  constructor() {
    this.rendererWindow = null;
  }
  setMainWindow(_window) {
    // Reserved for parity with other native managers.
  }
  // ── Renderer lifecycle ──────────────────────────────────────────────────
  /** Create (or reuse) the hidden renderer that hosts the camera stream. */
  async ensureRenderer() {
    if (this.rendererWindow && !this.rendererWindow.isDestroyed()) {
      return this.rendererWindow;
    }
    this.rendererWindow = new electron_1.BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    // Auto-approve media-permission requests coming from *this* hidden window
    this.rendererWindow.webContents.session.setPermissionRequestHandler(
      (_wc, permission, callback) => {
        callback(permission === "media");
      },
    );
    const html = `<!DOCTYPE html><html><head><title>CameraRenderer</title></head>
<body>
<video id="preview" autoplay playsinline muted style="display:none"></video>
<canvas id="cap" style="display:none"></canvas>
</body></html>`;
    await this.rendererWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    return this.rendererWindow;
  }
  // ── Device enumeration ──────────────────────────────────────────────────
  async getDevices() {
    const renderer = await this.ensureRenderer();
    const devices = await renderer.webContents.executeJavaScript(`
      (async () => {
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
          tmp.getTracks().forEach(t => t.stop());
        } catch (_) { /* permission denied or no camera */ }

        const all = await navigator.mediaDevices.enumerateDevices();
        return all
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || 'Camera ' + (i + 1),
            direction: d.label.toLowerCase().includes('front') ? 'front'
              : d.label.toLowerCase().includes('back') ? 'back' : 'external',
            hasFlash: false,
            hasZoom: false,
            maxZoom: 1,
            supportedResolutions: [],
            supportedFrameRates: [15, 24, 30, 60],
          }));
      })()
    `);
    return { devices };
  }
  // ── Preview (stream) ───────────────────────────────────────────────────
  async startPreview(options) {
    const renderer = await this.ensureRenderer();
    const cfg = JSON.stringify({
      deviceId:
        options === null || options === void 0 ? void 0 : options.deviceId,
      width: options === null || options === void 0 ? void 0 : options.width,
      height: options === null || options === void 0 ? void 0 : options.height,
      frameRate:
        options === null || options === void 0 ? void 0 : options.frameRate,
    });
    const result = await renderer.webContents.executeJavaScript(`
      (async () => {
        const o = ${cfg};
        const vc = {};
        if (o.deviceId) vc.deviceId = { exact: o.deviceId };
        if (o.width)    vc.width    = { ideal: o.width };
        if (o.height)   vc.height   = { ideal: o.height };
        if (o.frameRate) vc.frameRate = { ideal: o.frameRate };

        if (window._camStream) window._camStream.getTracks().forEach(t => t.stop());
        window._camStream = await navigator.mediaDevices.getUserMedia({ video: vc });

        const vt = window._camStream.getVideoTracks()[0];
        const s = vt.getSettings();
        const vid = document.getElementById('preview');
        vid.srcObject = window._camStream;
        await vid.play();
        return { width: s.width || 640, height: s.height || 480, deviceId: s.deviceId || vt.id };
      })()
    `);
    return result;
  }
  async stopPreview() {
    if (!this.rendererWindow || this.rendererWindow.isDestroyed()) return;
    await this.rendererWindow.webContents.executeJavaScript(`
      (() => {
        if (window._camStream) { window._camStream.getTracks().forEach(t => t.stop()); window._camStream = null; }
        const v = document.getElementById('preview'); if (v) v.srcObject = null;
      })()
    `);
  }
  async switchCamera(options) {
    return this.startPreview({ deviceId: options.deviceId });
  }
  // ── Photo capture ─────────────────────────────────────────────────────
  async capturePhoto(options) {
    var _a, _b;
    const renderer = await this.ensureRenderer();
    const cfg = JSON.stringify({
      quality:
        (_a =
          options === null || options === void 0 ? void 0 : options.quality) !==
          null && _a !== void 0
          ? _a
          : 92,
      format:
        (_b =
          options === null || options === void 0 ? void 0 : options.format) !==
          null && _b !== void 0
          ? _b
          : "jpeg",
      width: options === null || options === void 0 ? void 0 : options.width,
      height: options === null || options === void 0 ? void 0 : options.height,
    });
    const result = await renderer.webContents.executeJavaScript(`
      (async () => {
        const o = ${cfg};
        const vid = document.getElementById('preview');
        if (!vid || !vid.srcObject) throw new Error('No active camera stream');

        const c = document.getElementById('cap');
        const w = o.width || vid.videoWidth;
        const h = o.height || vid.videoHeight;
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(vid, 0, 0, w, h);

        const mime = o.format === 'png' ? 'image/png' : o.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const url = c.toDataURL(mime, o.quality / 100);
        return { base64: url.split(',')[1], format: o.format, width: w, height: h };
      })()
    `);
    return result;
  }
  // ── Video recording ───────────────────────────────────────────────────
  async startRecording(options) {
    var _a, _b, _c;
    const renderer = await this.ensureRenderer();
    const bitrate =
      (_a =
        options === null || options === void 0 ? void 0 : options.bitrate) !==
        null && _a !== void 0
        ? _a
        : VIDEO_BITRATE[
            (_b =
              options === null || options === void 0
                ? void 0
                : options.quality) !== null && _b !== void 0
              ? _b
              : "medium"
          ];
    const cfg = JSON.stringify({
      audio:
        (_c =
          options === null || options === void 0 ? void 0 : options.audio) !==
          null && _c !== void 0
          ? _c
          : false,
      bitrate,
      maxDuration:
        options === null || options === void 0 ? void 0 : options.maxDuration,
    });
    await renderer.webContents.executeJavaScript(`
      (async () => {
        const o = ${cfg};
        if (!window._camStream) throw new Error('No active camera stream – call startPreview first');

        let stream = window._camStream;
        if (o.audio) {
          try {
            const as = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream = new MediaStream([...stream.getVideoTracks(), ...as.getAudioTracks()]);
          } catch (_) { /* mic unavailable */ }
        }

        window._recChunks = [];
        window._recStart = Date.now();
        window._isRec = true;

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9' : 'video/webm';
        window._mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: o.bitrate });
        window._mr.ondataavailable = e => { if (e.data.size > 0) window._recChunks.push(e.data); };
        window._mr.start(1000);

        if (o.maxDuration) {
          window._recTimeout = setTimeout(() => {
            if (window._mr && window._mr.state === 'recording') { window._mr.stop(); window._isRec = false; }
          }, o.maxDuration * 1000);
        }
      })()
    `);
  }
  async stopRecording() {
    const renderer = await this.ensureRenderer();
    const tempDir = node_path_1.default.join(
      electron_1.app.getPath("temp"),
      "milady-camera",
    );
    await (0, promises_1.mkdir)(tempDir, { recursive: true });
    const filePath = node_path_1.default.join(
      tempDir,
      `recording-${Date.now()}.webm`,
    );
    const result = await renderer.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        if (!window._mr) { reject(new Error('No active recording')); return; }
        if (window._recTimeout) { clearTimeout(window._recTimeout); window._recTimeout = null; }

        window._mr.onstop = () => {
          const blob = new Blob(window._recChunks, { type: window._mr.mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            const dur = (Date.now() - window._recStart) / 1000;
            const vid = document.getElementById('preview');
            resolve({
              base64: b64,
              duration: dur,
              width: vid ? vid.videoWidth : 0,
              height: vid ? vid.videoHeight : 0,
              fileSize: blob.size,
              mimeType: window._mr.mimeType,
            });
            window._recChunks = []; window._mr = null; window._isRec = false;
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        };
        window._mr.stop();
      })
    `);
    const buffer = Buffer.from(result.base64, "base64");
    await (0, promises_1.writeFile)(filePath, buffer);
    return {
      path: filePath,
      duration: result.duration,
      width: result.width,
      height: result.height,
      fileSize: result.fileSize,
      mimeType: result.mimeType,
    };
  }
  async getRecordingState() {
    if (!this.rendererWindow || this.rendererWindow.isDestroyed()) {
      return { isRecording: false, duration: 0, fileSize: 0 };
    }
    return this.rendererWindow.webContents.executeJavaScript(`
      (() => {
        const on = !!window._isRec;
        const dur = on ? (Date.now() - (window._recStart || Date.now())) / 1000 : 0;
        const sz = (window._recChunks || []).reduce((s, c) => s + c.size, 0);
        return { isRecording: on, duration: dur, fileSize: sz };
      })()
    `);
  }
  // ── Permissions ───────────────────────────────────────────────────────
  async checkPermissions() {
    const renderer = await this.ensureRenderer();
    return renderer.webContents.executeJavaScript(`
      (async () => {
        try {
          const cam = await navigator.permissions.query({ name: 'camera' });
          const mic = await navigator.permissions.query({ name: 'microphone' });
          return { camera: cam.state, microphone: mic.state };
        } catch (_) { return { camera: 'prompt', microphone: 'prompt' }; }
      })()
    `);
  }
  async requestPermissions() {
    const renderer = await this.ensureRenderer();
    return renderer.webContents.executeJavaScript(`
      (async () => {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          s.getTracks().forEach(t => t.stop());
          return { camera: 'granted', microphone: 'granted' };
        } catch (_) { return { camera: 'denied', microphone: 'denied' }; }
      })()
    `);
  }
  dispose() {
    if (this.rendererWindow && !this.rendererWindow.isDestroyed()) {
      this.rendererWindow.webContents
        .executeJavaScript(`
          if (window._camStream) window._camStream.getTracks().forEach(t => t.stop());
          if (window._mr && window._mr.state !== 'inactive') window._mr.stop();
        `)
        .catch(() => {});
      this.rendererWindow.close();
      this.rendererWindow = null;
    }
  }
}
exports.CameraManager = CameraManager;
// ── Singleton & IPC ─────────────────────────────────────────────────────────
let cameraManager = null;
function getCameraManager() {
  if (!cameraManager) {
    cameraManager = new CameraManager();
  }
  return cameraManager;
}
function registerCameraIPC() {
  const m = getCameraManager();
  electron_1.ipcMain.handle("camera:getDevices", async () => m.getDevices());
  electron_1.ipcMain.handle("camera:startPreview", async (_e, opts) =>
    m.startPreview(opts),
  );
  electron_1.ipcMain.handle("camera:stopPreview", async () => m.stopPreview());
  electron_1.ipcMain.handle("camera:switchCamera", async (_e, opts) =>
    m.switchCamera(opts),
  );
  electron_1.ipcMain.handle("camera:capturePhoto", async (_e, opts) =>
    m.capturePhoto(opts),
  );
  electron_1.ipcMain.handle("camera:startRecording", async (_e, opts) =>
    m.startRecording(opts),
  );
  electron_1.ipcMain.handle("camera:stopRecording", async () =>
    m.stopRecording(),
  );
  electron_1.ipcMain.handle("camera:getRecordingState", async () =>
    m.getRecordingState(),
  );
  electron_1.ipcMain.handle("camera:checkPermissions", async () =>
    m.checkPermissions(),
  );
  electron_1.ipcMain.handle("camera:requestPermissions", async () =>
    m.requestPermissions(),
  );
}
