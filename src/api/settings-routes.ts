/**
 * Post-onboarding settings routes.
 *
 * These handle configuration that was moved out of onboarding into the
 * settings UI: connectors, inventory/RPC, theme, and avatar.
 */

import type http from "node:http";
import { logger } from "@elizaos/core";
import {
  type MiladyConfig,
  saveMiladyConfig,
} from "../config/config";
import type { RouteRequestContext } from "./route-helpers";

export interface SettingsRouteState {
  config: MiladyConfig;
}

export interface SettingsRouteContext extends RouteRequestContext {
  state: SettingsRouteState;
  getInventoryProviderOptions: () => Array<{
    id: string;
    rpcProviders: Array<{ id: string; envKey?: string }>;
  }>;
}

export async function handleSettingsRoutes(
  ctx: SettingsRouteContext,
): Promise<boolean> {
  const { req, res, method, pathname, readJsonBody, json, error, state } = ctx;

  if (!pathname.startsWith("/api/settings/")) return false;

  // ── POST /api/settings/theme ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/settings/theme") {
    const body = await readJsonBody<{ theme?: string }>(req, res);
    if (!body) return true;

    const theme = body.theme;
    if (
      !theme ||
      !["milady", "qt314", "web2000", "programmer", "haxor", "psycho"].includes(
        theme,
      )
    ) {
      error(res, "Invalid theme", 400);
      return true;
    }

    if (!state.config.ui) state.config.ui = {};
    state.config.ui.theme = theme as MiladyConfig["ui"] extends { theme?: infer T } ? T : never;

    try {
      saveMiladyConfig(state.config);
    } catch (err) {
      logger.error(`[settings] Failed to save theme: ${err}`);
      error(res, "Failed to save theme", 500);
      return true;
    }

    json(res, { ok: true });
    return true;
  }

  // ── POST /api/settings/avatar ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/settings/avatar") {
    const body = await readJsonBody<{ avatar?: string }>(req, res);
    if (!body) return true;

    if (!state.config.ui) state.config.ui = {};
    if (!state.config.ui.assistant) state.config.ui.assistant = {};
    if (body.avatar !== undefined) {
      state.config.ui.assistant.avatar = body.avatar;
    }

    try {
      saveMiladyConfig(state.config);
    } catch (err) {
      logger.error(`[settings] Failed to save avatar: ${err}`);
      error(res, "Failed to save avatar", 500);
      return true;
    }

    json(res, { ok: true });
    return true;
  }

  // ── POST /api/settings/connectors ─────────────────────────────────────
  if (method === "POST" && pathname === "/api/settings/connectors") {
    const body = await readJsonBody<{
      telegramToken?: string;
      discordToken?: string;
      whatsappSessionPath?: string;
      twilioAccountSid?: string;
      twilioAuthToken?: string;
      twilioPhoneNumber?: string;
      blooioApiKey?: string;
      blooioPhoneNumber?: string;
    }>(req, res);
    if (!body) return true;

    const config = state.config;
    if (!config.connectors) config.connectors = {};
    if (!config.env) config.env = {};

    if (body.telegramToken?.trim()) {
      config.connectors.telegram = { botToken: body.telegramToken.trim() };
    }
    if (body.discordToken?.trim()) {
      config.connectors.discord = { token: body.discordToken.trim() };
    }
    if (body.whatsappSessionPath?.trim()) {
      config.connectors.whatsapp = {
        sessionPath: body.whatsappSessionPath.trim(),
      };
    }
    if (body.twilioAccountSid?.trim() && body.twilioAuthToken?.trim()) {
      (config.env as Record<string, string>).TWILIO_ACCOUNT_SID =
        body.twilioAccountSid.trim();
      (config.env as Record<string, string>).TWILIO_AUTH_TOKEN =
        body.twilioAuthToken.trim();
      process.env.TWILIO_ACCOUNT_SID = body.twilioAccountSid.trim();
      process.env.TWILIO_AUTH_TOKEN = body.twilioAuthToken.trim();
      if (body.twilioPhoneNumber?.trim()) {
        (config.env as Record<string, string>).TWILIO_PHONE_NUMBER =
          body.twilioPhoneNumber.trim();
        process.env.TWILIO_PHONE_NUMBER = body.twilioPhoneNumber.trim();
      }
    }
    if (body.blooioApiKey?.trim()) {
      const trimmedKey = body.blooioApiKey.trim();
      (config.env as Record<string, string>).BLOOIO_API_KEY = trimmedKey;
      process.env.BLOOIO_API_KEY = trimmedKey;
      const blooioConnector: Record<string, string> = { apiKey: trimmedKey };
      if (body.blooioPhoneNumber?.trim()) {
        const trimmedPhone = body.blooioPhoneNumber.trim();
        (config.env as Record<string, string>).BLOOIO_PHONE_NUMBER =
          trimmedPhone;
        process.env.BLOOIO_PHONE_NUMBER = trimmedPhone;
        blooioConnector.fromNumber = trimmedPhone;
      }
      config.connectors.blooio = blooioConnector;
    }

    try {
      saveMiladyConfig(config);
    } catch (err) {
      logger.error(`[settings] Failed to save connectors: ${err}`);
      error(res, "Failed to save connectors", 500);
      return true;
    }

    json(res, { ok: true });
    return true;
  }

  // ── POST /api/settings/inventory ──────────────────────────────────────
  if (method === "POST" && pathname === "/api/settings/inventory") {
    const body = await readJsonBody<{
      inventoryProviders?: Array<{
        chain: string;
        rpcProvider: string;
        rpcApiKey?: string;
      }>;
    }>(req, res);
    if (!body) return true;

    const config = state.config;
    if (Array.isArray(body.inventoryProviders)) {
      if (!config.env) config.env = {};
      const allInventory = ctx.getInventoryProviderOptions();
      for (const inv of body.inventoryProviders) {
        const chainDef = allInventory.find((ip) => ip.id === inv.chain);
        if (!chainDef) continue;
        const rpcDef = chainDef.rpcProviders.find(
          (rp) => rp.id === inv.rpcProvider,
        );
        if (rpcDef?.envKey && inv.rpcApiKey) {
          (config.env as Record<string, string>)[rpcDef.envKey] = inv.rpcApiKey;
          process.env[rpcDef.envKey] = inv.rpcApiKey;
        }
      }
    }

    try {
      saveMiladyConfig(config);
    } catch (err) {
      logger.error(`[settings] Failed to save inventory: ${err}`);
      error(res, "Failed to save inventory config", 500);
      return true;
    }

    json(res, { ok: true });
    return true;
  }

  return false;
}
