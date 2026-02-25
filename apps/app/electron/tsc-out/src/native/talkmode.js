"use strict";
/**
 * TalkMode Native Module for Electron
 *
 * Provides full conversation mode with:
 * - Whisper.cpp STT (offline, word-level timing)
 * - ElevenLabs TTS streaming (high quality)
 * - Renderer audio capture via IPC (Whisper)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TalkModeManager = void 0;
exports.getTalkModeManager = getTalkModeManager;
exports.registerTalkModeIPC = registerTalkModeIPC;
const tslib_1 = require("tslib");
const node_events_1 = require("node:events");
const node_https_1 = tslib_1.__importDefault(require("node:https"));
const electron_1 = require("electron");
const whisper_1 = require("./whisper");
/**
 * ElevenLabs TTS streaming client
 */
class ElevenLabsTTS extends node_events_1.EventEmitter {
  constructor(apiKey, voiceId, modelId = "eleven_v3") {
    super();
    this.currentRequest = null;
    this.apiKey = apiKey;
    this.defaultVoiceId = voiceId;
    this.defaultModelId = modelId;
  }
  async speak(options) {
    var _a, _b;
    const text = options.text.trim();
    if (!text) {
      return { completed: true, interrupted: false, usedSystemTts: false };
    }
    const voiceId =
      ((_a = options.directive) === null || _a === void 0
        ? void 0
        : _a.voiceId) || this.defaultVoiceId;
    const modelId =
      ((_b = options.directive) === null || _b === void 0
        ? void 0
        : _b.modelId) || this.defaultModelId;
    return new Promise((resolve) => {
      var _a, _b, _c, _d, _f, _g;
      this.emit("speaking", { text, isSystemTts: false });
      const postData = JSON.stringify({
        text,
        model_id: modelId,
        output_format: "mp3_44100_128",
        voice_settings: {
          stability:
            (_b =
              (_a = options.directive) === null || _a === void 0
                ? void 0
                : _a.stability) !== null && _b !== void 0
              ? _b
              : 0.5,
          similarity_boost:
            (_d =
              (_c = options.directive) === null || _c === void 0
                ? void 0
                : _c.similarity) !== null && _d !== void 0
              ? _d
              : 0.75,
          speed:
            (_g =
              (_f = options.directive) === null || _f === void 0
                ? void 0
                : _f.speed) !== null && _g !== void 0
              ? _g
              : 1.0,
        },
      });
      const requestOptions = {
        hostname: "api.elevenlabs.io",
        port: 443,
        path: `/v1/text-to-speech/${voiceId}/stream`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
          "Content-Length": Buffer.byteLength(postData),
        },
      };
      const audioChunks = [];
      this.currentRequest = node_https_1.default.request(
        requestOptions,
        (res) => {
          if (res.statusCode !== 200) {
            resolve({
              completed: false,
              interrupted: false,
              usedSystemTts: false,
              error: `ElevenLabs API error: ${res.statusCode}`,
            });
            return;
          }
          res.on("data", (chunk) => {
            audioChunks.push(chunk);
            // Stream chunks to player as they arrive
            this.emit("audioChunk", chunk);
          });
          res.on("end", () => {
            const fullAudio = Buffer.concat(audioChunks);
            this.emit("audioComplete", fullAudio);
            this.emit("speakComplete", { completed: true });
            resolve({
              completed: true,
              interrupted: false,
              usedSystemTts: false,
            });
          });
          res.on("error", (error) => {
            resolve({
              completed: false,
              interrupted: false,
              usedSystemTts: false,
              error: error.message,
            });
          });
        },
      );
      this.currentRequest.on("error", (error) => {
        resolve({
          completed: false,
          interrupted: false,
          usedSystemTts: false,
          error: error.message,
        });
      });
      this.currentRequest.write(postData);
      this.currentRequest.end();
    });
  }
  stop() {
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }
  }
  updateConfig(apiKey, voiceId, modelId) {
    if (apiKey) this.apiKey = apiKey;
    if (voiceId) this.defaultVoiceId = voiceId;
    if (modelId) this.defaultModelId = modelId;
  }
}
/**
 * TalkMode Manager - orchestrates STT and TTS
 */
class TalkModeManager extends node_events_1.EventEmitter {
  constructor() {
    super(...arguments);
    this.mainWindow = null;
    this.config = {};
    this.state = "idle";
    this.statusText = "Off";
    this.whisper = null;
    this.whisperStream = null;
    this.elevenLabs = null;
    this.isEnabled = false;
    this.isSpeaking = false;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Start TalkMode
   */
  async start(options) {
    var _a, _b, _c, _d, _f;
    if (this.isEnabled) {
      return { started: true };
    }
    if (options === null || options === void 0 ? void 0 : options.config) {
      this.config = Object.assign(
        Object.assign({}, this.config),
        options.config,
      );
    }
    // Initialize Whisper STT
    const useWhisper =
      ((_a = this.config.stt) === null || _a === void 0
        ? void 0
        : _a.engine) !== "web";
    if (useWhisper) {
      try {
        this.whisper = new whisper_1.WhisperSTT({
          modelSize:
            ((_b = this.config.stt) === null || _b === void 0
              ? void 0
              : _b.modelSize) || "base",
          language:
            ((_c = this.config.stt) === null || _c === void 0
              ? void 0
              : _c.language) || "en",
        });
        const initialized = await this.whisper.initialize();
        if (!initialized) {
          this.sendToRenderer("talkmode:error", {
            code: "whisper_unavailable",
            message:
              "Whisper not available. Renderer should use Web Speech API.",
            recoverable: true,
          });
        } else {
          this.whisperStream = new whisper_1.WhisperStreamTranscriber(
            this.whisper,
          );
          this.setupWhisperListeners();
        }
      } catch (error) {
        console.warn("[TalkMode] Failed to initialize Whisper:", error);
        this.sendToRenderer("talkmode:error", {
          code: "whisper_init_failed",
          message:
            error instanceof Error ? error.message : "Whisper init failed",
          recoverable: true,
        });
      }
    }
    // Initialize ElevenLabs TTS
    if (
      ((_d = this.config.tts) === null || _d === void 0 ? void 0 : _d.apiKey) &&
      ((_f = this.config.tts) === null || _f === void 0 ? void 0 : _f.voiceId)
    ) {
      this.elevenLabs = new ElevenLabsTTS(
        this.config.tts.apiKey,
        this.config.tts.voiceId,
        this.config.tts.modelId,
      );
      this.setupTTSListeners();
    }
    this.isEnabled = true;
    this.setState("listening", "Listening");
    // Start audio capture if we have Whisper
    if (this.whisperStream) {
      await this.whisperStream.start();
    }
    return { started: true };
  }
  setupWhisperListeners() {
    if (!this.whisperStream) return;
    this.whisperStream.on("transcript", (result) => {
      this.sendToRenderer("talkmode:transcript", {
        transcript: result.text,
        isFinal: true,
      });
      this.emit("transcript", {
        transcript: result.text,
        isFinal: true,
      });
    });
    this.whisperStream.on("started", () => {
      this.setState("listening", "Listening (Whisper)");
    });
    this.whisperStream.on("stopped", () => {
      if (this.state === "listening") {
        this.setState("idle", "Off");
      }
    });
  }
  setupTTSListeners() {
    if (!this.elevenLabs) return;
    this.elevenLabs.on("speaking", (data) => {
      this.isSpeaking = true;
      this.setState("speaking", "Speaking");
      this.sendToRenderer("talkmode:speaking", data);
    });
    this.elevenLabs.on("speakComplete", (data) => {
      this.isSpeaking = false;
      this.setState("listening", "Listening");
      this.sendToRenderer("talkmode:speakComplete", data);
    });
    this.elevenLabs.on("audioChunk", (chunk) => {
      // Send audio chunks to renderer for playback
      this.sendToRenderer("talkmode:audioChunk", {
        chunk: chunk.toString("base64"),
      });
    });
    this.elevenLabs.on("audioComplete", (audio) => {
      this.sendToRenderer("talkmode:audioComplete", {
        audioBase64: audio.toString("base64"),
      });
    });
  }
  /**
   * Stop TalkMode
   */
  async stop() {
    this.isEnabled = false;
    if (this.whisperStream) {
      this.whisperStream.stop();
      this.whisperStream.dispose();
      this.whisperStream = null;
    }
    if (this.whisper) {
      this.whisper.dispose();
      this.whisper = null;
    }
    if (this.elevenLabs) {
      this.elevenLabs.stop();
      this.elevenLabs = null;
    }
    this.setState("idle", "Off");
  }
  /**
   * Speak text using TTS
   */
  async speak(options) {
    if (options.useSystemTts || !this.elevenLabs) {
      // Let renderer handle system TTS
      return {
        completed: false,
        interrupted: false,
        usedSystemTts: true,
        error: "Use renderer for system TTS",
      };
    }
    return this.elevenLabs.speak(options);
  }
  feedAudio(samples) {
    if (this.whisperStream && this.state === "listening") {
      this.whisperStream.feedAudio(samples);
    }
  }
  /**
   * Stop speaking
   */
  async stopSpeaking() {
    if (this.elevenLabs) {
      this.elevenLabs.stop();
    }
    this.isSpeaking = false;
    return {};
  }
  /**
   * Check if currently speaking
   */
  isSpeakingNow() {
    return this.isSpeaking;
  }
  /**
   * Get current state
   */
  getState() {
    return { state: this.state, statusText: this.statusText };
  }
  /**
   * Check if enabled
   */
  isEnabledNow() {
    return this.isEnabled;
  }
  /**
   * Update configuration
   */
  updateConfig(config) {
    this.config = Object.assign(Object.assign({}, this.config), config);
    if (config.tts && this.elevenLabs) {
      this.elevenLabs.updateConfig(
        config.tts.apiKey,
        config.tts.voiceId,
        config.tts.modelId,
      );
    }
  }
  /**
   * Check if Whisper is available
   */
  isWhisperAvailable() {
    return this.whisper !== null && this.whisperStream !== null;
  }
  /**
   * Get Whisper model info
   */
  getWhisperInfo() {
    var _a;
    if (!this.whisper) {
      return { available: false };
    }
    return {
      available: true,
      modelSize:
        ((_a = this.config.stt) === null || _a === void 0
          ? void 0
          : _a.modelSize) || "base",
    };
  }
  setState(state, statusText) {
    const previousState = this.state;
    this.state = state;
    this.statusText = statusText;
    this.sendToRenderer("talkmode:stateChange", {
      state,
      previousState,
      statusText,
    });
    this.emit("stateChange", { state, previousState, statusText });
  }
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
  /**
   * Clean up
   */
  dispose() {
    this.stop();
    this.removeAllListeners();
  }
}
exports.TalkModeManager = TalkModeManager;
// Singleton instance
let talkModeManager = null;
function getTalkModeManager() {
  if (!talkModeManager) {
    talkModeManager = new TalkModeManager();
  }
  return talkModeManager;
}
/**
 * Register TalkMode IPC handlers
 */
function registerTalkModeIPC() {
  const manager = getTalkModeManager();
  electron_1.ipcMain.handle("talkmode:start", async (_e, options) => {
    return manager.start(options);
  });
  electron_1.ipcMain.handle("talkmode:stop", async () => {
    return manager.stop();
  });
  electron_1.ipcMain.handle("talkmode:speak", async (_e, options) => {
    return manager.speak(options);
  });
  electron_1.ipcMain.handle("talkmode:stopSpeaking", async () => {
    return manager.stopSpeaking();
  });
  electron_1.ipcMain.handle("talkmode:isSpeaking", () => {
    return { speaking: manager.isSpeakingNow() };
  });
  electron_1.ipcMain.handle("talkmode:getState", () => {
    return manager.getState();
  });
  electron_1.ipcMain.handle("talkmode:isEnabled", () => {
    return { enabled: manager.isEnabledNow() };
  });
  electron_1.ipcMain.handle("talkmode:updateConfig", (_e, options) => {
    return manager.updateConfig(options.config);
  });
  electron_1.ipcMain.handle("talkmode:isWhisperAvailable", () => {
    return { available: manager.isWhisperAvailable() };
  });
  electron_1.ipcMain.handle("talkmode:getWhisperInfo", () => {
    return manager.getWhisperInfo();
  });
  electron_1.ipcMain.on("talkmode:audioChunk", (_e, payload) => {
    const samples =
      payload instanceof Float32Array ? payload : new Float32Array(payload);
    manager.feedAudio(samples);
  });
}
