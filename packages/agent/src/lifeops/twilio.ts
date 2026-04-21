import { logger } from "@elizaos/core";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability.js";

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromPhoneNumber: string;
}

export interface TwilioDeliveryResult {
  ok: boolean;
  status: number | null;
  sid?: string;
  error?: string;
}

function encodeBasicAuth(accountSid: string, authToken: string): string {
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

function twilioOperation(path: string): string {
  return path.includes("/Calls.") ? "twilio_voice" : "twilio_sms";
}

export function readTwilioCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TwilioCredentials | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromPhoneNumber = env.TWILIO_PHONE_NUMBER?.trim();
  if (!accountSid || !authToken || !fromPhoneNumber) {
    return null;
  }
  return {
    accountSid,
    authToken,
    fromPhoneNumber,
  };
}

async function sendTwilioRequest(args: {
  credentials: TwilioCredentials;
  path: string;
  payload: URLSearchParams;
}): Promise<TwilioDeliveryResult> {
  const { credentials, path, payload } = args;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}${path}`;
  const operation = twilioOperation(path);
  const span = createIntegrationTelemetrySpan({
    boundary: "lifeops",
    operation,
    timeoutMs: 12_000,
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(
          credentials.accountSid,
          credentials.authToken,
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!response.ok) {
      const errorMessage = data.message ?? `HTTP ${response.status}`;
      logger.warn(
        {
          boundary: "lifeops",
          integration: "twilio",
          operation,
          statusCode: response.status,
        },
        `[lifeops] Twilio request failed: ${errorMessage}`,
      );
      span.failure({
        statusCode: response.status,
        errorKind: "http_error",
      });
      return {
        ok: false,
        status: response.status,
        error: errorMessage,
      };
    }
    span.success({
      statusCode: response.status,
    });
    return {
      ok: true,
      status: response.status,
      sid: data.sid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      {
        boundary: "lifeops",
        integration: "twilio",
        operation,
        err: error instanceof Error ? error : undefined,
      },
      `[lifeops] Twilio request failed: ${errorMessage}`,
    );
    span.failure({
      error,
      errorKind: "network_error",
    });
    return {
      ok: false,
      status: null,
      error: errorMessage,
    };
  }
}

export async function sendTwilioSms(args: {
  credentials: TwilioCredentials;
  to: string;
  body: string;
}): Promise<TwilioDeliveryResult> {
  const { credentials, to, body } = args;
  return sendTwilioRequest({
    credentials,
    path: "/Messages.json",
    payload: new URLSearchParams({
      To: to,
      From: credentials.fromPhoneNumber,
      Body: body,
    }),
  });
}

export async function sendTwilioVoiceCall(args: {
  credentials: TwilioCredentials;
  to: string;
  message: string;
}): Promise<TwilioDeliveryResult> {
  const { credentials, to, message } = args;
  return sendTwilioRequest({
    credentials,
    path: "/Calls.json",
    payload: new URLSearchParams({
      To: to,
      From: credentials.fromPhoneNumber,
      Twiml: `<Response><Say>${message}</Say></Response>`,
    }),
  });
}
