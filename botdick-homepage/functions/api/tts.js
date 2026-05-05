import { getAddress, verifyMessage } from "ethers";
import { applyEvents, corsHeaders, getStore, isAuthorized, json, readState, writeState } from "../_shared/botdick-state.js";

const TTS_KEY = "botdick:tts:v1";
const AUDIO_KEY_PREFIX = "botdick:tts-audio:";
const MAX_TTS_ITEMS = 80;
const MAX_QUEUE_ITEMS = 12;
const MAX_BODY_LENGTH = 240;
const MAX_NAME_LENGTH = 32;
const MAX_AGE_MS = 10 * 60 * 1000;
const BNB_CHAIN_ID = 56;
const BOTDICK_TOKEN_ADDRESS = "0xa342991902ca84d85e27069bf6b57d3138b47777";
const DEFAULT_RPC_URL = "https://bsc-dataseed.binance.org/";
const DEFAULT_MIN_BALANCE = "2000";
const DEFAULT_VOICE_ID = "49a14da3b65848e18e351dfc9540d7a6";
const DEFAULT_FISH_MODEL = "s2-pro";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const audioId = clean(url.searchParams.get("audio"), 96);
  if (audioId) return readAudio(env, audioId);

  const config = await readTtsConfig(env);
  const state = await readTtsState(env);
  return json({
    ok: true,
    queue: publicQueue(state.items),
    log: publicLog(state.items),
    config: publicConfig(config),
  });
}

export async function onRequestPost({ request, env }) {
  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; TTS queue was not persisted",
      },
      { status: 503 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const mode = clean(payload?.mode || payload?.kind || "viewer", 16);
  const isQuip = mode === "quip";
  const isAgentQuip = isQuip && isAuthorized(request, env) && Boolean(env?.BOTDICK_INGEST_TOKEN);
  if (isQuip && !isAgentQuip) {
    return json({ ok: false, error: "agent quips require ingest authorization" }, { status: 401 });
  }

  const body = clean(payload?.body || payload?.message || payload?.text, MAX_BODY_LENGTH);
  const name = clean(payload?.name || (isAgentQuip ? "botdick" : "anon"), MAX_NAME_LENGTH);
  if (!body) return json({ ok: false, error: "tts message required" }, { status: 400 });

  const config = await readTtsConfig(env);
  let address = "";
  let balance = { raw: 0n, display: "0" };
  let costDisplay = isAgentQuip ? "agent quip" : config.minDisplay;

  if (!isAgentQuip) {
    const timestamp = Number(payload?.timestamp);
    const signature = typeof payload?.signature === "string" ? payload.signature : "";
    if (!Number.isFinite(timestamp)) {
      return json({ ok: false, error: "timestamp required" }, { status: 400 });
    }
    if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
      return json({ ok: false, error: "signature expired; try sending again" }, { status: 400 });
    }

    const rawAddress = String(payload?.address || "").trim();
    try {
      address = getAddress(rawAddress);
    } catch {
      return json({ ok: false, error: "valid wallet address required" }, { status: 400 });
    }

    const verified = verifySignedWallet({
      address,
      rawAddress,
      signature,
      buildMessage: (walletAddress) =>
        buildSignedTtsMessage({ address: walletAddress, name, body, timestamp, cost: config.minDisplay }),
    });
    if (!verified.ok) {
      return json({ ok: false, error: verified.error }, { status: 401 });
    }

    try {
      balance = await readTokenBalance(address, config);
    } catch {
      return json({ ok: false, error: "balance check failed; try again" }, { status: 502 });
    }
    if (balance.raw < config.minRaw) {
      return json(
        {
          ok: false,
          error: `need at least ${config.minDisplay} $BOTDICK to send TTS`,
          balance: balance.display,
          required: config.minDisplay,
        },
        { status: 403 },
      );
    }
  }

  const state = await readTtsState(env);
  const queuedCount = state.items.filter((item) => item.status === "queued" || item.status === "processing").length;
  if (queuedCount >= MAX_QUEUE_ITEMS) {
    return json({ ok: false, error: "tts queue is full; try again in a minute" }, { status: 429 });
  }

  const now = new Date().toISOString();
  const id = await stableId(`${address || "agent"}:${body}:${now}:${Math.random()}`);
  const item = {
    id,
    mode: isAgentQuip ? "quip" : "viewer",
    status: "queued",
    address,
    displayAddress: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "botdick",
    name,
    prompt: body,
    body: "",
    reply: "",
    balance: balance.display,
    cost: costDisplay,
    audioUrl: "",
    error: "",
    createdAt: now,
    updatedAt: now,
  };
  state.items = [item, ...state.items].slice(0, MAX_TTS_ITEMS);
  await writeTtsState(env, state);

  const processed = await processTtsQueue(env, config);
  await writeTtsEvent(env, processed.item || item);
  const nextState = await readTtsState(env);

  return json({
    ok: processed.ok,
    item: publicItem(processed.item || item),
    queue: publicQueue(nextState.items),
    log: publicLog(nextState.items),
    config: publicConfig(config),
    error: processed.ok ? "" : processed.error,
  }, { status: processed.ok ? 200 : 202 });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readAudio(env, id) {
  const store = getStore(env);
  if (!store) return json({ ok: false, error: "audio store unavailable" }, { status: 503 });
  const audio = await store.get(`${AUDIO_KEY_PREFIX}${id}`, { type: "arrayBuffer" });
  if (!audio) return json({ ok: false, error: "audio not found" }, { status: 404 });
  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      ...corsHeaders(),
    },
  });
}

async function processTtsQueue(env, config) {
  const state = await readTtsState(env);
  const target = state.items.find((item) => item.status === "queued");
  if (!target) return { ok: true, item: null };

  target.status = "processing";
  target.updatedAt = new Date().toISOString();
  await writeTtsState(env, state);

  try {
    if (!env?.FISH_AUDIO_API_KEY) {
      throw new Error("FISH_AUDIO_API_KEY is missing");
    }

    const reply = await generateBotdickReply(target, env);
    const audio = await generateFishAudio(reply, config);
    await getStore(env).put(`${AUDIO_KEY_PREFIX}${target.id}`, audio);

    const next = await readTtsState(env);
    const item = next.items.find((entry) => entry.id === target.id) || target;
    item.status = "ready";
    item.body = reply;
    item.reply = reply;
    item.audioUrl = `/api/tts?audio=${encodeURIComponent(target.id)}`;
    item.error = "";
    item.updatedAt = new Date().toISOString();
    await writeTtsState(env, next);
    return { ok: true, item };
  } catch (error) {
    const next = await readTtsState(env);
    const item = next.items.find((entry) => entry.id === target.id) || target;
    item.status = "failed";
    item.error = clean(error?.message || "voice generation failed", 180);
    item.updatedAt = new Date().toISOString();
    await writeTtsState(env, next);
    return { ok: false, item, error: item.error };
  }
}

async function generateBotdickReply(item, env) {
  const prompt = clean(item.prompt || item.body, MAX_BODY_LENGTH);
  if (!prompt) throw new Error("prompt missing");

  if (env?.BOTDICK_REPLY_ENDPOINT) {
    const response = await fetch(env.BOTDICK_REPLY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.BOTDICK_REPLY_TOKEN ? { Authorization: `Bearer ${env.BOTDICK_REPLY_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        prompt,
        name: item.name,
        address: item.address,
        mode: item.mode,
        source: "botdick.com/tts",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `botdick reply failed ${response.status}`);
    const reply = clean(payload.reply || payload.text || payload.message, MAX_BODY_LENGTH);
    if (!reply) throw new Error("botdick reply endpoint returned empty text");
    return reply;
  }

  if (env?.OPENAI_API_KEY) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.BOTDICK_REPLY_MODEL || "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are botdick, a concise public elizaOS agent. Reply to viewer prompts in one short, speakable line. Be dry, direct, and a little funny. Do not describe that you are doing TTS.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 80,
        temperature: 0.9,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `reply model failed ${response.status}`);
    const reply = clean(payload.choices?.[0]?.message?.content, MAX_BODY_LENGTH);
    if (!reply) throw new Error("reply model returned empty text");
    return reply;
  }

  throw new Error("BOTDICK_REPLY_ENDPOINT or OPENAI_API_KEY is required before TTS can speak");
}

async function generateFishAudio(text, config) {
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.fishApiKey}`,
      "Content-Type": "application/json",
      model: config.fishModel,
    },
    body: JSON.stringify({
      text,
      reference_id: config.voiceId,
      format: "mp3",
      sample_rate: 44100,
      mp3_bitrate: 128,
      normalize: true,
      latency: "normal",
      chunk_length: 200,
      prosody: {
        speed: 1.15,
        volume: 0,
        normalize_loudness: true,
      },
    }),
  });

  if (!response.ok) {
    const textBody = await response.text().catch(() => "");
    throw new Error(`Fish.Audio TTS failed ${response.status}${textBody ? `: ${textBody.slice(0, 120)}` : ""}`);
  }
  return response.arrayBuffer();
}

async function writeTtsEvent(env, item) {
  if (!item) return;
  try {
    const state = await readState(env);
    const next = applyEvents(state, [
      {
        type: item.mode === "quip" ? "x_draft" : "status",
        station: "social",
        title: item.mode === "quip" ? "botdick quipped" : "TTS message queued",
        body: item.body,
        status: item.status,
        url: item.audioUrl,
        meta: {
          ttsId: item.id,
          source: item.mode,
        },
      },
    ]);
    await writeState(env, next);
  } catch {
    // The TTS log is the source of truth; state mirroring should not break speech.
  }
}

async function readTtsState(env) {
  const store = getStore(env);
  if (!store) return { items: [] };
  const state = await store.get(TTS_KEY, { type: "json" });
  return {
    items: Array.isArray(state?.items) ? state.items.map(normalizeTtsItem).filter(Boolean).slice(0, MAX_TTS_ITEMS) : [],
  };
}

async function writeTtsState(env, state) {
  const store = getStore(env);
  if (!store) return false;
  await store.put(TTS_KEY, JSON.stringify({
    items: Array.isArray(state?.items) ? state.items.map(normalizeTtsItem).filter(Boolean).slice(0, MAX_TTS_ITEMS) : [],
  }));
  return true;
}

async function readTtsConfig(env) {
  const tokenAddress = getAddress(env?.BOTDICK_TOKEN_ADDRESS || BOTDICK_TOKEN_ADDRESS);
  const rpcUrl = env?.BOTDICK_BNB_RPC_URL || DEFAULT_RPC_URL;
  const decimals = await readTokenDecimals(rpcUrl, tokenAddress);
  const minDisplay = String(env?.BOTDICK_TTS_COST || DEFAULT_MIN_BALANCE);
  return {
    chainId: BNB_CHAIN_ID,
    tokenAddress,
    rpcUrl,
    decimals,
    minDisplay,
    minRaw: parseTokenUnits(minDisplay, decimals),
    voiceId: clean(env?.FISH_AUDIO_VOICE_ID || DEFAULT_VOICE_ID, 80).replace(/\/+$/, ""),
    fishModel: clean(env?.FISH_AUDIO_MODEL || DEFAULT_FISH_MODEL, 24),
    fishApiKey: env?.FISH_AUDIO_API_KEY || "",
  };
}

function publicConfig(config) {
  return {
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    cost: config.minDisplay,
    decimals: config.decimals,
    voiceModel: config.voiceId,
    fishModel: config.fishModel,
    voiceConfigured: Boolean(config.fishApiKey),
  };
}

function publicQueue(items) {
  return items.filter((item) => item.status === "queued" || item.status === "processing").map(publicItem);
}

function publicLog(items) {
  return items.map(publicItem).slice(0, MAX_TTS_ITEMS);
}

function publicItem(item) {
  return {
    id: item.id,
    mode: item.mode,
    status: item.status,
    displayAddress: item.displayAddress,
    name: item.name,
    prompt: item.prompt,
    reply: item.reply || item.body,
    body: item.body,
    balance: item.balance,
    cost: item.cost,
    audioUrl: item.audioUrl,
    error: item.error,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeTtsItem(item = {}) {
  const id = clean(item.id, 96);
  const prompt = clean(item.prompt || item.input || (item.reply ? "" : item.body), MAX_BODY_LENGTH);
  const reply = clean(item.reply || item.output || (prompt ? item.body : ""), MAX_BODY_LENGTH);
  const body = reply;
  if (!id || (!prompt && !reply)) return null;
  return {
    id,
    mode: clean(item.mode || "viewer", 16),
    status: ["queued", "processing", "ready", "failed"].includes(item.status) ? item.status : "queued",
    address: clean(item.address, 64),
    displayAddress: clean(item.displayAddress || "anon", 24),
    name: clean(item.name || "anon", MAX_NAME_LENGTH),
    prompt,
    reply,
    body,
    balance: clean(item.balance, 48),
    cost: clean(item.cost || DEFAULT_MIN_BALANCE, 48),
    audioUrl: clean(item.audioUrl, 240),
    error: clean(item.error, 180),
    createdAt: clean(item.createdAt || new Date().toISOString(), 80),
    updatedAt: clean(item.updatedAt || item.createdAt || new Date().toISOString(), 80),
  };
}

function buildSignedTtsMessage({ address, name, body, timestamp, cost }) {
  return [
    "botdick.com tts queue",
    "",
    "Sign this message to send botdick a TTS line.",
    "This checks your $BOTDICK balance and does not spend tokens or approve anything.",
    "",
    `wallet: ${address}`,
    `name: ${name}`,
    `message: ${body}`,
    `required: ${cost} $BOTDICK`,
    `timestamp: ${timestamp}`,
  ].join("\n");
}

function verifySignedWallet({ address, rawAddress, signature, buildMessage }) {
  let recoveredAny = false;
  for (const walletAddress of addressCandidates(rawAddress, address)) {
    try {
      const recovered = getAddress(verifyMessage(buildMessage(walletAddress), signature));
      recoveredAny = true;
      if (recovered === address) return { ok: true, error: "" };
    } catch {
      // Try the next address rendering. Wallets do not agree on checksum casing.
    }
  }
  return {
    ok: false,
    error: recoveredAny ? "signature does not match wallet" : "signature verification failed",
  };
}

function addressCandidates(rawAddress, canonicalAddress) {
  const raw = String(rawAddress || "").trim();
  return [...new Set([canonicalAddress, raw, raw.toLowerCase()].filter(Boolean))];
}

async function readTokenDecimals(rpcUrl, tokenAddress) {
  try {
    const result = await rpcCall(rpcUrl, "eth_call", [
      { to: tokenAddress, data: "0x313ce567" },
      "latest",
    ]);
    const raw = BigInt(result || "0x12");
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 36 ? value : 18;
  } catch {
    return 18;
  }
}

async function readTokenBalance(address, config) {
  const paddedAddress = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const result = await rpcCall(config.rpcUrl, "eth_call", [
    {
      to: config.tokenAddress,
      data: `0x70a08231${paddedAddress}`,
    },
    "latest",
  ]);
  const raw = BigInt(result || "0x0");
  return {
    raw,
    display: formatTokenUnits(raw, config.decimals),
  };
}

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) throw new Error(`rpc http ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "rpc error");
  return payload.result;
}

function parseTokenUnits(value, decimals) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 1n * 10n ** BigInt(decimals);
  const [whole, fraction = ""] = normalized.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

function formatTokenUnits(raw, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  const fractional = fraction.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

async function stableId(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clean(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
