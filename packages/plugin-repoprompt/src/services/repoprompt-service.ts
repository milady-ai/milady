import { spawn } from 'node:child_process';
import { Service, type IAgentRuntime } from '@elizaos/core';
import {
  type RepoPromptConfig,
  getPendingConfig,
  isCommandAllowed,
  loadRepoPromptConfig,
  normalizeCommandName,
} from '../config.ts';

export interface RepoPromptRunInput {
  command?: string;
  args?: string[];
  window?: string | number;
  tab?: string;
  cwd?: string;
  stdin?: string;
}

export interface RepoPromptRunResult {
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface RepoPromptStatus {
  available: boolean;
  running: boolean;
  cliPath: string;
  defaultWindow?: string;
  defaultTab?: string;
  timeoutMs: number;
  maxOutputChars: number;
  allowedCommands: string[];
  lastRunAt?: number;
  lastExitCode?: number | null;
  lastDurationMs?: number;
  lastCommand?: string;
  lastError?: string;
}

function appendWithLimit(
  current: string,
  chunk: Buffer | string,
  limit: number
): { value: string; truncated: boolean } {
  if (current.length >= limit) {
    return { value: current, truncated: true };
  }

  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  const remaining = limit - current.length;

  if (text.length <= remaining) {
    return { value: current + text, truncated: false };
  }

  return {
    value: current + text.slice(0, remaining),
    truncated: true,
  };
}

function withTruncationSuffix(value: string, truncated: boolean): string {
  if (!truncated) {
    return value;
  }

  const suffix = '\n...[truncated by plugin-repoprompt]';
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

function cleanOptionalValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

export class RepoPromptService extends Service {
  static override serviceType = 'repoprompt';

  override capabilityDescription =
    'Run RepoPrompt CLI commands from actions and routes with timeout and allowlist safeguards.';

  private readonly runtimeConfig: RepoPromptConfig;
  private runQueue: Promise<unknown> = Promise.resolve();
  private running = false;
  private available = true;
  private lastRunAt?: number;
  private lastExitCode?: number | null;
  private lastDurationMs?: number;
  private lastCommand?: string;
  private lastError?: string;

  constructor(runtime?: IAgentRuntime, config?: RepoPromptConfig) {
    super(runtime);
    this.runtimeConfig = config ?? getPendingConfig() ?? loadRepoPromptConfig(process.env);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    return new RepoPromptService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(RepoPromptService.serviceType);
    if (service && 'stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    this.running = false;
  }

  getStatus(): RepoPromptStatus {
    return {
      available: this.available,
      running: this.running,
      cliPath: this.runtimeConfig.cliPath,
      defaultWindow: this.runtimeConfig.defaultWindow,
      defaultTab: this.runtimeConfig.defaultTab,
      timeoutMs: this.runtimeConfig.timeoutMs,
      maxOutputChars: this.runtimeConfig.maxOutputChars,
      allowedCommands: [...this.runtimeConfig.allowedCommands],
      lastRunAt: this.lastRunAt,
      lastExitCode: this.lastExitCode,
      lastDurationMs: this.lastDurationMs,
      lastCommand: this.lastCommand,
      lastError: this.lastError,
    };
  }

  async run(input: RepoPromptRunInput): Promise<RepoPromptRunResult> {
    const task = this.runQueue.then(
      () => this.executeRun(input),
      () => this.executeRun(input)
    );

    this.runQueue = task.then(
      () => undefined,
      () => undefined
    );

    return task;
  }

  private resolveCommand(input: RepoPromptRunInput): string {
    const explicit = cleanOptionalValue(input.command);
    if (explicit) {
      return normalizeCommandName(explicit);
    }

    const firstNonFlag = (input.args ?? []).find((arg) => !arg.startsWith('-'));
    const inferred = cleanOptionalValue(firstNonFlag);

    if (!inferred) {
      throw new Error(
        'RepoPrompt command missing. Provide `command`, or include a non-flag command token in `args`.'
      );
    }

    return normalizeCommandName(inferred);
  }

  private buildProcessArgs(input: RepoPromptRunInput): string[] {
    const args: string[] = [];

    const windowValue = input.window ?? this.runtimeConfig.defaultWindow;
    if (windowValue !== undefined && String(windowValue).trim().length > 0) {
      args.push('-w', String(windowValue).trim());
    }

    const tabValue = cleanOptionalValue(input.tab ?? this.runtimeConfig.defaultTab);
    if (tabValue) {
      args.push('-t', tabValue);
    }

    const explicitCommand = cleanOptionalValue(input.command);
    if (explicitCommand) {
      args.push(explicitCommand);
    }

    for (const arg of input.args ?? []) {
      args.push(String(arg));
    }

    return args;
  }

  private async executeRun(input: RepoPromptRunInput): Promise<RepoPromptRunResult> {
    const command = this.resolveCommand(input);
    if (!isCommandAllowed(command, this.runtimeConfig.allowedCommands)) {
      throw new Error(
        `RepoPrompt command "${command}" is not allowed. Allowed commands: ${this.runtimeConfig.allowedCommands.join(', ')}`
      );
    }

    const args = this.buildProcessArgs(input);
    const cwd = cleanOptionalValue(input.cwd) ?? process.cwd();

    this.running = true;
    this.lastCommand = command;

    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    try {
      const child = spawn(this.runtimeConfig.cliPath, args, {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      if (input.stdin) {
        child.stdin?.write(input.stdin);
      }
      child.stdin?.end();

      child.stdout?.on('data', (chunk) => {
        const next = appendWithLimit(stdout, chunk, this.runtimeConfig.maxOutputChars);
        stdout = next.value;
        stdoutTruncated = stdoutTruncated || next.truncated;
      });

      child.stderr?.on('data', (chunk) => {
        const next = appendWithLimit(stderr, chunk, this.runtimeConfig.maxOutputChars);
        stderr = next.value;
        stderrTruncated = stderrTruncated || next.truncated;
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore kill errors
        }

        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore kill errors
          }
        }, 250);
      }, this.runtimeConfig.timeoutMs);

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => resolve(code));
      }).finally(() => {
        clearTimeout(timeoutHandle);
      });

      if (timedOut) {
        const timeoutMessage = `RepoPrompt CLI timed out after ${this.runtimeConfig.timeoutMs}ms.`;
        const next = appendWithLimit(stderr, timeoutMessage, this.runtimeConfig.maxOutputChars);
        stderr = next.value;
        stderrTruncated = stderrTruncated || next.truncated;
      }

      const durationMs = Date.now() - startedAt;
      const ok = !timedOut && exitCode === 0;

      this.available = true;
      this.lastRunAt = startedAt;
      this.lastExitCode = exitCode;
      this.lastDurationMs = durationMs;
      this.lastError = ok ? undefined : stderr || `Process exited with code ${String(exitCode)}`;

      return {
        ok,
        command,
        args,
        exitCode,
        stdout: withTruncationSuffix(stdout, stdoutTruncated),
        stderr: withTruncationSuffix(stderr, stderrTruncated),
        durationMs,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastRunAt = startedAt;
      this.lastExitCode = null;
      this.lastDurationMs = Date.now() - startedAt;
      this.lastError = message;

      const maybeErrno = error as NodeJS.ErrnoException;
      if (maybeErrno?.code === 'ENOENT') {
        this.available = false;
      }

      throw error;
    } finally {
      this.running = false;
    }
  }
}
