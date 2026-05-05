#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const WEIGHTS = {
  message: 1,
  replySent: 1.25,
  mentionReceived: 1,
  reactionReceived: 0.75,
  reactionGiven: 0.25,
  vibeWord: 0.2,
  vibeCap: 2
};

const VIBE_WORDS = new Set([
  "thanks",
  "thank",
  "love",
  "great",
  "nice",
  "helpful",
  "ship",
  "shipped",
  "clear",
  "solid",
  "good",
  "excellent",
  "appreciate",
  "support"
]);

function parseArgs(argv) {
  const args = { outDir: "output" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--since") args.since = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/interaction-leaderboard.mjs --input messages.json --out-dir output",
    "",
    "Input may be DiscordChatExporter JSON, a JSON array, or CSV."
  ].join("\n");
}

function readMessages(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  if (inputPath.toLowerCase().endsWith(".csv")) {
    return parseCsv(raw).map(csvToMessage);
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.messages)) return parsed.messages;
  throw new Error("JSON input must be an array or contain a top-level messages array.");
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (quoted && ch === "\"" && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (ch === "\"") {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);

  const [headers, ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])));
}

function csvToMessage(row) {
  const authorName = row.author || row.authorName || row.username || row.user || "unknown";
  const authorId = row.authorId || row.userId || authorName;
  return {
    id: row.id || row.messageId || "",
    timestamp: row.timestamp || row.date || row.createdAt || "",
    author: { id: authorId, name: authorName },
    content: row.content || row.message || row.text || "",
    mentions: parseDelimitedUsers(row.mentions || row.mentionedUsers || ""),
    reactions: parseReactions(row.reactions || ""),
    replyTo: row.replyTo || row.reference || row.referenceId || ""
  };
}

function parseDelimitedUsers(value) {
  if (!value) return [];
  return String(value)
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, name] = part.split(":").map((item) => item.trim());
      return { id: id || name, name: name || id };
    });
}

function parseReactions(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value)
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [emoji, count] = part.split(":");
        return { emoji, count: Number(count || 1), users: [] };
      });
  }
}

function normalizeMessage(message) {
  const author = message.author || {};
  const name = author.nickname || author.displayName || author.globalName || author.name || author.username || message.authorName || message.username || "unknown";
  const id = author.id || message.authorId || message.userId || name;
  return {
    id: String(message.id || message.messageId || ""),
    timestamp: message.timestamp || message.date || message.createdAt || "",
    author: { id: String(id), name: String(name), bot: Boolean(author.bot || message.bot) },
    content: String(message.content || message.text || message.message || ""),
    mentions: normalizeUsers(message.mentions || message.mentionedUsers || []),
    reactions: normalizeReactions(message.reactions || []),
    replyTo: String(message.replyTo || message.reference?.messageId || message.messageReference?.messageId || message.referencedMessage?.id || "")
  };
}

function normalizeUsers(users) {
  if (typeof users === "string") return parseDelimitedUsers(users);
  if (!Array.isArray(users)) return [];
  return users.map((user) => {
    if (typeof user === "string") return { id: user, name: user };
    const id = user.id || user.userId || user.name || user.username || "";
    const name = user.name || user.username || user.displayName || id;
    return { id: String(id), name: String(name) };
  }).filter((user) => user.id || user.name);
}

function normalizeReactions(reactions) {
  if (!Array.isArray(reactions)) return [];
  return reactions.map((reaction) => ({
    emoji: String(reaction.emoji?.name || reaction.emoji || ""),
    count: Number(reaction.count || reaction.countDetails?.normal || 0),
    users: normalizeUsers(reaction.users || reaction.reactors || [])
  }));
}

function ensureUser(users, user) {
  const id = user.id || user.name || "unknown";
  if (!users.has(id)) {
    users.set(id, {
      id,
      name: user.name || id,
      messages: 0,
      repliesSent: 0,
      mentionsReceived: 0,
      reactionsReceived: 0,
      reactionsGiven: 0,
      vibeHits: 0,
      activityScore: 0,
      vibesBonus: 0,
      totalScore: 0
    });
  }
  return users.get(id);
}

function countVibeHits(content) {
  const words = content.toLowerCase().match(/[a-z0-9']+/g) || [];
  return words.filter((word) => VIBE_WORDS.has(word)).length;
}

function buildLeaderboard(messages, options = {}) {
  const since = options.since ? new Date(options.since).getTime() : null;
  const normalized = messages
    .map(normalizeMessage)
    .filter((message) => !message.author.bot)
    .filter((message) => {
      if (!since) return true;
      const ts = Date.parse(message.timestamp);
      return Number.isFinite(ts) && ts >= since;
    });

  const users = new Map();

  for (const message of normalized) {
    const author = ensureUser(users, message.author);
    author.messages += 1;
    author.vibeHits += countVibeHits(message.content);

    if (message.replyTo) author.repliesSent += 1;

    for (const mentioned of message.mentions) {
      if (mentioned.id === message.author.id || mentioned.name === message.author.name) continue;
      ensureUser(users, mentioned).mentionsReceived += 1;
    }

    for (const reaction of message.reactions) {
      author.reactionsReceived += Number.isFinite(reaction.count) ? reaction.count : 0;
      for (const reactor of reaction.users) {
        if (reactor.id === message.author.id || reactor.name === message.author.name) continue;
        ensureUser(users, reactor).reactionsGiven += 1;
      }
    }
  }

  const leaderboard = [...users.values()].map((user) => {
    user.activityScore =
      user.messages * WEIGHTS.message +
      user.repliesSent * WEIGHTS.replySent +
      user.mentionsReceived * WEIGHTS.mentionReceived +
      user.reactionsReceived * WEIGHTS.reactionReceived +
      user.reactionsGiven * WEIGHTS.reactionGiven;
    user.vibesBonus = Math.min(WEIGHTS.vibeCap, user.vibeHits * WEIGHTS.vibeWord);
    user.totalScore = user.activityScore + user.vibesBonus;
    return user;
  }).sort((a, b) => b.totalScore - a.totalScore || b.messages - a.messages || a.name.localeCompare(b.name));

  return leaderboard.map((user, index) => ({
    rank: index + 1,
    ...user,
    activityScore: round(user.activityScore),
    vibesBonus: round(user.vibesBonus),
    totalScore: round(user.totalScore)
  }));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function writeOutputs({ leaderboard, outDir, sourcePath }) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync("public", { recursive: true });
  fs.mkdirSync("reports", { recursive: true });

  const status = {
    generatedAt: new Date().toISOString(),
    channel: path.basename(sourcePath),
    sourcePath,
    scoring: WEIGHTS,
    blocker: "Live Discord collection blocked: no channel ID, guild ID, or live message source was supplied in this workspace."
  };

  const payload = { status, leaderboard };
  fs.writeFileSync(path.join(outDir, "leaderboard.json"), `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "leaderboard.csv"), toCsv(leaderboard));
  fs.writeFileSync(path.join(outDir, "leaderboard.md"), toMarkdown(payload));
  fs.writeFileSync(path.join("public", "leaderboard-data.js"), `window.LEADERBOARD_DATA = ${JSON.stringify(payload, null, 2)};\n`);
  fs.writeFileSync(path.join("reports", "live-status.md"), toStatus(status));
}

function toCsv(rows) {
  const headers = ["rank", "name", "totalScore", "activityScore", "vibesBonus", "messages", "repliesSent", "mentionsReceived", "reactionsReceived", "reactionsGiven"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function toMarkdown(payload) {
  const lines = [
    "# Interaction Leaderboard",
    "",
    `Generated: ${payload.status.generatedAt}`,
    `Source: ${payload.status.sourcePath}`,
    "",
    "Vibes bonus is clearly labeled and capped at 2.00 points per user.",
    "",
    "| Rank | User | Total | Activity | Vibes Bonus | Messages | Replies | Mentions | Reactions In | Reactions Out |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const row of payload.leaderboard) {
    lines.push(`| ${row.rank} | ${row.name} | ${row.totalScore.toFixed(2)} | ${row.activityScore.toFixed(2)} | ${row.vibesBonus.toFixed(2)} | ${row.messages} | ${row.repliesSent} | ${row.mentionsReceived} | ${row.reactionsReceived} | ${row.reactionsGiven} |`);
  }
  lines.push("", `Live blocker: ${payload.status.blocker}`, "");
  return `${lines.join("\n")}`;
}

function toStatus(status) {
  return [
    "# Live Interaction Leaderboard Status",
    "",
    "Status: blocked for live Discord collection, runnable for export-based generation.",
    "",
    "Exact blockers:",
    "",
    "- The workspace did not contain a Discord JSON export, CSV export, or message archive.",
    "- The local Discord connector configuration has a token present, but no channel ID or guild ID target was available.",
    "- The task text did not provide a channel ID, message ID range, export path, or time window for a live pull.",
    "- Secrets were not exposed or printed.",
    "",
    "Generated fallback:",
    "",
    `- Source path: ${status.sourcePath}`,
    `- Generated at: ${status.generatedAt}`,
    "- Outputs: output/leaderboard.md, output/leaderboard.json, output/leaderboard.csv, public/leaderboard-data.js",
    "",
    "Homepage path:",
    "",
    "```text",
    "/Users/binkyfishai/milady-fisbat/discord-interaction-leaderboard/public/index.html",
    "```",
    ""
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input) {
    console.error("Missing --input.");
    console.error(usage());
    process.exit(2);
  }

  const sourcePath = path.resolve(args.input);
  const outDir = path.resolve(args.outDir);
  const messages = readMessages(sourcePath);
  const leaderboard = buildLeaderboard(messages, { since: args.since });
  writeOutputs({ leaderboard, outDir, sourcePath });
  console.log(`Generated ${leaderboard.length} leaderboard rows.`);
  console.log(`Markdown: ${path.join(outDir, "leaderboard.md")}`);
  console.log(`Homepage: ${path.resolve("public/index.html")}`);
  console.log("Live blocker: no channel ID, guild ID, or live message source was supplied in this workspace.");
}

main();
