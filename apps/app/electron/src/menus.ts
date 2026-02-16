import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { MenuItem } from 'electron';

export interface ShareTargetPayload {
  source: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ name: string; path?: string }>;
}

export type RendererDispatcher = (eventName: string, detail?: unknown) => void;

export function createMiladyTrayMenuTemplate(): Array<MenuItem | MenuItemConstructorOptions> {
  return [new MenuItem({ label: 'Quit App', role: 'quit' })];
}

export function createMiladyAppMenuBarTemplate(dispatchRendererEvent: RendererDispatcher): Array<MenuItem | MenuItemConstructorOptions> {
  return [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    {
      label: 'Workspace',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+Shift+Alt+N',
          click: () => dispatchRendererEvent('milady:app-command', { command: 'open-notes-new' }),
        },
        { type: 'separator' },
        {
          label: 'Notes',
          submenu: [
            {
              label: 'Open Notes (Edit)',
              accelerator: 'CmdOrCtrl+Shift+N',
              click: () => dispatchRendererEvent('milady:open-notes-panel', { mode: 'edit' }),
            },
            {
              label: 'Open Notes (Split)',
              accelerator: 'CmdOrCtrl+Shift+U',
              click: () => dispatchRendererEvent('milady:app-command', { command: 'open-notes-split' }),
            },
            {
              label: 'Open Notes (Preview)',
              accelerator: 'CmdOrCtrl+Shift+V',
              click: () => dispatchRendererEvent('milady:open-notes-panel', { mode: 'view' }),
            },
          ],
        },
        {
          label: 'Notes Templates',
          submenu: [
            {
              label: 'New Skill Draft',
              accelerator: 'CmdOrCtrl+Shift+K',
              click: () => dispatchRendererEvent('milady:app-command', {
                command: 'open-notes-with-seed',
                seedText: '## Skill Draft\n- Inputs:\n- Output:\n- Edge cases:\n',
              }),
            },
            {
              label: 'New Action Prompt',
              click: () => dispatchRendererEvent('milady:app-command', {
                command: 'open-notes-with-seed',
                seedText:
                  '## Action\n\nGoal:\n- Why now:\n- Inputs:\n- Expected output:\n',
              }),
            },
            {
              label: 'New Runbook Draft',
              click: () => dispatchRendererEvent('milady:app-command', {
                command: 'open-notes-with-seed',
                seedText:
                  '## Runbook\n\n## Trigger\n\n## Steps\n1.\n2.\n3.\n\n## Validation\n- [ ] \n',
              }),
            },
            {
              label: 'New Incident Log',
              click: () => dispatchRendererEvent('milady:app-command', {
                command: 'open-notes-with-seed',
                seedText:
                  '## Incident\n\n- Reported:\n- Impact:\n- Detection:\n- Resolution:\n- Next actions:\n',
              }),
            },
          ],
        },
      ],
    },
    {
      label: 'Actions',
      submenu: [
        {
          label: 'Open Custom Actions',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => dispatchRendererEvent('milady:app-command', { command: 'open-custom-actions-panel' }),
        },
        {
          label: 'Open Custom Actions Page',
          click: () => dispatchRendererEvent('milady:open-tab', { tab: 'actions' }),
        },
        {
          label: 'New Custom Action',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => dispatchRendererEvent('milady:app-command', { command: 'open-custom-action-editor' }),
        },
        {
          label: 'Generate Action from Prompt',
          click: () => dispatchRendererEvent('milady:app-command', {
            command: 'open-custom-action-editor-with-prompt',
            seedPrompt: 'Generate a custom action that does the following:',
          }),
        },
      ],
    },
    {
      label: 'Agent',
      submenu: [
        { label: 'Start Agent', accelerator: 'CmdOrCtrl+Alt+S', click: () => dispatchRendererEvent('milady:agent-control', { action: 'start' }) },
        { label: 'Pause Agent', accelerator: 'CmdOrCtrl+Alt+P', click: () => dispatchRendererEvent('milady:agent-control', { action: 'pause' }) },
        { label: 'Resume Agent', accelerator: 'CmdOrCtrl+Alt+R', click: () => dispatchRendererEvent('milady:agent-control', { action: 'resume' }) },
        { label: 'Stop Agent', accelerator: 'CmdOrCtrl+Alt+X', click: () => dispatchRendererEvent('milady:agent-control', { action: 'stop' }) },
        { label: 'Restart Agent', accelerator: 'CmdOrCtrl+Alt+T', click: () => dispatchRendererEvent('milady:agent-control', { action: 'restart' }) },
      ],
    },
    {
      label: 'Dashboard',
      submenu: [
        { label: 'Open Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => dispatchRendererEvent('milady:app-command', { command: 'open-command-palette' }) },
        { type: 'separator' },
        { label: 'Open Chat', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'chat' }) },
        { label: 'Open Character', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'character' }) },
        { label: 'Open Wallets', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'wallets' }) },
        { label: 'Open Knowledge', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'knowledge' }) },
        { label: 'Open Social', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'connectors' }) },
        { label: 'Open Apps', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'apps' }) },
        { label: 'Open Plugins', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'plugins' }) },
        { label: 'Open Skills', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'skills' }) },
        { label: 'Open Actions', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'actions' }) },
        { label: 'Open Logs', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'logs' }) },
        { label: 'Open Settings', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'settings' }) },
        { type: 'separator' },
        { label: 'Refresh Plugins', click: () => dispatchRendererEvent('milady:app-command', { command: 'refresh-plugins' }) },
        { label: 'Refresh Skills', click: () => dispatchRendererEvent('milady:app-command', { command: 'refresh-skills' }) },
        { label: 'Refresh Logs', click: () => dispatchRendererEvent('milady:app-command', { command: 'refresh-logs' }) },
        { label: 'Refresh Workbench', click: () => dispatchRendererEvent('milady:app-command', { command: 'refresh-workbench' }) },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Open Database', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'database' }) },
        { label: 'Open Runtime', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'runtime' }) },
        { label: 'Open Triggers', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'triggers' }) },
        { label: 'Open Fine-Tuning', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'fine-tuning' }) },
        { label: 'Open Trajectories', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'trajectories' }) },
        { label: 'Open Advanced', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'advanced' }) },
        { label: 'Open Voice', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'voice' }) },
        { label: 'Open Inventory', click: () => dispatchRendererEvent('milady:open-tab', { tab: 'wallets' }) },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];
}

export function dispatchRendererEventToWindow(mainWindow: BrowserWindow | null, eventName: string, detail?: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('milady:ipc-event', eventName, detail);
}

export async function dispatchShareTargetToWindow(mainWindow: BrowserWindow | null, payload: ShareTargetPayload): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('milady:share-target', payload);
}
