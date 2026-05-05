import {
  type Plugin,
  type IAgentRuntime,
  Service,
  ModelType,
  logger,
} from '@elizaos/core';
import { spawn, execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';

const WAKE_PHRASES = [
  'hey fisbat', 'hey fishbat', 'hey fish bat', 'hey fis bat',
  'hey fizbat', 'hey fizzbat', 'hey fizz bat', 'hey fizbet',
  'hey fizz', 'hey fiz', 'fizzbet', 'fizzbat', 'fizzbot',
  'fizzbait', 'fizzbeth', 'fiszbeth',
  'fisbot', 'fiz bat', 'fizbet', 'fizbat', 'fisbet',
  'fisbat', 'fishbat', 'fish bat', 'is bat',
  'fizz', 'fiz',
];

const WHISPER_MODEL_PATH = '/Users/binkyfishai/.whisper-models/ggml-small.en.bin';
const FISH_AUDIO_API = 'https://api.fish.audio/v1/tts';
const FISH_VOICE_MODEL = '49a14da3b65848e18e351dfc9540d7a6';
const SAMPLE_RATE = 16000;
const TMP_DIR = '/tmp/fisbat-voice';

type VoiceState = 'waiting_for_wake' | 'listening' | 'processing';

class VoiceAssistantService extends Service {
  static serviceType = 'voice-assistant';
  capabilityDescription = 'Always-on voice assistant with wake word detection, Whisper STT, and Fish Audio TTS.';

  private state: VoiceState = 'waiting_for_wake';
  private recording: any = null;
  private enabled = false;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; text: string; time: number }> = [];
  private readonly MAX_HISTORY = 20;
  private readonly HISTORY_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  }

  static async start(runtime: IAgentRuntime) {
    logger.info('*** Starting Voice Assistant service ***');
    const service = new VoiceAssistantService(runtime);
    if (process.env.FISBAT_VOICE_DISABLED === '1') {
      logger.info('[Fisbat Voice] Disabled for headless runtime');
      return service;
    }
    service.startListening();
    return service;
  }

  static async stop(runtime: IAgentRuntime) {
    const service = runtime.getService(VoiceAssistantService.serviceType) as VoiceAssistantService;
    if (service) service.stopListening();
  }

  async stop() { this.stopListening(); }

  private startListening() {
    this.enabled = true;
    logger.info('[Fisbat Voice] Always-on listening started (small.en model)');
    this.listenLoop().catch((err) => {
      logger.error({ error: err }, '[Fisbat Voice] Listen loop crashed');
    });
  }

  private stopListening() {
    this.enabled = false;
    if (this.recording) {
      try { this.recording.kill(); } catch {}
      this.recording = null;
    }
  }

  private async listenLoop() {
    while (this.enabled) {
      try {
        if (this.state === 'waiting_for_wake') {
          const audioPath = await this.recordChunk(4);
          const text = await this.transcribe(audioPath);
          this.cleanupFile(audioPath);

          const afterWake = this.matchesWakeWord(text);
          if (afterWake !== null) {
            logger.info({ text, afterWake }, '[Fisbat Voice] Wake word detected!');

            if (afterWake.length > 2) {
              this.state = 'processing';
              await this.processPrompt(afterWake);
              this.state = 'waiting_for_wake';
            } else {
              this.state = 'listening';
              await this.playAcknowledge();
            }
          }
        } else if (this.state === 'listening') {
          const audioPath = await this.recordUntilSilence(10);
          const text = await this.transcribe(audioPath);
          this.cleanupFile(audioPath);

          if (text.trim().length > 2) {
            this.state = 'processing';
            await this.processPrompt(text.trim());
          } else {
            logger.info('[Fisbat Voice] No speech detected, going back to sleep.');
          }
          this.state = 'waiting_for_wake';
        }
      } catch (err) {
        logger.error({ error: err }, '[Fisbat Voice] Error in listen loop');
        this.state = 'waiting_for_wake';
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  private recordChunk(durationSec: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const outPath = `${TMP_DIR}/wake_${Date.now()}.wav`;
      const proc = spawn('sox', [
        '-d', '-r', String(SAMPLE_RATE), '-c', '1', '-b', '16',
        outPath, 'trim', '0', String(durationSec),
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      this.recording = proc;
      proc.on('close', () => {
        this.recording = null;
        existsSync(outPath) ? resolve(outPath) : reject(new Error('Recording failed'));
      });
      proc.on('error', (err) => { this.recording = null; reject(err); });
    });
  }

  private recordUntilSilence(maxDurationSec: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const outPath = `${TMP_DIR}/prompt_${Date.now()}.wav`;
      const proc = spawn('sox', [
        '-d', '-r', String(SAMPLE_RATE), '-c', '1', '-b', '16',
        outPath,
        'silence', '1', '0.1', '3%',
        '1', '1.5', '3%',
        'trim', '0', String(maxDurationSec),
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      this.recording = proc;
      const timeout = setTimeout(() => { try { proc.kill(); } catch {} }, (maxDurationSec + 2) * 1000);

      proc.on('close', () => {
        clearTimeout(timeout);
        this.recording = null;
        existsSync(outPath) ? resolve(outPath) : reject(new Error('Recording failed'));
      });
      proc.on('error', (err) => { clearTimeout(timeout); this.recording = null; reject(err); });
    });
  }

  private transcribe(audioPath: string): Promise<string> {
    return new Promise((resolve) => {
      let stdout = '';
      const proc = spawn('whisper-cli', [
        '-m', WHISPER_MODEL_PATH,
        '-f', audioPath,
        '--no-timestamps',
        '-l', 'en',
        '-t', '4',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });

      const timeout = setTimeout(() => { try { proc.kill(); } catch {}; resolve(''); }, 15000);

      proc.on('close', () => {
        clearTimeout(timeout);
        const text = stdout.trim();
        // Filter out common whisper hallucinations on silence
        const dominated = /^\(.*\)$/.test(text) || /^\[.*\]$/.test(text);
        if (text.length > 0 && !dominated) {
          logger.info({ text }, '[Fisbat Voice] Heard');
        }
        resolve(dominated ? '' : text);
      });

      proc.on('error', () => { clearTimeout(timeout); resolve(''); });
    });
  }

  private async executeAction(action: any): Promise<string | null> {
    switch (action.action) {
      case 'write_file': {
        if (!action.path || !action.content) return null;
        const dir = path.dirname(action.path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(action.path, action.content, 'utf-8');
        logger.info({ path: action.path }, '[Fisbat Voice] Wrote file');
        const name = action.path.split('/').pop();
        return `Done, I saved ${name} to ${action.path}`;
      }
      case 'read_file': {
        if (!action.path) return null;
        if (!existsSync(action.path)) return `I couldn't find that file at ${action.path}`;
        const content = readFileSync(action.path, 'utf-8');
        logger.info({ path: action.path, length: content.length }, '[Fisbat Voice] Read file');
        if (content.length > 500) {
          const summary = await this.runtime.useModel(ModelType.TEXT_LARGE, {
            prompt: `Summarize this file content very briefly for a voice response (2-3 sentences max):\n\n${content.substring(0, 2000)}`,
            temperature: 0.5,
            maxTokens: 150,
          });
          return typeof summary === 'string' ? summary.trim() : content.substring(0, 200);
        }
        return `Here's what's in the file: ${content}`;
      }
      case 'shell': {
        if (!action.command) return null;
        logger.info({ command: action.command }, '[Fisbat Voice] Running shell command');
        try {
          const output = execSync(action.command, { timeout: 15000, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
          const trimmed = output.trim();
          if (trimmed.length > 500) {
            const summary = await this.runtime.useModel(ModelType.TEXT_LARGE, {
              prompt: `Summarize this command output very briefly for a voice response (2-3 sentences max):\n\nCommand: ${action.command}\nOutput:\n${trimmed.substring(0, 2000)}`,
              temperature: 0.5,
              maxTokens: 150,
            });
            return typeof summary === 'string' ? summary.trim() : `Command ran successfully. Output was ${trimmed.length} characters.`;
          }
          return trimmed.length > 0 ? `Here's the result: ${trimmed}` : 'Done, command ran successfully.';
        } catch (err: any) {
          return `The command failed: ${err.message?.substring(0, 100) || 'unknown error'}`;
        }
      }
      case 'open': {
        if (!action.target) return null;
        logger.info({ target: action.target }, '[Fisbat Voice] Opening');
        try {
          execSync(`open "${action.target.replace(/"/g, '\\"')}"`, { timeout: 5000 });
          return `Opening ${action.target.includes('google.com/search') ? 'search results' : action.target.split('/').pop() || action.target}`;
        } catch {
          return `I couldn't open that.`;
        }
      }
      default:
        return null;
    }
  }

  private matchesWakeWord(text: string): string | null {
    const lower = text.toLowerCase().replace(/[^a-z ]/g, '');
    for (const pattern of WAKE_PHRASES) {
      const idx = lower.indexOf(pattern);
      if (idx !== -1) {
        return lower.substring(idx + pattern.length).trim();
      }
    }
    return null;
  }

  private async processPrompt(prompt: string) {
    logger.info({ prompt }, '[Fisbat Voice] Processing prompt');
    try {
      // Prune old history
      const now = Date.now();
      this.conversationHistory = this.conversationHistory.filter(
        h => now - h.time < this.HISTORY_EXPIRY_MS
      );
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }

      // Build conversation context
      const historyText = this.conversationHistory.length > 0
        ? '\n\nConversation history:\n' + this.conversationHistory.map(
            h => `${h.role === 'user' ? 'User' : 'Fisbat'}: ${h.text}`
          ).join('\n')
        : '';

      this.conversationHistory.push({ role: 'user', text: prompt, time: now });

      const response = await this.runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: `You are Fisbat, a voice assistant running on the user's Mac (macOS). You remember previous conversations and can perform actions on the computer.${historyText}

The user just said: "${prompt}"

You can perform these actions by responding with ONLY a JSON block (no other text):

1. Write/create files:
\`\`\`json
{"action":"write_file","path":"/Users/binkyfishai/Desktop/example.md","content":"file content here"}
\`\`\`

2. Read files:
\`\`\`json
{"action":"read_file","path":"/Users/binkyfishai/Desktop/example.md"}
\`\`\`

3. Run shell commands (ls, mkdir, cat, brew, git, python, etc):
\`\`\`json
{"action":"shell","command":"ls -la /Users/binkyfishai/Desktop"}
\`\`\`

4. Open apps, URLs, or files:
\`\`\`json
{"action":"open","target":"https://google.com"}
\`\`\`
\`\`\`json
{"action":"open","target":"/Applications/Safari.app"}
\`\`\`

5. Search the web (opens in browser):
\`\`\`json
{"action":"open","target":"https://www.google.com/search?q=your+search+query"}
\`\`\`

The user's home directory is /Users/binkyfishai. Default to saving files on the Desktop unless told otherwise.

For conversational responses, keep it to 1-2 sentences max. Be direct. No fluff. Do not use markdown formatting since this will be spoken aloud.`,
        temperature: 0.7,
        maxTokens: 300,
      });

      if (response && typeof response === 'string' && response.trim().length > 0) {
        const trimmed = response.trim();
        logger.info({ response: trimmed.substring(0, 200) }, '[Fisbat Voice] Got response');

        // Check if response contains an action
        const jsonMatch = trimmed.match(/```json\s*(\{[\s\S]*?\})\s*```/) || trimmed.match(/(\{"action"\s*:\s*"[^"]+?"[\s\S]*?\})/);
        if (jsonMatch) {
          try {
            const action = JSON.parse(jsonMatch[1]);
            const result = await this.executeAction(action);
            if (result) {
              this.conversationHistory.push({ role: 'assistant', text: result, time: Date.now() });
              await this.speak(result);
              return;
            }
          } catch (e) {
            logger.error({ error: e }, '[Fisbat Voice] Failed to execute action');
          }
        }

        this.conversationHistory.push({ role: 'assistant', text: trimmed, time: Date.now() });
        await this.speak(trimmed);
      } else {
        await this.speak("Sorry, I didn't catch that.");
      }
    } catch (err) {
      logger.error({ error: err }, '[Fisbat Voice] Error processing prompt');
      await this.speak("Something went wrong, try again.");
    }
  }

  private async speak(text: string) {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) {
      try { execSync(`say "${text.replace(/"/g, '\\"')}"`, { timeout: 30000 }); } catch {}
      return;
    }

    try {
      const outPath = `${TMP_DIR}/tts_${Date.now()}.mp3`;
      const res = await fetch(FISH_AUDIO_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'model': 's2-pro',
        },
        body: JSON.stringify({
          text,
          reference_id: FISH_VOICE_MODEL,
          format: 'mp3',
          latency: 'balanced',
        }),
      });

      if (!res.ok) throw new Error(`Fish Audio: ${res.status}`);

      writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
      execSync(`afplay "${outPath}"`, { timeout: 60000 });
      try { unlinkSync(outPath); } catch {}
    } catch (err) {
      logger.error({ error: err }, '[Fisbat Voice] TTS failed, using say');
      try { execSync(`say "${text.replace(/"/g, '\\"')}"`, { timeout: 30000 }); } catch {}
    }
  }

  private playAcknowledge() {
    try { execSync('afplay /System/Library/Sounds/Pop.aiff', { timeout: 5000 }); } catch {}
  }

  private cleanupFile(filePath: string) {
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
  }
}

const voiceAssistantPlugin: Plugin = {
  name: 'voice-assistant',
  description: 'Always-on voice assistant with "Hey Fisbat" wake word, Whisper STT, and Fish Audio TTS',
  services: [VoiceAssistantService],
};

export default voiceAssistantPlugin;
