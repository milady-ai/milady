"use strict";
/**
 * Whisper.cpp Native Module for Electron
 *
 * Provides offline speech-to-text with word-level timing data using whisper.cpp
 * via Node.js native bindings (whisper-node or similar).
 *
 * Features:
 * - Offline STT (no internet required)
 * - Word-level timestamps for wake word detection gap analysis
 * - Multiple model sizes (tiny, base, small, medium, large)
 * - Multilingual support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhisperStreamTranscriber = exports.WhisperSTT = void 0;
exports.getWhisperInstance = getWhisperInstance;
exports.disposeWhisperInstance = disposeWhisperInstance;
const tslib_1 = require("tslib");
const node_events_1 = require("node:events");
const node_fs_1 = tslib_1.__importDefault(require("node:fs"));
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const electron_1 = require("electron");
// Try to load whisper bindings dynamically
let whisperModule = null;
async function loadWhisperModule() {
  var _a;
  // Try different whisper binding packages
  const packages = [
    "whisper-node",
    "@nicksellen/whisper-node",
    "whisper.cpp",
    "@nicksellen/whispercpp",
  ];
  for (const pkg of packages) {
    try {
      // Dynamic import for native module
      const mod = await Promise.resolve(`${pkg}`).then((s) =>
        tslib_1.__importStar(require(s)),
      );
      const bindings = (_a = mod.default) !== null && _a !== void 0 ? _a : mod;
      if (bindings === null || bindings === void 0 ? void 0 : bindings.init) {
        console.log(`[Whisper] Loaded bindings from ${pkg}`);
        return bindings;
      }
      console.log(`[Whisper] Package ${pkg} loaded but has no init function`);
    } catch (err) {
      // Expected for packages that aren't installed - only log at debug level
      const message = err instanceof Error ? err.message : String(err);
      if (
        !message.includes("Cannot find module") &&
        !message.includes("MODULE_NOT_FOUND")
      ) {
        console.warn(`[Whisper] Failed to load ${pkg}:`, message);
      }
    }
  }
  console.warn(
    "[Whisper] No whisper.cpp bindings found. Install whisper-node for offline STT.",
  );
  return null;
}
/**
 * WhisperSTT - Offline speech-to-text engine
 */
class WhisperSTT extends node_events_1.EventEmitter {
  constructor(config = {}) {
    super();
    this.context = null;
    this.isInitialized = false;
    this.isProcessing = false;
    this.config = Object.assign(
      { modelSize: "base", language: "en", threads: 4 },
      config,
    );
  }
  /**
   * Initialize Whisper with the specified model
   */
  async initialize() {
    if (this.isInitialized) return true;
    if (!whisperModule) {
      whisperModule = await loadWhisperModule();
    }
    if (!whisperModule) {
      this.emit("error", { message: "Whisper bindings not available" });
      return false;
    }
    const modelPath = this.getModelPath();
    if (!modelPath || !node_fs_1.default.existsSync(modelPath)) {
      this.emit("error", { message: `Model not found: ${modelPath}` });
      return false;
    }
    try {
      this.context = await whisperModule.init(modelPath, {
        language: this.config.language,
        translate: this.config.translate,
        threads: this.config.threads,
        speed_up: this.config.speedUp,
      });
      this.isInitialized = true;
      this.emit("initialized");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initialize Whisper";
      this.emit("error", { message });
      return false;
    }
  }
  /**
   * Get the model file path
   */
  getModelPath() {
    if (this.config.modelPath) {
      return this.config.modelPath;
    }
    const modelName = `ggml-${this.config.modelSize}.bin`;
    const possiblePaths = [
      // App resources
      node_path_1.default.join(
        electron_1.app.getAppPath(),
        "models",
        modelName,
      ),
      // User data directory
      node_path_1.default.join(
        electron_1.app.getPath("userData"),
        "models",
        modelName,
      ),
      // Common system locations
      node_path_1.default.join(
        process.env.HOME || "",
        ".cache",
        "whisper",
        modelName,
      ),
      node_path_1.default.join("/usr/local/share/whisper", modelName),
    ];
    for (const p of possiblePaths) {
      if (node_fs_1.default.existsSync(p)) {
        return p;
      }
    }
    return possiblePaths[1]; // Default to userData path
  }
  /**
   * Get the path where models should be downloaded
   */
  getModelsDirectory() {
    return node_path_1.default.join(
      electron_1.app.getPath("userData"),
      "models",
    );
  }
  /**
   * Check if a model is available
   */
  isModelAvailable(size) {
    const modelName = `ggml-${size || this.config.modelSize}.bin`;
    const modelPath = node_path_1.default.join(
      this.getModelsDirectory(),
      modelName,
    );
    return node_fs_1.default.existsSync(modelPath);
  }
  /**
   * Transcribe an audio file
   */
  async transcribeFile(audioPath) {
    var _a;
    if (!this.context) {
      const initialized = await this.initialize();
      if (!initialized) return null;
    }
    if (this.isProcessing) {
      return null;
    }
    this.isProcessing = true;
    this.emit("processing", { path: audioPath });
    try {
      const result = await ((_a = this.context) === null || _a === void 0
        ? void 0
        : _a.transcribe(audioPath, {
            token_timestamps: true,
            word_timestamps: true,
          }));
      const whisperResult = this.convertResult(result);
      this.emit("result", whisperResult);
      return whisperResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transcription failed";
      this.emit("error", { message });
      return null;
    } finally {
      this.isProcessing = false;
    }
  }
  /**
   * Transcribe audio from a Float32Array buffer (16kHz mono PCM)
   */
  async transcribeBuffer(audioBuffer) {
    var _a;
    if (!this.context) {
      const initialized = await this.initialize();
      if (!initialized) return null;
    }
    if (this.isProcessing) {
      return null;
    }
    this.isProcessing = true;
    this.emit("processing", { bufferLength: audioBuffer.length });
    try {
      const result = await ((_a = this.context) === null || _a === void 0
        ? void 0
        : _a.transcribeBuffer(audioBuffer, {
            token_timestamps: true,
            word_timestamps: true,
          }));
      const whisperResult = this.convertResult(result);
      this.emit("result", whisperResult);
      return whisperResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Transcription failed";
      this.emit("error", { message });
      return null;
    } finally {
      this.isProcessing = false;
    }
  }
  /**
   * Convert native result to our format
   */
  convertResult(native) {
    const segments = native.segments.map((seg) => {
      var _a;
      return {
        text: seg.text.trim(),
        start: seg.t0,
        end: seg.t1,
        tokens:
          (_a = seg.tokens) === null || _a === void 0
            ? void 0
            : _a.map((tok) => ({
                text: tok.text,
                start: tok.t0,
                end: tok.t1,
                probability: tok.p,
              })),
      };
    });
    const duration =
      segments.length > 0 ? segments[segments.length - 1].end : 0;
    return {
      text: native.text.trim(),
      segments,
      language: native.language || this.config.language || "en",
      duration,
    };
  }
  /**
   * Clean up resources
   */
  dispose() {
    if (this.context) {
      this.context.free();
      this.context = null;
    }
    this.isInitialized = false;
    this.removeAllListeners();
  }
}
exports.WhisperSTT = WhisperSTT;
/**
 * Continuous audio stream transcription using Whisper
 */
class WhisperStreamTranscriber extends node_events_1.EventEmitter {
  constructor(whisper, config) {
    var _a, _b, _c, _d, _e;
    super();
    this.bufferPosition = 0;
    this.lastActiveTime = 0;
    this.isListening = false;
    this.processingInterval = null;
    this.whisper = whisper;
    // Apply defaults, allowing per-instance configuration
    this.sampleRate =
      (_a =
        config === null || config === void 0 ? void 0 : config.sampleRate) !==
        null && _a !== void 0
        ? _a
        : 16000;
    this.minChunkDuration =
      (_b =
        config === null || config === void 0
          ? void 0
          : config.minChunkDuration) !== null && _b !== void 0
        ? _b
        : 1.0;
    this.maxChunkDuration =
      (_c =
        config === null || config === void 0
          ? void 0
          : config.maxChunkDuration) !== null && _c !== void 0
        ? _c
        : 30.0;
    this.silenceThreshold =
      (_d =
        config === null || config === void 0
          ? void 0
          : config.silenceThreshold) !== null && _d !== void 0
        ? _d
        : 0.01;
    this.silenceDuration =
      (_e =
        config === null || config === void 0
          ? void 0
          : config.silenceDuration) !== null && _e !== void 0
        ? _e
        : 0.5;
    this.audioBuffer = new Float32Array(
      this.sampleRate * this.maxChunkDuration,
    );
  }
  /**
   * Start continuous listening
   */
  async start() {
    if (this.isListening) return;
    const initialized = await this.whisper.initialize();
    if (!initialized) {
      throw new Error("Failed to initialize Whisper");
    }
    this.isListening = true;
    this.bufferPosition = 0;
    this.lastActiveTime = Date.now();
    // Check for silence periodically
    this.processingInterval = setInterval(() => {
      this.checkAndProcess();
    }, 200);
    this.emit("started");
  }
  /**
   * Stop listening
   */
  stop() {
    this.isListening = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    // Process any remaining audio
    if (this.bufferPosition > this.sampleRate * this.minChunkDuration) {
      this.processCurrentBuffer().catch((err) => {
        console.error("[Whisper] Error processing final buffer on stop:", err);
        this.emit("error", {
          message:
            err instanceof Error
              ? err.message
              : "Final buffer processing failed",
        });
      });
    }
    this.emit("stopped");
  }
  /**
   * Feed audio samples (Float32Array, 16kHz mono)
   */
  feedAudio(samples) {
    if (!this.isListening) return;
    // Check for voice activity
    let maxLevel = 0;
    for (const sample of samples) {
      maxLevel = Math.max(maxLevel, Math.abs(sample));
    }
    if (maxLevel > this.silenceThreshold) {
      this.lastActiveTime = Date.now();
    }
    // Add to buffer
    const remaining = this.audioBuffer.length - this.bufferPosition;
    const toCopy = Math.min(samples.length, remaining);
    this.audioBuffer.set(samples.subarray(0, toCopy), this.bufferPosition);
    this.bufferPosition += toCopy;
    // If buffer is full, process immediately
    if (this.bufferPosition >= this.audioBuffer.length) {
      this.processCurrentBuffer().catch((err) => {
        console.error("[Whisper] Error processing full buffer:", err);
        this.emit("error", {
          message:
            err instanceof Error ? err.message : "Buffer processing failed",
        });
      });
    }
  }
  /**
   * Check if we should process based on silence detection
   */
  checkAndProcess() {
    if (!this.isListening) return;
    const timeSinceActive = (Date.now() - this.lastActiveTime) / 1000;
    const bufferDuration = this.bufferPosition / this.sampleRate;
    // Process if we have enough audio and detected silence
    if (
      bufferDuration >= this.minChunkDuration &&
      timeSinceActive >= this.silenceDuration
    ) {
      this.processCurrentBuffer().catch((err) => {
        console.error(
          "[Whisper] Error processing buffer on silence detection:",
          err,
        );
        this.emit("error", {
          message:
            err instanceof Error
              ? err.message
              : "Silence-triggered processing failed",
        });
      });
    }
  }
  /**
   * Process the current audio buffer
   */
  async processCurrentBuffer() {
    if (this.bufferPosition === 0) return;
    const chunk = this.audioBuffer.slice(0, this.bufferPosition);
    this.bufferPosition = 0;
    const result = await this.whisper.transcribeBuffer(chunk);
    if (result === null || result === void 0 ? void 0 : result.text.trim()) {
      this.emit("transcript", result);
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
exports.WhisperStreamTranscriber = WhisperStreamTranscriber;
// Export singleton for easy use
let defaultWhisper = null;
function getWhisperInstance(config) {
  if (!defaultWhisper) {
    defaultWhisper = new WhisperSTT(config);
  }
  return defaultWhisper;
}
function disposeWhisperInstance() {
  if (defaultWhisper) {
    defaultWhisper.dispose();
    defaultWhisper = null;
  }
}
