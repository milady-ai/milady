#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_WEIGHTS = {
  message: 1,
  replySent: 1.5,
  replyReceived: 1.2,
  mentionMade: 0.35,
  mentionReceived: 0.75,
  reactionReceived: 0.35,
  attachmentMessage: 0.25,
  vibesSignal: 0.1,
  vibesCap: 2
};

const VIBE_PATTERN =
  /\b(thanks|thank you|ty|gm|gn|nice|love|great|solid|ship|shipped|based|cozy|vibe|vibes|lol|haha|lfg)\b/gi;

function parseArgs(argv) {
  const args = {
    input: "",
    out: "output",
    homepage: "public/index.html",
    title: "Discord Interaction Leaderboard",
    window: "export"
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }

  if (!args.input) {
    throw new Error("Missing --input path to a Discord JSON or CSV export.");
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char !== "\r") {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers = [], ...records] = rows.filter((item) => item.some(Boolean));
  return records.map((record) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header.trim()] = record[index] ?? "";
    });
    return out;
  });
}

function loadMessages(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === ".csv") {
    return parseCsv(raw);
  }

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.messages)) return parsed.messages;
  if (Array.isArray(parsed.data)) return parsed.data;
  throw new Error("JSON export must be an array, or an object with messages/data array.");
}

function firstValue(source, names) {
  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null && source[name] !== "") {
      return source[name];
    }
  }
  return "";
}

function asBool(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "bot"].includes(String(value).toLowerCase());
}

function splitIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        return item.id || item.userId || item.authorId || "";
      })
      .filter(Boolean);
  }

  return String(value || "")
    .split(/[;, ]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function reactionCount(reactions) {
  if (Array.isArray(reactions)) {
    return reactions.reduce((total, reaction) => {
      const count = Number(reaction.count ?? reaction.Count ?? reaction.total ?? 1);
      return total + (Number.isFinite(count) ? count : 0);
    }, 0);
  }
  const numeric = Number(reactions || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeMessage(message) {
  const author = message.author || message.Author || {};
  const authorId = String(
    author.id ||
      firstValue(message, ["authorId", "author_id", "AuthorID", "Author Id", "UserID", "User Id"])
  );
  const authorName = String(
    author.global_name ||
      author.globalName ||
      author.displayName ||
      author.username ||
      author.name ||
      firstValue(message, ["authorName", "author", "Author", "Username", "User"])
  );
  const content = String(firstValue(message, ["content", "Content", "message", "Message"]));
  const mentions = splitIds(message.mentions || message.Mentions || message.mentionedUsers || "");
  const replyToAuthorId = String(
    message.referenced_message?.author?.id ||
      message.referencedMessage?.author?.id ||
      firstValue(message, ["replyToAuthorId", "reply_to_author_id", "ReferenceAuthorID", "Referenced Author Id"])
  );
  const replyToMessageId = String(
    message.message_reference?.message_id ||
      message.reference?.messageId ||
      message.reference?.message_id ||
      firstValue(message, ["replyToMessageId", "reply_to_message_id", "ReferenceMessageID", "Referenced Message Id"])
  );

  return {
    id: String(firstValue(message, ["id", "ID", "messageId", "MessageID"])),
    authorId,
    authorName: authorName || authorId || "unknown",
    content,
    isBot: asBool(author.bot ?? message.isBot ?? message.Bot ?? message.AuthorIsBot),
    type: firstValue(message, ["type", "Type"]),
    timestamp: firstValue(message, ["timestamp", "Timestamp", "Date", "date"]),
    mentions,
    replyToAuthorId,
    replyToMessageId,
    reactionsReceived: reactionCount(message.reactions || message.Reactions || message.reactionCount),
    attachmentMessages: Array.isArray(message.attachments)
      ? Number(message.attachments.length > 0)
      : Number(Boolean(message.Attachments || message.attachmentCount))
  };
}

function ensureUser(users, id, name) {
  if (!users.has(id)) {
    users.set(id, {
      id,
      name: name || id,
      messages: 0,
      repliesSent: 0,
      repliesReceived: 0,
      mentionsMade: 0,
      mentionsReceived: 0,
      reactionsReceived: 0,
      attachmentMessages: 0,
      vibeSignals: 0,
      vibesBonus: 0,
      score: 0
    });
  }

  const user = users.get(id);
  if (name && user.name === id) user.name = name;
  return user;
}

function countVibeSignals(content) {
  const matches = content.match(VIBE_PATTERN) || [];
  return Math.min(matches.length, 2);
}

function computeLeaderboard(rawMessages, weights = DEFAULT_WEIGHTS) {
  const users = new Map();
  const messageAuthors = new Map();
  const normalized = rawMessages.map(normalizeMessage);
  let skipped = 0;

  for (const message of normalized) {
    if (!message.authorId || message.isBot || String(message.type).toLowerCase().includes("system")) {
      skipped += 1;
      continue;
    }
    messageAuthors.set(message.id, message.authorId);
  }

  for (const message of normalized) {
    if (!message.authorId || message.isBot || String(message.type).toLowerCase().includes("system")) {
      continue;
    }

    const user = ensureUser(users, message.authorId, message.authorName);
    user.messages += 1;
    user.reactionsReceived += message.reactionsReceived;
    user.attachmentMessages += message.attachmentMessages;
    user.vibeSignals += countVibeSignals(message.content);

    if (message.replyToAuthorId || message.replyToMessageId) {
      user.repliesSent += 1;
      const recipientId = message.replyToAuthorId || messageAuthors.get(message.replyToMessageId);
      if (recipientId && recipientId !== message.authorId) {
        ensureUser(users, recipientId, recipientId).repliesReceived += 1;
      }
    }

    for (const mentionId of message.mentions) {
      if (!mentionId || mentionId === message.authorId) continue;
      user.mentionsMade += 1;
      ensureUser(users, mentionId, mentionId).mentionsReceived += 1;
    }
  }

  const leaderboard = [...users.values()].map((user) => {
    const vibesBonus = Math.min(user.vibeSignals * weights.vibesSignal, weights.vibesCap);
    const score =
      user.messages * weights.message +
      user.repliesSent * weights.replySent +
      user.repliesReceived * weights.replyReceived +
      user.mentionsMade * weights.mentionMade +
      user.mentionsReceived * weights.mentionReceived +
      user.reactionsReceived * weights.reactionReceived +
      user.attachmentMessages * weights.attachmentMessage +
      vibesBonus;

    return {
      ...user,
      vibesBonus: Number(vibesBonus.toFixed(2)),
      score: Number(score.toFixed(2))
    };
  });

  leaderboard.sort((a, b) => b.score - a.score || b.messages - a.messages || a.name.localeCompare(b.name));
  leaderboard.forEach((user, index) => {
    user.rank = index + 1;
  });

  return {
    leaderboard,
    stats: {
      inputMessages: rawMessages.length,
      eligibleMessages: normalized.length - skipped,
      skippedBotOrSystem: skipped,
      users: leaderboard.length
    },
    weights
  };
}

function markdownReport(result, options) {
  const rows = result.leaderboard
    .map(
      (user) =>
        `| ${user.rank} | ${escapeMd(user.name)} | ${user.score.toFixed(2)} | ${user.messages} | ${user.repliesSent}/${user.repliesReceived} | ${user.mentionsMade}/${user.mentionsReceived} | ${user.reactionsReceived} | ${user.vibesBonus.toFixed(2)} |`
    )
    .join("\n");

  return `# ${options.title}

Window: ${options.window}
Generated: ${options.generatedAt}

Vibes bonus (small weight): +${result.weights.vibesSignal.toFixed(2)} per friendly signal, capped at +${result.weights.vibesCap.toFixed(2)} total per user. It is included for fun and is intentionally much smaller than replies, mentions, and reactions.

| Rank | User | Score | Messages | Replies sent/received | Mentions made/received | Reactions received | Vibes bonus (small weight) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows || "|  | No eligible users | 0.00 | 0 | 0/0 | 0/0 | 0 | 0.00 |"}

## Run Stats

- Input messages: ${result.stats.inputMessages}
- Eligible non-bot messages: ${result.stats.eligibleMessages}
- Skipped bot/system messages: ${result.stats.skippedBotOrSystem}
- Ranked users: ${result.stats.users}
`;
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlReport(result, options) {
  const maxScore = Math.max(1, ...result.leaderboard.map((user) => user.score));
  const rows = result.leaderboard
    .map((user) => {
      const width = Math.max(4, Math.round((user.score / maxScore) * 100));
      return `<tr>
        <td class="rank">${user.rank}</td>
        <td><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.id)}</span></td>
        <td class="score">${user.score.toFixed(2)}</td>
        <td><div class="bar"><i style="width:${width}%"></i></div></td>
        <td>${user.messages}</td>
        <td>${user.repliesSent}/${user.repliesReceived}</td>
        <td>${user.mentionsMade}/${user.mentionsReceived}</td>
        <td>${user.reactionsReceived}</td>
        <td class="vibes">${user.vibesBonus.toFixed(2)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #181b22;
      --muted: #5d6675;
      --line: #d8dee8;
      --paper: #f7f8fb;
      --panel: #ffffff;
      --blue: #2f6fed;
      --green: #2b8f6f;
      --gold: #a66b00;
      --rose: #b13d63;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--paper);
      color: var(--ink);
    }
    header, main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    header {
      display: grid;
      gap: 10px;
      border-bottom: 1px solid var(--line);
    }
    h1 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.4rem); letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.5; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin: 20px 0;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .metric b { display: block; font-size: 1.35rem; }
    .metric span { color: var(--muted); font-size: 0.86rem; }
    .note {
      border-left: 4px solid var(--gold);
      background: #fff8e8;
      padding: 12px 14px;
      margin-bottom: 16px;
      color: #4d3500;
    }
    .table-wrap {
      overflow-x: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 880px; }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: middle;
      white-space: nowrap;
    }
    th {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0;
      background: #eef2f8;
    }
    td span { display: block; color: var(--muted); font-size: 0.76rem; margin-top: 2px; }
    tr:last-child td { border-bottom: 0; }
    .rank, .score, .vibes { font-variant-numeric: tabular-nums; }
    .score { font-weight: 700; color: var(--blue); }
    .vibes { color: var(--rose); }
    .bar {
      width: 180px;
      height: 10px;
      border-radius: 999px;
      background: #e8ecf4;
      overflow: hidden;
    }
    .bar i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--blue), var(--green));
    }
    footer {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 24px 24px;
      color: var(--muted);
      font-size: 0.86rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(options.title)}</h1>
    <p>${escapeHtml(options.window)}. Generated ${escapeHtml(options.generatedAt)}.</p>
  </header>
  <main>
    <section class="stats" aria-label="Run stats">
      <div class="metric"><b>${result.stats.inputMessages}</b><span>input messages</span></div>
      <div class="metric"><b>${result.stats.eligibleMessages}</b><span>eligible non-bot messages</span></div>
      <div class="metric"><b>${result.stats.skippedBotOrSystem}</b><span>bot/system messages skipped</span></div>
      <div class="metric"><b>${result.stats.users}</b><span>ranked users</span></div>
    </section>
    <p class="note"><strong>Vibes bonus (small weight):</strong> +${result.weights.vibesSignal.toFixed(2)} per friendly signal, capped at +${result.weights.vibesCap.toFixed(2)} total per user. It is intentionally smaller than replies, mentions, and reactions.</p>
    <section class="table-wrap" aria-label="Interaction leaderboard">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>User</th>
            <th>Score</th>
            <th>Score bar</th>
            <th>Messages</th>
            <th>Replies S/R</th>
            <th>Mentions M/R</th>
            <th>Reactions</th>
            <th>Vibes bonus</th>
          </tr>
        </thead>
        <tbody>
          ${rows || "<tr><td colspan=\"9\">No eligible users found.</td></tr>"}
        </tbody>
      </table>
    </section>
  </main>
  <footer>Scoring: message ${result.weights.message}, reply sent ${result.weights.replySent}, reply received ${result.weights.replyReceived}, mention made ${result.weights.mentionMade}, mention received ${result.weights.mentionReceived}, reaction received ${result.weights.reactionReceived}, attachment message ${result.weights.attachmentMessage}.</footer>
</body>
</html>
`;
}

function writeOutputs(result, options) {
  fs.mkdirSync(options.out, { recursive: true });
  fs.mkdirSync(path.dirname(options.homepage), { recursive: true });

  const jsonPath = path.join(options.out, "leaderboard.json");
  const markdownPath = path.join(options.out, "leaderboard.md");

  fs.writeFileSync(jsonPath, JSON.stringify({ ...result, generatedAt: options.generatedAt }, null, 2) + "\n");
  fs.writeFileSync(markdownPath, markdownReport(result, options));
  fs.writeFileSync(options.homepage, htmlReport(result, options));

  return { jsonPath, markdownPath, homepagePath: options.homepage };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const out = path.resolve(args.out);
  const homepage = path.resolve(args.homepage);
  const generatedAt = new Date().toISOString();
  const rawMessages = loadMessages(inputPath);
  const result = computeLeaderboard(rawMessages);
  const files = writeOutputs(result, {
    out,
    homepage,
    title: args.title,
    window: args.window,
    generatedAt
  });

  console.log(JSON.stringify({ ok: true, stats: result.stats, files }, null, 2));
}

main();
