import { describe, expect, test, vi } from "vitest";
import { TelegramAccountClient } from "./telegramAccountClient";

function createRuntime() {
  return {
    agentId: "agent-1",
    character: { name: "Milady" },
    registerSendHandler: vi.fn(),
  } as const;
}

function createConfig() {
  return {
    TELEGRAM_ACCOUNT_PHONE: "+15551234567",
    TELEGRAM_ACCOUNT_APP_ID: 12345,
    TELEGRAM_ACCOUNT_APP_HASH: "api-hash",
    TELEGRAM_ACCOUNT_DEVICE_MODEL: "Milady Desktop",
    TELEGRAM_ACCOUNT_SYSTEM_VERSION: "macOS test",
  } as const;
}

function createAccount() {
  return {
    id: { toString: () => "1" },
    username: "shaw",
    firstName: "Shaw",
    lastName: null,
    phone: "15551234567",
  };
}

describe("TelegramAccountClient", () => {
  test("starts from an existing saved session without interactive login", async () => {
    const connect = vi.fn(async () => undefined);
    const checkAuthorization = vi.fn(async () => true);
    const getEntity = vi.fn(async () => createAccount());
    const addEventHandler = vi.fn();
    const saveSessionString = vi.fn();
    const createTelegramClient = vi.fn(
      () =>
        ({
          session: { save: () => "saved-session" },
          connect,
          checkAuthorization,
          getEntity,
          addEventHandler,
          disconnect: vi.fn(async () => undefined),
        }) as never,
    );

    const service = new TelegramAccountClient(
      createRuntime() as never,
      createConfig(),
      {
        createTelegramClient,
        loadSessionString: () => "persisted-session",
        saveSessionString,
      },
    );

    await (
      service as unknown as { startService: () => Promise<void> }
    ).startService();

    expect(createTelegramClient).toHaveBeenCalledWith(
      createConfig(),
      "persisted-session",
    );
    expect(connect).toHaveBeenCalledOnce();
    expect(checkAuthorization).toHaveBeenCalledOnce();
    expect(getEntity).toHaveBeenCalledWith("me");
    expect(addEventHandler).toHaveBeenCalledOnce();
    expect(saveSessionString).toHaveBeenCalledWith("saved-session");
    expect(service.isConnected()).toBe(true);
    expect(service.getAccountSummary()).toMatchObject({
      id: "1",
      username: "shaw",
      firstName: "Shaw",
    });
  });

  test("fails fast when no saved session exists", async () => {
    const createTelegramClient = vi.fn();
    const service = new TelegramAccountClient(
      createRuntime() as never,
      createConfig(),
      {
        createTelegramClient,
        loadSessionString: () => "",
        saveSessionString: vi.fn(),
      },
    );

    await expect(
      (service as unknown as { startService: () => Promise<void> }).startService(),
    ).rejects.toThrow(
      "Telegram account session is missing. Complete Telegram account login in connector setup first.",
    );

    expect(createTelegramClient).not.toHaveBeenCalled();
  });

  test("fails fast when the saved session is no longer authorized", async () => {
    const disconnect = vi.fn(async () => undefined);
    const createTelegramClient = vi.fn(
      () =>
        ({
          session: { save: () => "saved-session" },
          connect: vi.fn(async () => undefined),
          checkAuthorization: vi.fn(async () => false),
          disconnect,
          addEventHandler: vi.fn(),
        }) as never,
    );
    const service = new TelegramAccountClient(
      createRuntime() as never,
      createConfig(),
      {
        createTelegramClient,
        loadSessionString: () => "persisted-session",
        saveSessionString: vi.fn(),
      },
    );

    await expect(
      (service as unknown as { startService: () => Promise<void> }).startService(),
    ).rejects.toThrow(
      "Telegram account session is no longer authorized. Reconnect the Telegram account from connector setup.",
    );

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
