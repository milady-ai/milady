import type { IAgentRuntime } from "@elizaos/core";
import { z, ZodError } from "zod";

export const telegramAccountEnvSchema = z.object({
    TELEGRAM_ACCOUNT_PHONE: z.string(),
    TELEGRAM_ACCOUNT_APP_ID: z.number().int(),
    TELEGRAM_ACCOUNT_APP_HASH: z.string(),
    TELEGRAM_ACCOUNT_DEVICE_MODEL: z.string(),
    TELEGRAM_ACCOUNT_SYSTEM_VERSION: z.string(),
});

export type TelegramAccountConfig = z.infer<typeof telegramAccountEnvSchema>;


function readStringSetting(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    return undefined;
}

function safeParseInt(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function validateTelegramAccountConfig(
    runtime: IAgentRuntime
): Promise<TelegramAccountConfig> {
    try {
        const telegramAccountConfig = {
            TELEGRAM_ACCOUNT_PHONE: readStringSetting(
                runtime.getSetting("TELEGRAM_ACCOUNT_PHONE") ??
                    process.env.TELEGRAM_ACCOUNT_PHONE
            ),

            TELEGRAM_ACCOUNT_APP_ID: safeParseInt(
                runtime.getSetting("TELEGRAM_ACCOUNT_APP_ID") ??
                    process.env.TELEGRAM_ACCOUNT_APP_ID
            ),

            TELEGRAM_ACCOUNT_APP_HASH: readStringSetting(
                runtime.getSetting("TELEGRAM_ACCOUNT_APP_HASH") ??
                    process.env.TELEGRAM_ACCOUNT_APP_HASH
            ),

            TELEGRAM_ACCOUNT_DEVICE_MODEL: readStringSetting(
                runtime.getSetting("TELEGRAM_ACCOUNT_DEVICE_MODEL") ??
                    process.env.TELEGRAM_ACCOUNT_DEVICE_MODEL
            ),

            TELEGRAM_ACCOUNT_SYSTEM_VERSION: readStringSetting(
                runtime.getSetting("TELEGRAM_ACCOUNT_SYSTEM_VERSION") ??
                    process.env.TELEGRAM_ACCOUNT_SYSTEM_VERSION
            )
        };

        return telegramAccountEnvSchema.parse(telegramAccountConfig);
    } catch (error) {
        if (error instanceof ZodError) {
            const errorMessages = error.issues
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Telegram account configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}
