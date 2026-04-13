import { privateKeyToAccount } from "viem/accounts";
import type { SignedRpcEnvelope } from "../types.ts";

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (typeof value === "bigint") return `"${value.toString()}"`;
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stringify(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

export interface SignEnvelopeInput {
  method: string;
  params: unknown[];
  privateKey: `0x${string}`;
  nonce?: string;
  timestamp?: number;
  correlationId?: string;
}

export async function signEnvelope(
  input: SignEnvelopeInput,
): Promise<SignedRpcEnvelope> {
  const nonce = input.nonce ?? crypto.randomUUID();
  const timestamp = input.timestamp ?? Date.now();
  const account = privateKeyToAccount(input.privateKey);
  const clientAddress = account.address;

  const canonicalPayload = {
    clientAddress,
    payload: {
      method: input.method,
      params: input.params,
    },
    timestamp,
    nonce,
  };
  const message = canonicalJson(canonicalPayload);
  const signature = await account.signMessage({ message });

  const envelope: SignedRpcEnvelope = {
    clientAddress,
    payload: { method: input.method, params: input.params },
    nonce,
    timestamp,
    signature,
  };
  if (input.correlationId !== undefined) {
    envelope.correlationId = input.correlationId;
  }
  return envelope;
}
