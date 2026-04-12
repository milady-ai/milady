import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Api, type TelegramClient } from "telegram";
import { AuthKey } from "telegram/crypto/AuthKey";
import { StringSession } from "telegram/sessions";
import {
  TelegramAccountAuthSession,
  telegramAccountAuthStateExists,
  telegramAccountSessionExists,
} from "./telegram-account-auth";

function makeUser() {
  return new Api.User({
    id: BigInt(1),
    firstName: "Shaw",
    lastName: "",
    username: "shaw",
    phone: "15551234567",
  });
}

function makeAuthorization() {
  return new Api.auth.Authorization({
    setupPasswordRequired: false,
    otherwiseReloginDays: 0,
    tmpSessions: 0,
    user: makeUser(),
  });
}

async function makeSessionString(): Promise<string> {
  const session = new StringSession("");
  session.setDC(2, "149.154.167.50", 443);
  const authKey = new AuthKey();
  await authKey.setKey(Buffer.alloc(256, 1));
  session.authKey = authKey;
  return session.save();
}

describe("TelegramAccountAuthSession", () => {
  let previousStateDir = process.env.MILADY_STATE_DIR;
  let tempStateDir: string | null = null;

  afterEach(() => {
    if (typeof previousStateDir === "string") {
      process.env.MILADY_STATE_DIR = previousStateDir;
    } else {
      delete process.env.MILADY_STATE_DIR;
    }
    if (tempStateDir) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
      tempStateDir = null;
    }
    vi.restoreAllMocks();
    previousStateDir = process.env.MILADY_STATE_DIR;
  });

  function useTempStateDir(): string {
    tempStateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "milady-telegram-account-auth-"),
    );
    previousStateDir = process.env.MILADY_STATE_DIR;
    process.env.MILADY_STATE_DIR = tempStateDir;
    return tempStateDir;
  }

  test("restores a persisted provisioning step after restart", async () => {
    useTempStateDir();
    const persistedSessionString = await makeSessionString();
    const sendProvisioningCode = vi.fn(async () => "random-hash");
    const completeProvisioningLogin = vi.fn(async () => "stel-token");
    const getOrCreateProvisionedApp = vi.fn(async () => ({
      api_id: 12345,
      api_hash: "api-hash",
    }));
    const connect = vi.fn(async () => undefined);
    const checkAuthorization = vi.fn(async () => false);
    const sendCode = vi.fn(async () => ({
      phoneCodeHash: "phone-code-hash",
      isCodeViaApp: true,
    }));
    const disconnect = vi.fn(async () => undefined);
    const createTelegramClient = vi.fn(
      () =>
        ({
          session: { save: () => persistedSessionString },
          connect,
          checkAuthorization,
          sendCode,
          disconnect,
        }) as unknown as TelegramClient,
    );

    const session = new TelegramAccountAuthSession(
      {},
      {
        createTelegramClient,
        sendProvisioningCode,
        completeProvisioningLogin,
        getOrCreateProvisionedApp,
      },
    );

    await session.start({ phone: "+15551234567", credentials: null });
    expect(session.getSnapshot()).toMatchObject({
      status: "waiting_for_provisioning_code",
      phone: "+15551234567",
    });
    expect(telegramAccountAuthStateExists()).toBe(true);

    const restored = new TelegramAccountAuthSession(
      {},
      {
        createTelegramClient,
        sendProvisioningCode,
        completeProvisioningLogin,
        getOrCreateProvisionedApp,
      },
    );

    expect(restored.getSnapshot()).toMatchObject({
      status: "waiting_for_provisioning_code",
      phone: "+15551234567",
    });

    await restored.submit({ provisioningCode: "11111" });

    expect(completeProvisioningLogin).toHaveBeenCalledWith(
      "+15551234567",
      "random-hash",
      "11111",
    );
    expect(createTelegramClient).toHaveBeenCalledOnce();
    expect(restored.getSnapshot()).toMatchObject({
      status: "waiting_for_telegram_code",
      phone: "+15551234567",
      isCodeViaApp: true,
    });
    expect(telegramAccountSessionExists()).toBe(true);
  });

  test("restores a persisted telegram code step after restart", async () => {
    useTempStateDir();
    const pendingSessionString = await makeSessionString();
    const authorizedSessionString = await makeSessionString();

    const firstClient = {
      session: { save: () => pendingSessionString },
      connect: vi.fn(async () => undefined),
      checkAuthorization: vi.fn(async () => false),
      sendCode: vi.fn(async () => ({
        phoneCodeHash: "phone-code-hash",
        isCodeViaApp: false,
      })),
      disconnect: vi.fn(async () => undefined),
    } as unknown as TelegramClient;

    const secondClient = {
      session: { save: () => authorizedSessionString },
      connect: vi.fn(async () => undefined),
      invoke: vi.fn(async () => makeAuthorization()),
      disconnect: vi.fn(async () => undefined),
    } as unknown as TelegramClient;

    const createTelegramClient = vi
      .fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const session = new TelegramAccountAuthSession(
      {},
      {
        createTelegramClient: createTelegramClient as unknown as (
          session: import("telegram/sessions").StringSession,
          credentials: { apiId: number; apiHash: string },
          deviceModel: string,
          systemVersion: string,
        ) => TelegramClient,
      },
    );

    await session.start({
      phone: "+15551234567",
      credentials: { apiId: 12345, apiHash: "api-hash" },
    });

    expect(session.getSnapshot()).toMatchObject({
      status: "waiting_for_telegram_code",
      phone: "+15551234567",
      isCodeViaApp: false,
    });
    expect(telegramAccountSessionExists()).toBe(true);
    expect(telegramAccountAuthStateExists()).toBe(true);

    const restored = new TelegramAccountAuthSession(
      {},
      {
        createTelegramClient: createTelegramClient as unknown as (
          session: import("telegram/sessions").StringSession,
          credentials: { apiId: number; apiHash: string },
          deviceModel: string,
          systemVersion: string,
        ) => TelegramClient,
      },
    );

    await restored.submit({ telegramCode: "22222" });

    expect(secondClient.invoke).toHaveBeenCalledOnce();
    expect(restored.getSnapshot()).toMatchObject({
      status: "configured",
      phone: "+15551234567",
      account: {
        id: "1",
        username: "shaw",
      },
    });
    expect(telegramAccountAuthStateExists()).toBe(false);
  });
});
