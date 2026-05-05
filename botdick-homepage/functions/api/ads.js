import { getAddress, verifyMessage } from "ethers";
import { applyEvents, corsHeaders, getStore, json, readState, writeState } from "../_shared/botdick-state.js";

const ADS_KEY = "botdick:ads:v1";
const MAX_ADS = 60;
const MAX_NAME_LENGTH = 32;
const MAX_HEADLINE_LENGTH = 54;
const MAX_BODY_LENGTH = 150;
const MAX_URL_LENGTH = 220;
const MAX_AGE_MS = 10 * 60 * 1000;
const BNB_CHAIN_ID = 56;
const BOTDICK_TOKEN_ADDRESS = "0xa342991902ca84d85e27069bf6b57d3138b47777";
const DEFAULT_RPC_URL = "https://bsc-dataseed.binance.org/";
const DEFAULT_AD_COST = "300000";

export async function onRequestGet({ env }) {
  const config = await readAdsConfig(env);
  return json({
    ok: true,
    ads: await readAds(env),
    config: publicConfig(config),
  });
}

export async function onRequestPost({ request, env }) {
  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; ad queue was not persisted",
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

  const name = clean(payload?.name || "anon", MAX_NAME_LENGTH);
  const headline = clean(payload?.headline || payload?.title, MAX_HEADLINE_LENGTH);
  const body = clean(payload?.body || payload?.message || payload?.text, MAX_BODY_LENGTH);
  const url = normalizeUrl(payload?.url || payload?.href || "");
  const timestamp = Number(payload?.timestamp);
  const signature = typeof payload?.signature === "string" ? payload.signature : "";
  if (!headline) return json({ ok: false, error: "ad headline required" }, { status: 400 });
  if (!body) return json({ ok: false, error: "ad copy required" }, { status: 400 });
  if (!Number.isFinite(timestamp)) {
    return json({ ok: false, error: "timestamp required" }, { status: 400 });
  }
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
    return json({ ok: false, error: "signature expired; try queuing again" }, { status: 400 });
  }

  const rawAddress = String(payload?.address || "").trim();
  let address;
  try {
    address = getAddress(rawAddress);
  } catch {
    return json({ ok: false, error: "valid wallet address required" }, { status: 400 });
  }

  const config = await readAdsConfig(env);
  const verified = verifySignedWallet({
    address,
    rawAddress,
    signature,
    buildMessage: (walletAddress) =>
      buildSignedAdMessage({
        address: walletAddress,
        name,
        headline,
        body,
        url,
        timestamp,
        cost: config.minDisplay,
      }),
  });
  if (!verified.ok) {
    return json({ ok: false, error: verified.error }, { status: 401 });
  }

  let balance;
  try {
    balance = await readTokenBalance(address, config);
  } catch {
    return json({ ok: false, error: "balance check failed; try again" }, { status: 502 });
  }
  if (balance.raw < config.minRaw) {
    return json(
      {
        ok: false,
        error: `need at least ${config.minDisplay} $BOTDICK to queue an ad`,
        balance: balance.display,
        required: config.minDisplay,
      },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const ads = await readAds(env);
  const id = await stableId(`${address}:${signature}:${headline}:${body}`);
  const ad = {
    id,
    status: "queued",
    address,
    displayAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
    name,
    headline,
    body,
    url,
    balance: balance.display,
    cost: config.minDisplay,
    createdAt: now,
    updatedAt: now,
  };
  const nextAds = [ad, ...ads.filter((item) => item.id !== id)].slice(0, MAX_ADS);
  await writeAds(env, nextAds);
  await writeAdEvent(env, ad);

  return json({
    ok: true,
    ad,
    ads: nextAds,
    config: publicConfig(config),
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readAds(env) {
  const store = getStore(env);
  if (!store) return [];
  const ads = await store.get(ADS_KEY, { type: "json" });
  return Array.isArray(ads) ? ads.map(normalizeAd).filter(Boolean).slice(0, MAX_ADS) : [];
}

async function writeAds(env, ads) {
  const store = getStore(env);
  if (!store) return false;
  await store.put(ADS_KEY, JSON.stringify(ads.map(normalizeAd).filter(Boolean).slice(0, MAX_ADS)));
  return true;
}

async function writeAdEvent(env, ad) {
  try {
    const state = await readState(env);
    const next = applyEvents(state, [
      {
        type: "status",
        station: "publish",
        title: "Ad board queued",
        body: `${ad.headline}: ${ad.body}`,
        status: "ad queued",
        url: ad.url,
        meta: {
          adId: ad.id,
          source: "botdick.com/ad-board",
        },
      },
    ]);
    await writeState(env, next);
  } catch {
    // Ad queue is the source of truth; state mirroring should not block posting.
  }
}

async function readAdsConfig(env) {
  const tokenAddress = getAddress(env?.BOTDICK_TOKEN_ADDRESS || BOTDICK_TOKEN_ADDRESS);
  const rpcUrl = env?.BOTDICK_BNB_RPC_URL || DEFAULT_RPC_URL;
  const decimals = await readTokenDecimals(rpcUrl, tokenAddress);
  const minDisplay = String(env?.BOTDICK_AD_COST || DEFAULT_AD_COST);
  return {
    chainId: BNB_CHAIN_ID,
    tokenAddress,
    rpcUrl,
    decimals,
    minDisplay,
    minRaw: parseTokenUnits(minDisplay, decimals),
  };
}

function publicConfig(config) {
  return {
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    cost: config.minDisplay,
    decimals: config.decimals,
  };
}

function buildSignedAdMessage({ address, name, headline, body, url, timestamp, cost }) {
  return [
    "botdick.com ad board",
    "",
    "Sign this message to queue an ad in the workroom.",
    "This checks your $BOTDICK balance and does not spend tokens or approve anything.",
    "",
    `wallet: ${address}`,
    `name: ${name}`,
    `headline: ${headline}`,
    `message: ${body}`,
    `url: ${url}`,
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
  if (!/^\d+(\.\d+)?$/.test(normalized)) return BigInt(DEFAULT_AD_COST) * 10n ** BigInt(decimals);
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

function normalizeUrl(value) {
  const raw = clean(value, MAX_URL_LENGTH);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href.slice(0, MAX_URL_LENGTH) : "";
  } catch {
    return "";
  }
}

function normalizeAd(ad = {}) {
  const id = clean(ad.id, 96);
  const headline = clean(ad.headline || ad.title, MAX_HEADLINE_LENGTH);
  const body = clean(ad.body || ad.message || ad.text, MAX_BODY_LENGTH);
  if (!id || !headline || !body) return null;
  return {
    id,
    status: ["queued", "live", "paused"].includes(ad.status) ? ad.status : "queued",
    address: clean(ad.address, 80),
    displayAddress: clean(ad.displayAddress || "anon", 24),
    name: clean(ad.name || "anon", MAX_NAME_LENGTH),
    headline,
    body,
    url: normalizeUrl(ad.url),
    balance: clean(ad.balance, 48),
    cost: clean(ad.cost || DEFAULT_AD_COST, 48),
    createdAt: clean(ad.createdAt || new Date().toISOString(), 80),
    updatedAt: clean(ad.updatedAt || ad.createdAt || new Date().toISOString(), 80),
  };
}

function clean(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function stableId(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
