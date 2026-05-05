import { getAddress, verifyMessage } from "ethers";
import { applyEvents, corsHeaders, getStore, json, readState, writeState } from "../_shared/botdick-state.js";

const FEED_KEY = "botdick:feed-tokens:v1";
const MAX_DROPS = 80;
const MAX_LEADERS = 24;
const MAX_NAME_LENGTH = 32;
const MAX_COUNT = 20;
const MAX_AGE_MS = 10 * 60 * 1000;
const BNB_CHAIN_ID = 56;
const BOTDICK_TOKEN_ADDRESS = "0xa342991902ca84d85e27069bf6b57d3138b47777";
const DEFAULT_RPC_URL = "https://bsc-dataseed.binance.org/";
const DEFAULT_BALANCE_PER_FEED = "10000";
const DEFAULT_MAX_HOURLY = 250;

export async function onRequestGet({ env }) {
  const config = await readFeedConfig(env);
  const state = await readFeedState(env);
  return json({
    ok: true,
    drops: publicDrops(state.drops),
    leaderboard: publicLeaderboard(state.leaderboard),
    config: publicConfig(config),
  });
}

export async function onRequestPost({ request, env }) {
  if (!getStore(env)) {
    return json(
      {
        ok: false,
        error: "BOTDICK_STATE KV binding is missing; feed tokens were not persisted",
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
  const count = Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(payload?.count || 1))));
  const timestamp = Number(payload?.timestamp);
  const signature = typeof payload?.signature === "string" ? payload.signature : "";
  if (!Number.isFinite(timestamp)) {
    return json({ ok: false, error: "timestamp required" }, { status: 400 });
  }
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
    return json({ ok: false, error: "signature expired; try feeding again" }, { status: 400 });
  }

  const rawAddress = String(payload?.address || "").trim();
  let address;
  try {
    address = getAddress(rawAddress);
  } catch {
    return json({ ok: false, error: "valid wallet address required" }, { status: 400 });
  }

  const config = await readFeedConfig(env);
  const verified = verifySignedWallet({
    address,
    rawAddress,
    signature,
    buildMessage: (walletAddress) => buildSignedFeedMessage({ address: walletAddress, name, count, timestamp }),
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

  const hourlyAllowance = allowanceFromBalance(balance.raw, config);
  if (hourlyAllowance <= 0) {
    return json({ ok: false, error: "hold $BOTDICK to earn feed tokens", balance: balance.display }, { status: 403 });
  }

  const state = await readFeedState(env);
  const now = new Date();
  const nowIso = now.toISOString();
  const user = state.users[address] || {
    address,
    displayAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
    name,
    credits: 0,
    hourlyAllowance,
    totalFed: 0,
    balance: balance.display,
    lastAccruedAt: "",
    updatedAt: nowIso,
  };
  accrueCredits(user, hourlyAllowance, now, config.maxHourly);
  user.name = name;
  user.hourlyAllowance = hourlyAllowance;
  user.balance = balance.display;
  user.updatedAt = nowIso;

  if (user.credits < count) {
    state.users[address] = user;
    await writeFeedState(env, state);
    return json(
      {
        ok: false,
        error: `need ${count} feed token${count === 1 ? "" : "s"}; you have ${user.credits}`,
        credits: user.credits,
        hourlyAllowance,
        nextCreditAt: nextCreditAt(user, hourlyAllowance),
        config: publicConfig(config),
      },
      { status: 403 },
    );
  }

  user.credits -= count;
  user.totalFed += count;
  state.users[address] = user;

  const drops = Array.from({ length: count }, (_, index) => createDrop({
    address,
    name,
    displayAddress: user.displayAddress,
    index,
    nowIso,
  }));
  state.drops = [...drops, ...state.drops].slice(0, MAX_DROPS);
  state.leaderboard = buildLeaderboard(state.users);
  await writeFeedState(env, state);
  await writeFeedEvent(env, user, count);

  return json({
    ok: true,
    drops: publicDrops(state.drops),
    leaderboard: publicLeaderboard(state.leaderboard),
    user: publicUser(user),
    credits: user.credits,
    hourlyAllowance,
    config: publicConfig(config),
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

async function readFeedState(env) {
  const store = getStore(env);
  if (!store) return { drops: [], leaderboard: [], users: {} };
  const state = await store.get(FEED_KEY, { type: "json" });
  const users = state?.users && typeof state.users === "object" ? state.users : {};
  return {
    drops: Array.isArray(state?.drops) ? state.drops.map(normalizeDrop).filter(Boolean).slice(0, MAX_DROPS) : [],
    leaderboard: Array.isArray(state?.leaderboard) ? state.leaderboard.map(normalizeLeader).filter(Boolean).slice(0, MAX_LEADERS) : [],
    users: normalizeUsers(users),
  };
}

async function writeFeedState(env, state) {
  const store = getStore(env);
  if (!store) return false;
  await store.put(FEED_KEY, JSON.stringify({
    drops: Array.isArray(state?.drops) ? state.drops.map(normalizeDrop).filter(Boolean).slice(0, MAX_DROPS) : [],
    leaderboard: Array.isArray(state?.leaderboard) ? state.leaderboard.map(normalizeLeader).filter(Boolean).slice(0, MAX_LEADERS) : [],
    users: normalizeUsers(state?.users || {}),
  }));
  return true;
}

async function writeFeedEvent(env, user, count) {
  try {
    const state = await readState(env);
    const next = applyEvents(state, [
      {
        type: "status",
        station: "intake",
        title: `${user.name || user.displayAddress} fed botdick`,
        body: `${count} token snack${count === 1 ? "" : "s"} spawned in the workroom.`,
        status: "feed",
        meta: {
          source: "botdick.com/feed-tokens",
          address: user.address,
          count,
        },
      },
    ]);
    await writeState(env, next);
  } catch {
    // Feed state is the source of truth; state mirroring should not block snacks.
  }
}

async function readFeedConfig(env) {
  const tokenAddress = getAddress(env?.BOTDICK_TOKEN_ADDRESS || BOTDICK_TOKEN_ADDRESS);
  const rpcUrl = env?.BOTDICK_BNB_RPC_URL || DEFAULT_RPC_URL;
  const decimals = await readTokenDecimals(rpcUrl, tokenAddress);
  const balancePerFeed = String(env?.BOTDICK_FEED_BALANCE_PER_TOKEN || DEFAULT_BALANCE_PER_FEED);
  const maxHourly = Math.max(1, Math.floor(Number(env?.BOTDICK_FEED_MAX_HOURLY || DEFAULT_MAX_HOURLY)));
  return {
    chainId: BNB_CHAIN_ID,
    tokenAddress,
    rpcUrl,
    decimals,
    balancePerFeed,
    balancePerFeedRaw: parseTokenUnits(balancePerFeed, decimals),
    maxHourly,
  };
}

function publicConfig(config) {
  return {
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    balancePerFeed: config.balancePerFeed,
    maxHourly: config.maxHourly,
  };
}

function buildSignedFeedMessage({ address, name, count, timestamp }) {
  return [
    "botdick.com feed tokens",
    "",
    "Sign this message to feed botdick token snacks.",
    "This checks your $BOTDICK balance and does not spend tokens or approve anything.",
    "",
    `wallet: ${address}`,
    `name: ${name}`,
    `count: ${count}`,
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

function allowanceFromBalance(raw, config) {
  if (config.balancePerFeedRaw <= 0n) return 0;
  const allowance = Number(raw / config.balancePerFeedRaw);
  if (!Number.isFinite(allowance) || allowance <= 0) return 0;
  return Math.min(config.maxHourly, allowance);
}

function accrueCredits(user, hourlyAllowance, now, maxHourly) {
  const last = user.lastAccruedAt ? Date.parse(user.lastAccruedAt) : 0;
  const elapsedHours = last ? Math.max(0, (now.getTime() - last) / 3600000) : 1;
  const maxCredits = Math.max(hourlyAllowance, maxHourly * 6);
  const nextCredits = Math.floor((Number(user.credits) || 0) + hourlyAllowance * elapsedHours);
  user.credits = Math.min(maxCredits, nextCredits);
  user.lastAccruedAt = now.toISOString();
}

function nextCreditAt(user, hourlyAllowance) {
  if (!hourlyAllowance) return "";
  const last = user.lastAccruedAt ? Date.parse(user.lastAccruedAt) : Date.now();
  return new Date(last + Math.ceil(3600000 / hourlyAllowance)).toISOString();
}

function createDrop({ address, name, displayAddress, index, nowIso }) {
  const colors = ["green", "cyan", "red", "gold", "white"];
  return {
    id: `${nowIso}-${address.slice(2, 8)}-${index}-${crypto.randomUUID()}`,
    address,
    displayAddress,
    name,
    kind: colors[(index + address.charCodeAt(3)) % colors.length],
    label: "feed token",
    status: "waiting",
    createdAt: nowIso,
  };
}

function buildLeaderboard(users) {
  return Object.values(users)
    .map(publicUser)
    .filter((user) => user.totalFed > 0)
    .sort((a, b) => b.totalFed - a.totalFed)
    .slice(0, MAX_LEADERS);
}

function publicDrops(drops) {
  return drops.map((drop) => ({
    id: drop.id,
    displayAddress: drop.displayAddress,
    name: drop.name,
    kind: drop.kind,
    label: drop.label,
    status: drop.status,
    createdAt: drop.createdAt,
  }));
}

function publicLeaderboard(leaderboard) {
  return leaderboard.map(normalizeLeader).filter(Boolean);
}

function publicUser(user) {
  return {
    address: user.address,
    displayAddress: user.displayAddress,
    name: user.name,
    credits: user.credits,
    hourlyAllowance: user.hourlyAllowance,
    totalFed: user.totalFed,
    balance: user.balance,
    updatedAt: user.updatedAt,
  };
}

function normalizeUsers(users) {
  return Object.fromEntries(
    Object.entries(users)
      .map(([address, user]) => {
        const normalized = normalizeUser({ ...user, address: user.address || address });
        return normalized ? [normalized.address, normalized] : null;
      })
      .filter(Boolean),
  );
}

function normalizeUser(user = {}) {
  let address = "";
  try {
    address = getAddress(String(user.address || ""));
  } catch {
    return null;
  }
  return {
    address,
    displayAddress: clean(user.displayAddress || `${address.slice(0, 6)}...${address.slice(-4)}`, 24),
    name: clean(user.name || "anon", MAX_NAME_LENGTH),
    credits: Math.max(0, Math.floor(Number(user.credits || 0))),
    hourlyAllowance: Math.max(0, Math.floor(Number(user.hourlyAllowance || 0))),
    totalFed: Math.max(0, Math.floor(Number(user.totalFed || 0))),
    balance: clean(user.balance, 48),
    lastAccruedAt: clean(user.lastAccruedAt, 80),
    updatedAt: clean(user.updatedAt || new Date().toISOString(), 80),
  };
}

function normalizeDrop(drop = {}) {
  const id = clean(drop.id, 140);
  if (!id) return null;
  return {
    id,
    displayAddress: clean(drop.displayAddress || "anon", 24),
    name: clean(drop.name || "anon", MAX_NAME_LENGTH),
    kind: ["green", "cyan", "red", "gold", "white"].includes(drop.kind) ? drop.kind : "green",
    label: clean(drop.label || "feed token", 40),
    status: ["waiting", "eaten"].includes(drop.status) ? drop.status : "waiting",
    createdAt: clean(drop.createdAt || new Date().toISOString(), 80),
  };
}

function normalizeLeader(leader = {}) {
  const name = clean(leader.name || "anon", MAX_NAME_LENGTH);
  const totalFed = Math.max(0, Math.floor(Number(leader.totalFed || 0)));
  if (!totalFed) return null;
  return {
    displayAddress: clean(leader.displayAddress || "anon", 24),
    name,
    totalFed,
    credits: Math.max(0, Math.floor(Number(leader.credits || 0))),
    hourlyAllowance: Math.max(0, Math.floor(Number(leader.hourlyAllowance || 0))),
  };
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
  if (!/^\d+(\.\d+)?$/.test(normalized)) return BigInt(DEFAULT_BALANCE_PER_FEED) * 10n ** BigInt(decimals);
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

function clean(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
