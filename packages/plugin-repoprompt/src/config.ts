import { z } from 'zod';

export const DEFAULT_ALLOWED_COMMANDS = [
  'context_builder',
  'read_file',
  'file_search',
  'tree',
] as const;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;
const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 5 * 60_000;
const MIN_OUTPUT_CHARS = 256;
const MAX_OUTPUT_CHARS = 250_000;

const allowedCommandsSchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value): string[] => {
    if (!value) {
      return [...DEFAULT_ALLOWED_COMMANDS];
    }

    const parsed = Array.isArray(value) ? value : value.split(',');
    const normalized = parsed
      .map((command) => normalizeCommandName(command))
      .filter((command) => command.length > 0);

    if (normalized.length === 0) {
      return [...DEFAULT_ALLOWED_COMMANDS];
    }

    return Array.from(new Set(normalized));
  });

export const repopromptConfigSchema = z.object({
  REPOPROMPT_CLI_PATH: z.string().trim().min(1).default('rp-cli'),
  REPOPROMPT_DEFAULT_WINDOW: z.string().trim().min(1).optional(),
  REPOPROMPT_DEFAULT_TAB: z.string().trim().min(1).optional(),
  REPOPROMPT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_TIMEOUT_MS)
    .max(MAX_TIMEOUT_MS)
    .default(DEFAULT_TIMEOUT_MS),
  REPOPROMPT_MAX_OUTPUT_CHARS: z.coerce
    .number()
    .int()
    .min(MIN_OUTPUT_CHARS)
    .max(MAX_OUTPUT_CHARS)
    .default(DEFAULT_MAX_OUTPUT_CHARS),
  REPOPROMPT_ALLOWED_COMMANDS: allowedCommandsSchema,
});

export interface RepoPromptConfig {
  cliPath: string;
  defaultWindow?: string;
  defaultTab?: string;
  timeoutMs: number;
  maxOutputChars: number;
  allowedCommands: string[];
}

export function normalizeCommandName(command: string): string {
  return command.trim().replace(/^--?/, '').toLowerCase();
}

export function isCommandAllowed(command: string, allowedCommands: string[]): boolean {
  const normalizedCommand = normalizeCommandName(command);
  if (!normalizedCommand) {
    return false;
  }

  return allowedCommands.some((allowed) => {
    const normalizedAllowed = normalizeCommandName(allowed);
    return normalizedAllowed === '*' || normalizedAllowed === 'all' || normalizedAllowed === normalizedCommand;
  });
}

export function loadRepoPromptConfig(
  raw: Record<string, string | undefined>
): RepoPromptConfig {
  const parsed = repopromptConfigSchema.parse(raw);

  return {
    cliPath: parsed.REPOPROMPT_CLI_PATH,
    defaultWindow: parsed.REPOPROMPT_DEFAULT_WINDOW,
    defaultTab: parsed.REPOPROMPT_DEFAULT_TAB,
    timeoutMs: parsed.REPOPROMPT_TIMEOUT_MS,
    maxOutputChars: parsed.REPOPROMPT_MAX_OUTPUT_CHARS,
    allowedCommands:
      parsed.REPOPROMPT_ALLOWED_COMMANDS && parsed.REPOPROMPT_ALLOWED_COMMANDS.length > 0
        ? parsed.REPOPROMPT_ALLOWED_COMMANDS
        : [...DEFAULT_ALLOWED_COMMANDS],
  };
}

let pendingConfig: RepoPromptConfig | null = null;

export function setPendingConfig(config: RepoPromptConfig): void {
  pendingConfig = config;
}

export function getPendingConfig(): RepoPromptConfig | null {
  return pendingConfig;
}
