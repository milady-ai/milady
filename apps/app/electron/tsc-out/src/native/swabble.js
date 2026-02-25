"use strict";
/**
 * Swabble Native Module for Electron
 *
 * Wake word detection and speech-to-text using Whisper.cpp
 * with full word-level timing for postGap analysis.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwabbleManager = void 0;
exports.getSwabbleManager = getSwabbleManager;
exports.registerSwabbleIPC = registerSwabbleIPC;
const node_events_1 = require("node:events");
const electron_1 = require("electron");
const whisper_1 = require("./whisper");
/**
 * Wake Word Gate with timing-based detection
 */
class WakeWordGate {
  constructor(config) {
    var _a, _b;
    this.triggers = config.triggers.map((t) => t.toLowerCase().trim());
    this.minPostTriggerGap =
      (_a = config.minPostTriggerGap) !== null && _a !== void 0 ? _a : 0.45;
    this.minCommandLength =
      (_b = config.minCommandLength) !== null && _b !== void 0 ? _b : 1;
  }
  updateConfig(config) {
    if (config.triggers) {
      this.triggers = config.triggers.map((t) => t.toLowerCase().trim());
    }
    if (config.minPostTriggerGap !== undefined) {
      this.minPostTriggerGap = config.minPostTriggerGap;
    }
    if (config.minCommandLength !== undefined) {
      this.minCommandLength = config.minCommandLength;
    }
  }
  /**
   * Match wake word in Whisper result using timing data
   */
  match(result) {
    const segments = result.segments;
    if (segments.length === 0) return null;
    // Build word list with timing
    const words = [];
    for (const segment of segments) {
      if (segment.tokens) {
        // Use token-level timing if available
        for (const token of segment.tokens) {
          const text = token.text.trim().toLowerCase();
          if (text) {
            words.push({ text, start: token.start, end: token.end });
          }
        }
      } else {
        // Fall back to segment-level timing
        const segWords = segment.text.split(/\s+/).filter((w) => w.trim());
        const duration = segment.end - segment.start;
        const wordDuration = duration / Math.max(segWords.length, 1);
        for (let i = 0; i < segWords.length; i++) {
          words.push({
            text: segWords[i].toLowerCase(),
            start: segment.start + i * wordDuration,
            end: segment.start + (i + 1) * wordDuration,
          });
        }
      }
    }
    // Find trigger phrase in words
    for (const trigger of this.triggers) {
      const triggerWords = trigger.split(/\s+/);
      const triggerMatch = this.findTriggerMatch(words, triggerWords);
      if (triggerMatch) {
        const { triggerEndIndex, triggerEndTime } = triggerMatch;
        // Check for command words after trigger
        const commandWords = words.slice(triggerEndIndex + 1);
        if (commandWords.length < this.minCommandLength) continue;
        // Calculate post-trigger gap
        const firstCommandTime = commandWords[0].start;
        const postGap = (firstCommandTime - triggerEndTime) / 1000; // Convert to seconds
        // Check if gap meets minimum requirement
        if (postGap < this.minPostTriggerGap) continue;
        const command = commandWords.map((w) => w.text).join(" ");
        return {
          wakeWord: trigger,
          command,
          transcript: result.text,
          postGap,
        };
      }
    }
    return null;
  }
  findTriggerMatch(words, triggerWords) {
    for (let i = 0; i <= words.length - triggerWords.length; i++) {
      let matches = true;
      for (let j = 0; j < triggerWords.length; j++) {
        if (!this.fuzzyMatch(words[i + j].text, triggerWords[j])) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const endIndex = i + triggerWords.length - 1;
        return {
          triggerEndIndex: endIndex,
          triggerEndTime: words[endIndex].end,
        };
      }
    }
    return null;
  }
  fuzzyMatch(word, target) {
    // Exact match
    if (word === target) return true;
    // Allow for common transcription variations
    const variations = {
      milady: ["melody", "milady", "my lady", "malady"],
      alexa: ["alexia", "alexis"],
      hey: ["hay", "hi"],
      ok: ["okay", "o.k."],
    };
    const targetVariations = variations[target] || [];
    return targetVariations.includes(word);
  }
}
/**
 * Swabble Manager - Wake word detection with Whisper
 */
class SwabbleManager extends node_events_1.EventEmitter {
  constructor() {
    super(...arguments);
    this.mainWindow = null;
    this.config = null;
    this.wakeGate = null;
    this.whisper = null;
    this.whisperStream = null;
    this.isActive = false;
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  /**
   * Start wake word detection
   */
  async start(options) {
    var _a;
    if (this.isActive) {
      return { started: true };
    }
    this.config = options.config;
    this.wakeGate = new WakeWordGate(options.config);
    // Initialize Whisper
    try {
      this.whisper = new whisper_1.WhisperSTT({
        modelSize: options.config.modelSize || "base",
        language:
          ((_a = options.config.locale) === null || _a === void 0
            ? void 0
            : _a.split("-")[0]) || "en",
      });
      const initialized = await this.whisper.initialize();
      if (!initialized) {
        return {
          started: false,
          error:
            "Whisper not available. Install whisper-node and download a model for offline wake word detection.",
        };
      }
      this.whisperStream = new whisper_1.WhisperStreamTranscriber(this.whisper);
      this.setupWhisperListeners();
      await this.whisperStream.start();
      this.isActive = true;
      this.sendToRenderer("swabble:stateChange", { state: "listening" });
      return { started: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start Swabble";
      return { started: false, error: message };
    }
  }
  setupWhisperListeners() {
    if (!this.whisperStream) return;
    this.whisperStream.on("transcript", (result) => {
      // Convert to our segment format
      const segments = result.segments.map((seg) => ({
        text: seg.text,
        start: seg.start / 1000,
        duration: (seg.end - seg.start) / 1000,
        isFinal: true,
      }));
      // Send transcript event
      this.sendToRenderer("swabble:transcript", {
        transcript: result.text,
        segments,
        isFinal: true,
      });
      this.emit("transcript", {
        transcript: result.text,
        segments,
        isFinal: true,
      });
      // Check for wake word
      if (this.wakeGate) {
        const match = this.wakeGate.match(result);
        if (match) {
          this.sendToRenderer("swabble:wakeWord", match);
          this.emit("wakeWord", match);
        }
      }
    });
    this.whisperStream.on("started", () => {
      this.sendToRenderer("swabble:stateChange", { state: "listening" });
    });
    this.whisperStream.on("stopped", () => {
      this.sendToRenderer("swabble:stateChange", { state: "idle" });
    });
  }
  /**
   * Stop wake word detection
   */
  async stop() {
    this.isActive = false;
    if (this.whisperStream) {
      this.whisperStream.stop();
      this.whisperStream.dispose();
      this.whisperStream = null;
    }
    if (this.whisper) {
      this.whisper.dispose();
      this.whisper = null;
    }
    this.sendToRenderer("swabble:stateChange", { state: "idle" });
  }
  /**
   * Check if listening
   */
  isListening() {
    return this.isActive;
  }
  /**
   * Get current config
   */
  getConfig() {
    return this.config;
  }
  /**
   * Update configuration
   */
  updateConfig(config) {
    var _a;
    if (this.config) {
      this.config = Object.assign(Object.assign({}, this.config), config);
      (_a = this.wakeGate) === null || _a === void 0
        ? void 0
        : _a.updateConfig(config);
    }
  }
  /**
   * Check if Whisper is available
   */
  isWhisperAvailable() {
    return this.whisper !== null;
  }
  feedAudio(samples) {
    if (this.whisperStream && this.isActive) {
      this.whisperStream.feedAudio(samples);
    }
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
exports.SwabbleManager = SwabbleManager;
// Singleton instance
let swabbleManager = null;
function getSwabbleManager() {
  if (!swabbleManager) {
    swabbleManager = new SwabbleManager();
  }
  return swabbleManager;
}
/**
 * Register Swabble IPC handlers
 */
function registerSwabbleIPC() {
  const manager = getSwabbleManager();
  electron_1.ipcMain.handle("swabble:start", async (_e, options) => {
    return manager.start(options);
  });
  electron_1.ipcMain.handle("swabble:stop", async () => {
    return manager.stop();
  });
  electron_1.ipcMain.handle("swabble:isListening", () => {
    return { listening: manager.isListening() };
  });
  electron_1.ipcMain.handle("swabble:getConfig", () => {
    return { config: manager.getConfig() };
  });
  electron_1.ipcMain.handle("swabble:updateConfig", (_e, options) => {
    return manager.updateConfig(options.config);
  });
  electron_1.ipcMain.handle("swabble:isWhisperAvailable", () => {
    return { available: manager.isWhisperAvailable() };
  });
  electron_1.ipcMain.on("swabble:audioChunk", (_e, payload) => {
    const samples =
      payload instanceof Float32Array ? payload : new Float32Array(payload);
    manager.feedAudio(samples);
  });
}
