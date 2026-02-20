import { beforeEach, describe, expect, it } from 'bun:test';
import type { IAgentRuntime } from '@elizaos/core';
import { getPendingConfig } from '../config.ts';
import { repopromptPlugin } from '../plugin.ts';

const runtime = {} as IAgentRuntime;

describe('repopromptPlugin', () => {
  beforeEach(() => {
    delete process.env.REPOPROMPT_CLI_PATH;
    delete process.env.REPOPROMPT_TIMEOUT_MS;
    delete process.env.REPOPROMPT_ALLOWED_COMMANDS;
  });

  it('exposes expected plugin metadata and wiring', () => {
    expect(repopromptPlugin.name).toBe('repoprompt');
    expect(repopromptPlugin.description).toContain('RepoPrompt CLI integration');
    expect(repopromptPlugin.services?.length).toBe(1);
    expect(repopromptPlugin.actions?.[0]?.name).toBe('REPOPROMPT_RUN');
    expect(repopromptPlugin.providers?.[0]?.name).toBe('REPOPROMPT_STATUS');
    expect(repopromptPlugin.routes?.length).toBe(2);
  });

  it('initializes config and stores pending service config', async () => {
    if (!repopromptPlugin.init) {
      throw new Error('repopromptPlugin.init missing');
    }

    await repopromptPlugin.init(
      {
        REPOPROMPT_CLI_PATH: '/usr/local/bin/rp-cli',
        REPOPROMPT_TIMEOUT_MS: '30000',
        REPOPROMPT_ALLOWED_COMMANDS: 'context_builder,read_file',
      },
      runtime
    );

    const pending = getPendingConfig();
    expect(pending).not.toBeNull();
    expect(pending?.cliPath).toBe('/usr/local/bin/rp-cli');
    expect(pending?.timeoutMs).toBe(30_000);
    expect(pending?.allowedCommands).toEqual(['context_builder', 'read_file']);
    expect(process.env.REPOPROMPT_CLI_PATH).toBe('/usr/local/bin/rp-cli');
  });

  it('throws a config error when values are invalid', async () => {
    if (!repopromptPlugin.init) {
      throw new Error('repopromptPlugin.init missing');
    }

    await expect(
      repopromptPlugin.init(
        {
          REPOPROMPT_TIMEOUT_MS: '10',
        },
        runtime
      )
    ).rejects.toThrow('configuration error');
  });
});
