import { getAddress, verifyMessage } from "ethers";
import { corsHeaders, getStore, json } from "../_shared/botdick-state.js";

const BOARD_KEY = "botdick:holder-board:v1";
const BOARD_RATE_PREFIX = "botdick:holder-board-rate:v1:";
const MAX_BOARD_POSTS = 5;
const MAX_BODY_LENGTH = 420;
const MAX_NAME_LENGTH = 32;
const MAX_AGE_MS = 10 * 60 * 1000;
const BNB_CHAIN_ID = 56;
const BOTDICK_TOKEN_ADDRESS = "0xa342991902ca84d85e27069bf6b57d3138b47777";
const DEFAULT_RPC_URL = "https://bsc-dataseed.binance.org/";
const DEFAULT_MIN_BALANCE = "100000";
const DEFAULT_RATE_WINDOW_HOURS = 24;
const DEFAULT_BOARD_TIERS = [
  { min: "100000", maxPosts: 1 },
  { min: "250000", maxPosts: 2 },
  { min: "500000", maxPosts: 4 },
  { min: "1000000", maxPosts: 8 },
  { min: "2500000", maxPosts: 16 },
  { min: "5000000", maxPosts: 32 },
  { min: "10000000", maxPosts: 64 },
];

export async function onRequestGet({ env }) {
  const config = await readBoardConfig(env);
  const board = await readBoard(env);
  return json({
    ok: true,
    board: board.slice(0, config.maxPosts),
    config: publicConfig(config),
  });
}

export async function onRequestPost({ request, env }) {
  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; board post was not persisted",
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

  const body = clean(payload?.body, MAX_BODY_LENGTH);
  const name = clean(payload?.name || "anon", MAX_NAME_LENGTH);
  const timestamp = Number(payload?.timestamp);
  const signature = typeof payload?.signature === "string" ? payload.signature : "";
  if (!body) return json({ ok: false, error: "message required" }, { status: 400 });
  if (!Number.isFinite(timestamp)) {
    return json({ ok: false, error: "timestamp required" }, { status: 400 });
  }
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
    return json({ ok: false, error: "signature expired; try posting again" }, { status: 400 });
  }

  const rawAddress = String(payload?.address || "").trim();
  let address;
  try {
    address = getAddress(rawAddress);
  } catch {
    return json({ ok: false, error: "valid wallet address required" }, { status: 400 });
  }

  const verified = verifySignedWallet({
    address,
    rawAddress,
    signature,
    buildMessage: (walletAddress) => buildSignedBoardMessage({ address: walletAddress, name, body, timestamp }),
  });
  if (!verified.ok) {
    return json({ ok: false, error: verified.error }, { status: 401 });
  }

  const config = await readBoardConfig(env);
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
        error: `need at least ${config.minDisplay} $BOTDICK to post`,
        balance: balance.display,
        required: config.minDisplay,
      },
      { status: 403 },
    );
  }

  const tier = getBoardTier(balance.raw, config);
  const now = Date.now();
  const recentPosts = await readPostHistory(env, address, now, config.rateWindowMs);
  if (recentPosts.length >= tier.maxPosts) {
    const resetAt = new Date(Math.min(...recentPosts) + config.rateWindowMs).toISOString();
    return json(
      {
        ok: false,
        error: `board quota used: ${tier.maxPosts} posts per ${config.rateWindowHours}h for ${tier.label}+ holders`,
        balance: balance.display,
        required: config.minDisplay,
        resetAt,
        rate: publicRate(tier, recentPosts.length, config, resetAt),
      },
      { status: 429 },
    );
  }

  const board = await readBoard(env);
  const id = await stableId(`${address}:${signature}:${body}`);
  const post = {
    id,
    address,
    displayAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
    name,
    body,
    balance: balance.display,
    tierLabel: tier.label,
    createdAt: new Date().toISOString(),
  };
  const nextBoard = [post, ...board.filter((item) => item.id !== id)].slice(0, config.maxPosts);
  await writeBoard(env, nextBoard);
  await writePostHistory(env, address, [now, ...recentPosts].slice(0, Math.max(tier.maxPosts, 100)));

  return json({
    ok: true,
    post,
    board: nextBoard,
    config: publicConfig(config),
    rate: publicRate(tier, recentPosts.length + 1, config),
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readBoard(env) {
  const store = getStore(env);
  if (!store) return [];
  const board = await store.get(BOARD_KEY, { type: "json" });
  return Array.isArray(board) ? board.map(normalizeBoardPost).filter(Boolean) : [];
}

async function writeBoard(env, board) {
  const store = getStore(env);
  if (!store) return false;
  await store.put(BOARD_KEY, JSON.stringify(board));
  return true;
}

async function readBoardConfig(env) {
  const tokenAddress = getAddress(env?.BOTDICK_TOKEN_ADDRESS || BOTDICK_TOKEN_ADDRESS);
  const rpcUrl = env?.BOTDICK_BNB_RPC_URL || DEFAULT_RPC_URL;
  const decimals = await readTokenDecimals(rpcUrl, tokenAddress);
  const defaultMinRaw = parseTokenUnits(DEFAULT_MIN_BALANCE, decimals);
  const configuredMinDisplay = String(env?.BOTDICK_BOARD_MIN_BALANCE || DEFAULT_MIN_BALANCE);
  const configuredMinRaw = parseTokenUnits(configuredMinDisplay, decimals);
  const minRaw = configuredMinRaw > defaultMinRaw ? configuredMinRaw : defaultMinRaw;
  const minDisplay = minRaw === configuredMinRaw ? configuredMinDisplay : DEFAULT_MIN_BALANCE;
  const rateWindowHours = clampNumber(env?.BOTDICK_BOARD_RATE_WINDOW_HOURS, 1, 168, DEFAULT_RATE_WINDOW_HOURS);
  return {
    chainId: BNB_CHAIN_ID,
    tokenAddress,
    rpcUrl,
    decimals,
    maxPosts: MAX_BOARD_POSTS,
    minDisplay,
    minRaw,
    rateWindowHours,
    rateWindowMs: rateWindowHours * 60 * 60 * 1000,
    tiers: parseBoardTiers(env?.BOTDICK_BOARD_TIERS, decimals, minRaw),
  };
}

function publicConfig(config) {
  return {
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    minBalance: config.minDisplay,
    maxPosts: config.maxPosts,
    rateWindowHours: config.rateWindowHours,
    tiers: config.tiers.map((tier) => ({
      minBalance: tier.minDisplay,
      label: tier.label,
      maxPosts: tier.maxPosts,
    })),
    decimals: config.decimals,
  };
}

function publicRate(tier, used, config, resetAt = "") {
  return {
    tier: {
      minBalance: tier.minDisplay,
      label: tier.label,
      maxPosts: tier.maxPosts,
    },
    used,
    remaining: Math.max(tier.maxPosts - used, 0),
    windowHours: config.rateWindowHours,
    resetAt,
  };
}

function buildSignedBoardMessage({ address, name, body, timestamp }) {
  return [
    "botdick.com holder board",
    "",
    "Sign this message to post on the board.",
    "This does not spend tokens or approve anything.",
    "",
    `wallet: ${address}`,
    `name: ${name}`,
    `message: ${body}`,
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

async function readPostHistory(env, address, now, windowMs) {
  const store = getStore(env);
  if (!store) return [];
  const history = await store.get(rateKey(address), { type: "json" });
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => Number(item))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0 && now - timestamp < windowMs)
    .sort((a, b) => a - b);
}

async function writePostHistory(env, address, history) {
  const store = getStore(env);
  if (!store) return false;
  await store.put(rateKey(address), JSON.stringify(history));
  return true;
}

function rateKey(address) {
  return `${BOARD_RATE_PREFIX}${String(address || "").toLowerCase()}`;
}

function getBoardTier(balanceRaw, config) {
  let selected = config.tiers[0];
  for (const tier of config.tiers) {
    if (balanceRaw >= tier.minRaw) selected = tier;
  }
  return selected;
}

function parseBoardTiers(rawSpec, decimals, minRaw) {
  const parsed = typeof rawSpec === "string" && rawSpec.trim()
    ? rawSpec
        .split(",")
        .map((entry) => {
          const [min, maxPosts] = entry.split(":").map((item) => item?.trim());
          const parsedMax = Number(maxPosts);
          if (!isTokenAmount(min) || !Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 250) return null;
          return { min, maxPosts: parsedMax };
        })
        .filter(Boolean)
    : [];
  const source = parsed.length ? parsed : DEFAULT_BOARD_TIERS;
  const tiers = source
    .map((tier) => {
      const minRawForTier = parseTokenUnits(tier.min, decimals);
      return {
        minDisplay: tier.min,
        minRaw: minRawForTier,
        label: compactTokenAmount(tier.min),
        maxPosts: tier.maxPosts,
      };
    })
    .filter((tier) => tier.minRaw >= minRaw)
    .sort((a, b) => (a.minRaw < b.minRaw ? -1 : a.minRaw > b.minRaw ? 1 : 0));

  if (tiers.length) return tiers;
  return [
    {
      minDisplay: DEFAULT_MIN_BALANCE,
      minRaw,
      label: compactTokenAmount(DEFAULT_MIN_BALANCE),
      maxPosts: 1,
    },
  ];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function isTokenAmount(value) {
  return /^\d+(\.\d+)?$/.test(String(value || "").trim());
}

function compactTokenAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value || "");
  if (number >= 1_000_000) return `${trimNumber(number / 1_000_000)}m`;
  if (number >= 1_000) return `${trimNumber(number / 1_000)}k`;
  return trimNumber(number);
}

function trimNumber(number) {
  return Number(number.toFixed(2)).toString();
}

function clean(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeBoardPost(post) {
  if (!post || typeof post !== "object") return null;
  return {
    id: clean(post.id, 80) || crypto.randomUUID(),
    address: clean(post.address, 80),
    displayAddress: clean(post.displayAddress, 24),
    name: clean(post.name || "anon", MAX_NAME_LENGTH),
    body: clean(post.body, MAX_BODY_LENGTH),
    balance: clean(post.balance, 40),
    tierLabel: clean(post.tierLabel, 20),
    createdAt: clean(post.createdAt, 80),
  };
}

async function stableId(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
