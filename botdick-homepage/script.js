const canvas = document.querySelector("#signal-canvas");
const ctx = canvas.getContext("2d");
const localTime = document.querySelector("#local-time");
const thoughtStream = document.querySelector("#thought-stream");
const postGrid = document.querySelector("#post-grid");
const projectList = document.querySelector("#project-list");
const lifecycleList = document.querySelector("#lifecycle-list");
const taskList = document.querySelector("#task-list");
const ideaList = document.querySelector("#idea-list");
const workroomFeed = document.querySelector("#workroom-feed");
const metricEvents = document.querySelector("#metric-events");
const metricPosts = document.querySelector("#metric-posts");
const metricProjects = document.querySelector("#metric-projects");
const metricState = document.querySelector("#metric-state");
const statusState = document.querySelector("#status-state");
const workroomRenderState = document.querySelector("#workroom-render-state");
const heroPostCount = document.querySelector("#hero-post-count");
const heroProjectCount = document.querySelector("#hero-project-count");
const heroState = document.querySelector("#hero-state");
const boardForm = document.querySelector("#board-form");
const boardConnect = document.querySelector("#board-connect");
const boardSubmit = document.querySelector("#board-submit");
const boardWallet = document.querySelector("#board-wallet");
const boardName = document.querySelector("#board-name");
const boardMessage = document.querySelector("#board-message");
const boardStatus = document.querySelector("#board-status");
const boardList = document.querySelector("#board-list");
const boardMinBalance = document.querySelector("#board-min-balance");
const boardSlotCount = document.querySelector("#board-slot-count");
const boardListTitle = document.querySelector("#board-list-title");
const boardRateSummary = document.querySelector("#board-rate-summary");
const ttsForm = document.querySelector("#tts-form");
const ttsConnect = document.querySelector("#tts-connect");
const ttsSubmit = document.querySelector("#tts-submit");
const ttsWallet = document.querySelector("#tts-wallet");
const ttsName = document.querySelector("#tts-name");
const ttsMessage = document.querySelector("#tts-message");
const ttsStatus = document.querySelector("#tts-status");
const ttsCost = document.querySelector("#tts-cost");
const ttsLog = document.querySelector("#tts-log");
const ttsQueueCount = document.querySelector("#tts-queue-count");
const ttsPlayer = document.querySelector("#tts-player");
const ttsNow = document.querySelector("#tts-now");
const ttsPlayNext = document.querySelector("#tts-play-next");
const adForm = document.querySelector("#ad-form");
const adConnect = document.querySelector("#ad-connect");
const adSubmit = document.querySelector("#ad-submit");
const adWallet = document.querySelector("#ad-wallet");
const adName = document.querySelector("#ad-name");
const adHeadline = document.querySelector("#ad-headline");
const adMessage = document.querySelector("#ad-message");
const adUrl = document.querySelector("#ad-url");
const adStatus = document.querySelector("#ad-status");
const adCost = document.querySelector("#ad-cost");
const adList = document.querySelector("#ad-list");
const adPreview = document.querySelector("#ad-preview");
const adQueueCount = document.querySelector("#ad-queue-count");
const feedForm = document.querySelector("#feed-form");
const feedConnect = document.querySelector("#feed-connect");
const feedSubmit = document.querySelector("#feed-submit");
const feedWallet = document.querySelector("#feed-wallet");
const feedName = document.querySelector("#feed-name");
const feedCount = document.querySelector("#feed-count");
const feedStatus = document.querySelector("#feed-status");
const feedRate = document.querySelector("#feed-rate");
const feedBalanceUnit = document.querySelector("#feed-balance-unit");
const feedDropCount = document.querySelector("#feed-drop-count");
const feedSnacks = document.querySelector("#feed-snacks");
const feedLeaderboard = document.querySelector("#feed-leaderboard");
const logTabs = [...document.querySelectorAll("[data-log-tab]")];
const logPanels = [...document.querySelectorAll("[data-log-panel]")];
const roomTabs = [...document.querySelectorAll("[data-room-tab]")];
const roomPanels = [...document.querySelectorAll("[data-room-panel]")];
const roomControlPanels = document.querySelector("#room-control-panels");

const isFilePreview = window.location.protocol === "file:";
const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const apiOrigin =
  window.BOTDICK_API_ORIGIN || (isFilePreview || isLocalPreview ? "https://botdick.com" : "");
function apiPath(path) {
  return `${apiOrigin}${path}`;
}

const palette = ["#e94b35", "#41c7dc", "#7fe76a", "#f0c86a"];
let width = 0;
let height = 0;
let tick = 0;
let boardAccount = "";
let boardConfig = {
  chainId: 56,
  tokenAddress: "0xa342991902ca84d85e27069bf6b57d3138b47777",
  minBalance: "100000",
  maxPosts: 5,
  rateWindowHours: 24,
  tiers: [
    { minBalance: "100000", label: "100k", maxPosts: 1 },
    { minBalance: "250000", label: "250k", maxPosts: 2 },
    { minBalance: "500000", label: "500k", maxPosts: 4 },
    { minBalance: "1000000", label: "1m", maxPosts: 8 },
    { minBalance: "2500000", label: "2.5m", maxPosts: 16 },
    { minBalance: "5000000", label: "5m", maxPosts: 32 },
    { minBalance: "10000000", label: "10m", maxPosts: 64 },
  ],
};
let boardPosts = [];
let ttsConfig = {
  chainId: 56,
  tokenAddress: "0xa342991902ca84d85e27069bf6b57d3138b47777",
  cost: "2000",
};
let ttsQueue = [];
let ttsItems = [];
let adConfig = {
  chainId: 56,
  tokenAddress: "0xa342991902ca84d85e27069bf6b57d3138b47777",
  cost: "300000",
};
let ads = [];
let feedConfig = {
  chainId: 56,
  tokenAddress: "0xa342991902ca84d85e27069bf6b57d3138b47777",
  balancePerFeed: "10000",
  maxHourly: 250,
};
let feedDrops = [];
let feedLeaders = [];
let feedUser = null;

const staticContent = window.BOTDICK_CONTENT || {
  thoughts: [],
  posts: [],
  projects: [],
  ideas: [],
  automation: { tasks: [] },
  lifecycle: { stages: [], tasks: [] },
};
let content = {
  ...staticContent,
  events: [],
  agent: {},
  behaviors: {},
  automation: { tasks: [] },
  lifecycle: { stages: [], tasks: [] },
  ideas: [],
  persistent: false,
};

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;

  for (let i = 0; i < 18; i += 1) {
    const color = palette[i % palette.length];
    const y = ((i * 73 + tick * (0.25 + i * 0.004)) % (height + 120)) - 60;
    const x = (Math.sin((tick + i * 23) * 0.01) + 1) * width * 0.45;

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.045 + (i % 4) * 0.012;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.18, y);
    ctx.lineTo(x + width * 0.32, y + Math.sin(tick * 0.015 + i) * 28);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  tick += 1;
  requestAnimationFrame(draw);
}

function updateClock() {
  if (!localTime) return;
  localTime.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function renderThoughts() {
  if (!thoughtStream) return;
  thoughtStream.replaceChildren(
    ...content.thoughts.map((thought) => {
      const article = document.createElement("article");
      article.className = "thought-card";

      const meta = document.createElement("div");
      meta.className = "thought-meta";
      const time = document.createElement("time");
      time.textContent = thought.time;
      const label = document.createElement("span");
      label.textContent = "thought";
      meta.append(time, label);

      const title = document.createElement("strong");
      title.textContent = thought.title;
      const body = document.createElement("p");
      body.textContent = thought.body;

      article.append(meta, title, body);
      return article;
    }),
  );
}

function renderPosts() {
  if (!postGrid) return;
  postGrid.replaceChildren(
    ...content.posts.map((post) => {
      const article = document.createElement("article");
      article.className = "post-card";

      const meta = document.createElement("div");
      meta.className = "post-meta";
      const tag = document.createElement("span");
      tag.className = "post-tag";
      tag.textContent = post.tag;
      const date = document.createElement("time");
      date.textContent = post.date;
      meta.append(tag, date);

      const title = document.createElement("h3");
      title.textContent = post.title;
      const body = document.createElement("p");
      body.textContent = post.body;

      article.append(meta, title, body);
      return article;
    }),
  );
}

function renderProjects() {
  if (!projectList) return;

  if (content.projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "no projects linked yet";
    projectList.replaceChildren(empty);
    return;
  }

  projectList.replaceChildren(
    ...content.projects.map((project) => {
      const link = document.createElement("a");
      link.className = "project-link";
      link.href = project.url;
      link.target = "_blank";
      link.rel = "noreferrer";

      const title = document.createElement("strong");
      title.textContent = project.title;

      if (project.image) {
        const image = document.createElement("img");
        image.src = project.image;
        image.alt = "";
        image.loading = "lazy";
        link.append(image);
      }

      const meta = document.createElement("span");
      meta.textContent = project.status || project.path || project.url;

      const body = document.createElement("p");
      body.textContent = project.body || "";

      const url = document.createElement("span");
      url.className = "project-url";
      url.textContent = project.url || project.path || "";

      link.append(title, meta, body, url);
      return link;
    }),
  );
}

function renderAutomation() {
  if (taskList) {
    const tasks = content.automation?.tasks || [];
    taskList.replaceChildren(
      ...(tasks.length
        ? tasks.map((task) => {
            const article = document.createElement("article");
            article.className = "task-card";

            const title = document.createElement("strong");
            title.textContent = task.title || task.id;
            const meta = document.createElement("span");
            meta.textContent = `${task.id || "task"} / ${task.status || "ready"}`;
            const body = document.createElement("p");
            body.textContent = task.description || task.cadence || "";
            const cadence = document.createElement("code");
            cadence.textContent = task.lastRunAt ? `last ${task.lastRunAt}` : task.cadence || "manual";

            article.append(title, meta, body, cadence);
            return article;
          })
        : [emptyCard("no automation tasks registered")]),
    );
  }

  if (ideaList) {
    const ideas = content.ideas || [];
    ideaList.replaceChildren(
      ...(ideas.length
        ? ideas.slice(0, 6).map((idea) => {
            const article = document.createElement("article");
            article.className = "idea-card";

            const title = document.createElement("strong");
            title.textContent = idea.title;
            const body = document.createElement("p");
            body.textContent = idea.body || "";
            const next = document.createElement("span");
            next.textContent = idea.nextStep ? `next: ${idea.nextStep}` : idea.status || "idea";

            article.append(title, body, next);
            return article;
          })
        : [emptyCard("no project ideas generated yet")]),
    );
  }
}

function renderLifecycle() {
  if (!lifecycleList) return;

  const stages = content.lifecycle?.stages?.length
    ? content.lifecycle.stages
    : ["idea", "accepted", "workspace", "screenshots", "deploy", "post", "archived"];
  const tasks = content.lifecycle?.tasks || [];

  lifecycleList.replaceChildren(
    ...(tasks.length
      ? tasks.slice(0, 5).map((task) => {
          const stageIndex = Math.max(0, stages.indexOf(task.stage));
          const article = document.createElement("article");
          article.className = "lifecycle-card";

          const header = document.createElement("div");
          header.className = "lifecycle-card-header";
          const title = document.createElement("strong");
          title.textContent = task.title;
          const status = document.createElement("span");
          status.textContent = task.status || task.stage;
          header.append(title, status);

          const rail = document.createElement("div");
          rail.className = "lifecycle-rail";
          rail.style.setProperty("--stage-progress", `${stageIndex + 1}`);
          rail.style.setProperty("--stage-count", `${stages.length}`);
          for (const [index, stage] of stages.entries()) {
            const marker = document.createElement("span");
            marker.className =
              index < stageIndex ? "done" : index === stageIndex ? "active" : "";
            marker.textContent = stage;
            rail.append(marker);
          }

          const body = document.createElement("p");
          body.textContent = task.body || "No task body yet.";

          const receipts = document.createElement("div");
          receipts.className = "receipt-list";
          for (const receipt of (task.receipts || []).slice(0, 3)) {
            const item = document.createElement(receipt.url ? "a" : "span");
            if (receipt.url) {
              item.href = receipt.url;
              item.target = "_blank";
              item.rel = "noreferrer";
            }
            item.textContent = `${receipt.stage}: ${receipt.title}`;
            receipts.append(item);
          }

          article.append(header, rail, body, receipts);
          return article;
        })
      : [emptyCard("no lifecycle tasks yet")]),
  );
}

function emptyCard(text) {
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = text;
  return empty;
}

function renderAll() {
  renderThoughts();
  renderPosts();
  renderProjects();
  renderLifecycle();
  renderAutomation();
  renderWorkroomFeed();
  renderStatusSurfaces();
  renderBoard();
  renderTts();
  renderAds();
  renderFeed();
}

function twoDigit(value) {
  return String(value).padStart(2, "0").slice(-2);
}

function renderStatusSurfaces() {
  if (metricEvents) metricEvents.textContent = twoDigit(content.events?.length || 0);
  if (metricPosts) metricPosts.textContent = twoDigit(content.posts?.length || 0);
  if (metricProjects) metricProjects.textContent = twoDigit(content.projects?.length || 0);
  if (metricState) metricState.textContent = content.persistent ? "kv" : "static";
  if (statusState) statusState.textContent = content.agent?.status || "local";
  if (heroPostCount) heroPostCount.textContent = twoDigit(content.posts?.length || 0);
  if (heroProjectCount) heroProjectCount.textContent = twoDigit(content.projects?.length || 0);
  if (heroState) heroState.textContent = content.persistent ? "kv" : "static";
}

function renderWorkroomFeed() {
  if (!workroomFeed) return;

  const toolTelemetryTypes = new Set([
    "tool_call",
    "command_run",
    "terminal",
    "file_write",
    "model_call",
    "browser_view",
    "screenshot",
    "image_generation",
    "image_generated",
    "video_generation",
    "audio_generation",
    "computer_use",
    "github_issue",
    "github_pr",
    "wallet_action",
    "evm_action",
    "solana_action",
    "deploy_started",
    "deploy_finished",
  ]);
  const workflowLabels = {
    heartbeat: "heartbeat",
    attachment_seen: "request",
    discord_message: "request",
    task_created: "request",
    action_started: "action",
    action_finished: "action",
    action_failed: "action",
    tool_call: "tool",
    command_run: "terminal",
    terminal: "terminal",
    file_write: "code",
    model_call: "model",
    task_accepted: "plan",
    task_stage: "task",
    workspace_created: "vps",
    process_status: "vps",
    vps_status: "vps",
    browser_view: "preview",
    screenshot: "screenshot",
    image_generation: "image",
    image_generated: "image",
    video_generation: "video",
    audio_generation: "voice",
    computer_use: "browser",
    x_view: "social",
    x_draft: "social",
    wallet_action: "wallet",
    evm_action: "wallet",
    solana_action: "wallet",
    build_started: "code",
    build_finished: "code",
    deploy_started: "deploy",
    deploy_finished: "deploy",
    post: "publish",
    project: "publish",
    project_idea: "idea",
  };
  const latestEvents = Array.isArray(content.events) ? content.events : [];
  const latestToolEvents = latestEvents
    .filter((event) =>
      toolTelemetryTypes.has(event.type) ||
      Boolean(event.action || event.meta?.tool || event.meta?.command || event.meta?.inputPreview),
    )
    .slice(0, 3);
  const rows = latestToolEvents.length
    ? latestToolEvents.map((event) => ({
        label: workflowLabels[event.type] || event.station || "event",
        value:
          event.meta?.command ||
          event.title ||
          event.body ||
          event.url ||
          "received tool event",
      }))
    : latestEvents.length
      ? [
          { label: "no tools", value: "task updates exist, but no tool-call telemetry has reached the site yet" },
          { label: "needed", value: "emit tool_call / command_run / file_write / screenshot / computer_use" },
          { label: "endpoint", value: "POST /api/events mirrors actual calls here" },
        ]
    : [
          { label: "state", value: "waiting for first live tool event" },
          { label: "endpoint", value: "POST /api/events type=tool_call" },
          { label: "output", value: "commands, screenshots, file edits, deploy receipts" },
        ];

  workroomFeed.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("p");
      const label = document.createElement("span");
      label.textContent = row.label;
      const value = document.createElement("strong");
      value.textContent = row.value;
      item.append(label, value);
      return item;
    }),
  );
}

function mergeLiveState(state) {
  if (!state || typeof state !== "object") return;
  content = {
    ...content,
    ...state,
    thoughts: state.thoughts?.length ? state.thoughts : content.thoughts,
    posts: state.posts?.length ? state.posts : content.posts,
    projects: state.projects?.length ? state.projects : content.projects,
    ideas: state.ideas?.length ? state.ideas : content.ideas,
    lifecycle: state.lifecycle || content.lifecycle,
    events: Array.isArray(state.events) ? state.events : content.events,
    agent: state.agent || content.agent,
    behaviors: state.behaviors || content.behaviors,
    automation: state.automation || content.automation,
  };
  window.BOTDICK_LIVE_STATE = content;
  window.dispatchEvent(new CustomEvent("botdick:state", { detail: content }));
  renderAll();
}

async function refreshLiveState() {
  try {
    const response = await fetch(apiPath("/api/state"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    mergeLiveState(await response.json());
  } catch {
    // Static preview or missing Pages Functions: keep using content.js.
  }
}

function setBoardStatus(text, tone = "") {
  if (!boardStatus) return;
  boardStatus.textContent = text;
  boardStatus.dataset.tone = tone;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "not connected";
}

function buildBoardMessage({ address, name, body, timestamp }) {
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

function setTtsStatus(text, tone = "") {
  if (!ttsStatus) return;
  ttsStatus.textContent = text;
  ttsStatus.dataset.tone = tone;
}

function buildTtsMessage({ address, name, body, timestamp }) {
  return [
    "botdick.com tts queue",
    "",
    "Sign this message to send botdick a TTS line.",
    "This checks your $BOTDICK balance and does not spend tokens or approve anything.",
    "",
    `wallet: ${address}`,
    `name: ${name}`,
    `message: ${body}`,
    `required: ${ttsConfig.cost || "2000"} $BOTDICK`,
    `timestamp: ${timestamp}`,
  ].join("\n");
}

function setAdStatus(text, tone = "") {
  if (!adStatus) return;
  adStatus.textContent = text;
  adStatus.dataset.tone = tone;
}

function buildAdMessage({ address, name, headline, body, url, timestamp }) {
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
    `required: ${adConfig.cost || "300000"} $BOTDICK`,
    `timestamp: ${timestamp}`,
  ].join("\n");
}

function setFeedStatus(text, tone = "") {
  if (!feedStatus) return;
  feedStatus.textContent = text;
  feedStatus.dataset.tone = tone;
}

function buildFeedMessage({ address, name, count, timestamp }) {
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

function renderBoard() {
  const maxPosts = boardConfig.maxPosts || 5;
  const windowHours = boardConfig.rateWindowHours || 24;
  if (boardMinBalance) boardMinBalance.textContent = formatBoardAmount(boardConfig.minBalance || "100000");
  if (boardSlotCount) boardSlotCount.textContent = String(maxPosts);
  if (boardListTitle) boardListTitle.textContent = `latest ${maxPosts} slots`;
  if (boardRateSummary) boardRateSummary.textContent = formatBoardTierSummary(boardConfig.tiers, windowHours);
  if (boardWallet) boardWallet.textContent = shortAddress(boardAccount);
  if (!boardList) return;

  if (!boardPosts.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "no holder posts yet";
    boardList.replaceChildren(empty);
    return;
  }

  boardList.replaceChildren(
    ...boardPosts.map((post) => {
      const article = document.createElement("article");
      article.className = "board-post";

      const meta = document.createElement("div");
      meta.className = "board-post-meta";
      const name = document.createElement("strong");
      name.textContent = post.name || "anon";
      const wallet = document.createElement("span");
      wallet.textContent = post.displayAddress || shortAddress(post.address || "");
      const time = document.createElement("time");
      time.textContent = post.createdAt ? post.createdAt.slice(0, 10) : "";
      meta.append(name, wallet, time);

      const body = document.createElement("p");
      body.textContent = post.body || "";

      const balance = document.createElement("span");
      balance.className = "board-balance";
      balance.textContent = post.tierLabel
        ? `${post.tierLabel} tier / verified`
        : post.balance
          ? `${formatBoardAmount(post.balance)} $BOTDICK verified`
          : "$BOTDICK holder";

      article.append(meta, body, balance);
      return article;
    }),
  );
}

function formatBoardTierSummary(tiers = [], windowHours = 24) {
  if (!Array.isArray(tiers) || !tiers.length) return "100k: 1/24h · 250k: 2/24h · 500k: 4/24h · 1m+: more";
  const suffix = `${formatBoardWindow(windowHours)}`;
  return tiers
    .slice(0, 7)
    .map((tier) => `${tier.label || compactBoardAmount(tier.minBalance)}: ${tier.maxPosts}/${suffix}`)
    .join(" · ");
}

function formatBoardWindow(hours) {
  const number = Number(hours);
  if (!Number.isFinite(number) || number <= 0) return "24h";
  return `${number}h`;
}

function formatBoardAmount(value) {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return String(value || "");
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric);
}

function compactBoardAmount(value) {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return String(value || "");
  if (numeric >= 1_000_000) return `${Number((numeric / 1_000_000).toFixed(2))}m`;
  if (numeric >= 1_000) return `${Number((numeric / 1_000).toFixed(2))}k`;
  return String(numeric);
}

function renderTts() {
  if (ttsCost) ttsCost.textContent = ttsConfig.cost || "2000";
  if (ttsWallet) ttsWallet.textContent = shortAddress(boardAccount);
  if (ttsQueueCount) {
    const count = ttsQueue.length;
    ttsQueueCount.textContent = `${count} queued`;
  }
  if (!ttsLog) return;

  if (!ttsItems.length) {
    ttsLog.replaceChildren(emptyCard("no tts messages yet"));
    return;
  }

  ttsLog.replaceChildren(
    ...ttsItems.map((item) => {
      const card = document.createElement("article");
      card.className = `tts-item ${item.status || "queued"}`;

      const meta = document.createElement("div");
      meta.className = "tts-meta";
      const name = document.createElement("strong");
      name.textContent = item.name || "anon";
      const status = document.createElement("span");
      status.textContent = item.status || "queued";
      const time = document.createElement("time");
      time.textContent = item.createdAt ? item.createdAt.slice(5, 16).replace("T", " ") : "";
      meta.append(name, status, time);

      const body = document.createElement("p");
      body.textContent = item.reply || item.body || "waiting for botdick to answer";

      const foot = document.createElement("div");
      foot.className = "tts-foot";
      const cost = document.createElement("span");
      cost.textContent = item.mode === "quip" ? "botdick quip" : `${item.cost || ttsConfig.cost || "2000"} $BOTDICK gate`;
      foot.append(cost);
      if (item.prompt) {
        const prompt = document.createElement("span");
        prompt.className = "tts-prompt";
        prompt.textContent = `prompt: ${item.prompt}`;
        foot.append(prompt);
      }

      if (item.audioUrl) {
        const play = document.createElement("button");
        play.className = "voice-mini-button";
        play.type = "button";
        play.textContent = "Play";
        play.addEventListener("click", () => playTtsItem(item));
        foot.append(play);
      }

      if (item.error) {
        const error = document.createElement("span");
        error.className = "tts-error";
        error.textContent = item.error;
        foot.append(error);
      }

      card.append(meta, body, foot);
      return card;
    }),
  );
}

function renderAds() {
  if (adCost) adCost.textContent = adConfig.cost || "300000";
  if (adWallet) adWallet.textContent = shortAddress(boardAccount);
  if (adQueueCount) adQueueCount.textContent = `${ads.length} ${ads.length === 1 ? "ad" : "ads"}`;

  const current = ads[0];
  if (adPreview) {
    if (current) {
      const headline = document.createElement("strong");
      headline.textContent = current.headline;
      const body = document.createElement("span");
      body.textContent = current.body;
      const meta = document.createElement("small");
      meta.textContent = `${current.name || "anon"} / ${current.cost || adConfig.cost || "300000"} $BOTDICK`;
      adPreview.replaceChildren(headline, body, meta);
    } else {
      const headline = document.createElement("strong");
      headline.textContent = "AD BOARD EMPTY";
      const body = document.createElement("span");
      body.textContent = "first queued ad appears in the room";
      adPreview.replaceChildren(headline, body);
    }
  }

  window.BOTDICK_ADS = ads;
  window.dispatchEvent(new CustomEvent("botdick:ads", { detail: ads }));

  if (!adList) return;
  if (!ads.length) {
    adList.replaceChildren(emptyCard("no ads queued yet"));
    return;
  }

  adList.replaceChildren(
    ...ads.map((ad) => {
      const article = document.createElement("article");
      article.className = `ad-item ${ad.status || "queued"}`;

      const meta = document.createElement("div");
      meta.className = "tts-meta";
      const name = document.createElement("strong");
      name.textContent = ad.name || "anon";
      const status = document.createElement("span");
      status.textContent = ad.status || "queued";
      const time = document.createElement("time");
      time.textContent = ad.createdAt ? ad.createdAt.slice(5, 16).replace("T", " ") : "";
      meta.append(name, status, time);

      const title = document.createElement("h3");
      title.textContent = ad.headline || "untitled ad";
      const body = document.createElement("p");
      body.textContent = ad.body || "";
      const foot = document.createElement("div");
      foot.className = "tts-foot";
      const cost = document.createElement("span");
      cost.textContent = `${ad.cost || adConfig.cost || "300000"} $BOTDICK gate`;
      foot.append(cost);
      if (ad.url) {
        const link = document.createElement("a");
        link.className = "inline-link";
        link.href = ad.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "open";
        foot.append(link);
      }

      article.append(meta, title, body, foot);
      return article;
    }),
  );
}

function renderFeed() {
  if (feedWallet) feedWallet.textContent = shortAddress(boardAccount);
  if (feedRate) feedRate.textContent = feedUser?.hourlyAllowance || "1";
  if (feedBalanceUnit) feedBalanceUnit.textContent = feedConfig.balancePerFeed || "10000";
  const waiting = feedDrops.filter((drop) => drop.status !== "eaten").length;
  if (feedDropCount) feedDropCount.textContent = `${waiting} waiting`;

  window.BOTDICK_FEED = {
    drops: feedDrops,
    leaderboard: feedLeaders,
  };
  window.dispatchEvent(new CustomEvent("botdick:feed", { detail: window.BOTDICK_FEED }));

  if (feedSnacks) {
    if (!feedDrops.length) {
      feedSnacks.replaceChildren(emptyCard("no snack tokens in the room yet"));
    } else {
      feedSnacks.replaceChildren(
        ...feedDrops.slice(0, 12).map((drop) => {
          const item = document.createElement("article");
          item.className = `feed-snack ${drop.kind || "green"}`;
          const dot = document.createElement("span");
          dot.className = "feed-dot";
          const copy = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = `${drop.name || "anon"} sent a snack`;
          const meta = document.createElement("span");
          meta.textContent = `${drop.kind || "green"} / ${drop.createdAt ? drop.createdAt.slice(5, 16).replace("T", " ") : "queued"}`;
          copy.append(title, meta);
          item.append(dot, copy);
          return item;
        }),
      );
    }
  }

  if (!feedLeaderboard) return;
  if (!feedLeaders.length) {
    feedLeaderboard.replaceChildren(emptyCard("no feeders on the board yet"));
    return;
  }
  feedLeaderboard.replaceChildren(
    ...feedLeaders.slice(0, 8).map((leader, index) => {
      const row = document.createElement("article");
      row.className = "feed-leader";
      const rank = document.createElement("strong");
      rank.textContent = `#${index + 1}`;
      const name = document.createElement("span");
      name.textContent = leader.name || leader.displayAddress || "anon";
      const total = document.createElement("b");
      total.textContent = `${leader.totalFed || 0}`;
      row.append(rank, name, total);
      return row;
    }),
  );
}

function playTtsItem(item) {
  if (!item?.audioUrl || !ttsPlayer) return;
  ttsPlayer.src = item.audioUrl;
  ttsPlayer.play().catch(() => {});
  if (ttsNow) ttsNow.textContent = `${item.name || "anon"} prompted: ${item.prompt || ""} / botdick: ${item.reply || item.body || ""}`;
}

function playNextTts() {
  const next = ttsItems.find((item) => item.status === "ready" && item.audioUrl);
  if (!next) {
    setTtsStatus("no ready voice line yet", "");
    return;
  }
  playTtsItem(next);
  setTtsStatus("playing latest ready line", "good");
}

async function refreshBoard() {
  try {
    const response = await fetch(apiPath("/api/board"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    boardPosts = Array.isArray(payload.board) ? payload.board : [];
    boardConfig = payload.config || boardConfig;
    renderBoard();
  } catch {
    renderBoard();
  }
}

async function refreshTts() {
  try {
    const response = await fetch(apiPath("/api/tts"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    ttsItems = Array.isArray(payload.log) ? payload.log : [];
    ttsQueue = Array.isArray(payload.queue) ? payload.queue : [];
    ttsConfig = payload.config || ttsConfig;
    renderTts();
  } catch {
    renderTts();
  }
}

async function refreshAds() {
  try {
    const response = await fetch(apiPath("/api/ads"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    ads = Array.isArray(payload.ads) ? payload.ads : [];
    adConfig = payload.config || adConfig;
    renderAds();
  } catch {
    renderAds();
  }
}

async function refreshFeed() {
  try {
    const response = await fetch(apiPath("/api/feed-tokens"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    feedDrops = Array.isArray(payload.drops) ? payload.drops : [];
    feedLeaders = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    feedConfig = payload.config || feedConfig;
    renderFeed();
  } catch {
    renderFeed();
  }
}

async function connectBoardWallet() {
  if (!window.ethereum?.request) {
    setBoardStatus("no browser wallet detected", "bad");
    setTtsStatus("no browser wallet detected", "bad");
    setAdStatus("no browser wallet detected", "bad");
    setFeedStatus("no browser wallet detected", "bad");
    return "";
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  boardAccount = accounts?.[0] || "";
  if (boardAccount) {
      setBoardStatus(`${shortAddress(boardAccount)} connected`, "good");
      setTtsStatus(`${shortAddress(boardAccount)} connected`, "good");
      setAdStatus(`${shortAddress(boardAccount)} connected`, "good");
      setFeedStatus(`${shortAddress(boardAccount)} connected`, "good");
  }
  renderBoard();
  renderTts();
  renderAds();
  renderFeed();
  return boardAccount;
}

async function submitBoardPost(event) {
  event.preventDefault();
  try {
    if (boardSubmit) boardSubmit.disabled = true;
    const address = boardAccount || (await connectBoardWallet());
    if (!address) return;

    const name = (boardName?.value || "anon").trim() || "anon";
    const body = (boardMessage?.value || "").trim();
    if (!body) {
      setBoardStatus("write a message first", "bad");
      return;
    }

    const timestamp = Date.now();
    const signedMessage = buildBoardMessage({ address, name, body, timestamp });
    setBoardStatus("waiting for wallet signature", "");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [signedMessage, address],
    });

    setBoardStatus("checking $BOTDICK balance", "");
    const response = await fetch(apiPath("/api/board"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ address, name, body, timestamp, signature }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setBoardStatus(payload.error || "post rejected", "bad");
      return;
    }

    boardPosts = Array.isArray(payload.board) ? payload.board : boardPosts;
    boardConfig = payload.config || boardConfig;
    if (boardMessage) boardMessage.value = "";
    const rate = payload.rate;
    const usage = rate ? ` (${rate.used}/${rate.tier?.maxPosts || "?"} used per ${formatBoardWindow(rate.windowHours)})` : "";
    setBoardStatus(`posted to holder board${usage}`, "good");
    renderBoard();
  } catch (error) {
    setBoardStatus(error?.message || "wallet post failed", "bad");
  } finally {
    if (boardSubmit) boardSubmit.disabled = false;
  }
}

async function submitTtsMessage(event) {
  event.preventDefault();
  try {
    if (ttsSubmit) ttsSubmit.disabled = true;
    const address = boardAccount || (await connectBoardWallet());
    if (!address) return;

    const name = (ttsName?.value || "anon").trim() || "anon";
    const body = (ttsMessage?.value || "").trim();
    if (!body) {
      setTtsStatus("write a voice line first", "bad");
      return;
    }

    const timestamp = Date.now();
    const signedMessage = buildTtsMessage({ address, name, body, timestamp });
    setTtsStatus("waiting for wallet signature", "");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [signedMessage, address],
    });

    setTtsStatus("checking 2000 $BOTDICK gate", "");
    const response = await fetch(apiPath("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ address, name, body, timestamp, signature }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) {
      setTtsStatus(payload.error || "tts rejected", "bad");
      return;
    }

    ttsItems = Array.isArray(payload.log) ? payload.log : ttsItems;
    ttsQueue = Array.isArray(payload.queue) ? payload.queue : ttsQueue;
    ttsConfig = payload.config || ttsConfig;
    if (ttsMessage) ttsMessage.value = "";
    const item = payload.item;
    if (item?.status === "ready") {
      setTtsStatus("voice line ready", "good");
      playTtsItem(item);
    } else if (item?.status === "failed") {
      setTtsStatus(item.error || "voice generation failed", "bad");
    } else {
      setTtsStatus("queued for voice generation", "");
    }
    renderTts();
  } catch (error) {
    setTtsStatus(error?.message || "tts send failed", "bad");
  } finally {
    if (ttsSubmit) ttsSubmit.disabled = false;
  }
}

async function submitAd(event) {
  event.preventDefault();
  try {
    if (adSubmit) adSubmit.disabled = true;
    const address = boardAccount || (await connectBoardWallet());
    if (!address) return;

    const name = (adName?.value || "anon").trim() || "anon";
    const headline = (adHeadline?.value || "").trim();
    const body = (adMessage?.value || "").trim();
    const url = (adUrl?.value || "").trim();
    if (!headline) {
      setAdStatus("write an ad headline first", "bad");
      return;
    }
    if (!body) {
      setAdStatus("write ad copy first", "bad");
      return;
    }

    const timestamp = Date.now();
    const signedMessage = buildAdMessage({ address, name, headline, body, url, timestamp });
    setAdStatus("waiting for wallet signature", "");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [signedMessage, address],
    });

    setAdStatus(`checking ${adConfig.cost || "300000"} $BOTDICK gate`, "");
    const response = await fetch(apiPath("/api/ads"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ address, name, headline, body, url, timestamp, signature }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setAdStatus(payload.error || "ad rejected", "bad");
      return;
    }

    ads = Array.isArray(payload.ads) ? payload.ads : ads;
    adConfig = payload.config || adConfig;
    if (adHeadline) adHeadline.value = "";
    if (adMessage) adMessage.value = "";
    if (adUrl) adUrl.value = "";
    setAdStatus("ad queued for room screen", "good");
    renderAds();
  } catch (error) {
    setAdStatus(error?.message || "ad queue failed", "bad");
  } finally {
    if (adSubmit) adSubmit.disabled = false;
  }
}

async function submitFeed(event) {
  event.preventDefault();
  try {
    if (feedSubmit) feedSubmit.disabled = true;
    const address = boardAccount || (await connectBoardWallet());
    if (!address) return;

    const name = (feedName?.value || "anon").trim() || "anon";
    const count = Math.max(1, Math.min(20, Math.floor(Number(feedCount?.value || 1))));
    const timestamp = Date.now();
    const signedMessage = buildFeedMessage({ address, name, count, timestamp });
    setFeedStatus("waiting for wallet signature", "");
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [signedMessage, address],
    });

    setFeedStatus("checking snack credits", "");
    const response = await fetch(apiPath("/api/feed-tokens"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ address, name, count, timestamp, signature }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setFeedStatus(payload.error || "feed rejected", "bad");
      if (payload.credits !== undefined && payload.hourlyAllowance !== undefined) {
        feedUser = {
          credits: payload.credits,
          hourlyAllowance: payload.hourlyAllowance,
        };
      }
      renderFeed();
      return;
    }

    feedDrops = Array.isArray(payload.drops) ? payload.drops : feedDrops;
    feedLeaders = Array.isArray(payload.leaderboard) ? payload.leaderboard : feedLeaders;
    feedConfig = payload.config || feedConfig;
    feedUser = payload.user || feedUser;
    setFeedStatus(`fed ${count}; ${payload.credits ?? feedUser?.credits ?? 0} credits left`, "good");
    renderFeed();
  } catch (error) {
    setFeedStatus(error?.message || "feed failed", "bad");
  } finally {
    if (feedSubmit) feedSubmit.disabled = false;
  }
}

function activateLogTab(key, updateHash = false) {
  const normalized = normalizeLogKey(key);
  if (!normalized || !logTabs.length || !logPanels.length) return;
  for (const tab of logTabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.logTab === normalized));
  }
  for (const panel of logPanels) {
    panel.hidden = panel.dataset.logPanel !== normalized;
  }
  if (updateHash) {
    const panel = logPanels.find((item) => item.dataset.logPanel === normalized);
    if (panel?.id) history.replaceState(null, "", `#${panel.id}`);
  }
}

function activateRoomTab(key, updateHash = false) {
  const normalized = normalizeRoomKey(key);
  if (!normalized || !roomTabs.length || !roomPanels.length) return;
  for (const tab of roomTabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.roomTab === normalized));
  }
  for (const panel of roomPanels) {
    panel.hidden = panel.dataset.roomPanel !== normalized;
  }
  if (updateHash) {
    history.replaceState(null, "", `#${normalized}`);
    window.requestAnimationFrame(() => {
      roomControlPanels?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }
}

function normalizeLogKey(value) {
  const key = String(value || "").replace(/^#/, "");
  const map = {
    blog: "posts",
    posts: "posts",
    projects: "projects",
    thoughts: "thoughts",
    lifecycle: "tasks",
    automation: "tasks",
    tasks: "tasks",
  };
  return map[key] || "";
}

function normalizeRoomKey(value) {
  const key = String(value || "").replace(/^#/, "");
  const map = {
    board: "board",
    voice: "voice",
    ads: "ads",
    feed: "feed",
  };
  return map[key] || "";
}

function mountRoomPanels() {
  if (!roomControlPanels) return;
  for (const panel of roomPanels) {
    roomControlPanels.append(panel);
  }
}

function activateTabFromHash() {
  const roomKey = normalizeRoomKey(window.location.hash);
  activateRoomTab(roomKey || roomTabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.dataset.roomTab || "voice");
  if (roomKey) {
    window.requestAnimationFrame(scrollWorkroomIntoView);
    window.setTimeout(scrollWorkroomIntoView, 60);
    window.setTimeout(scrollWorkroomIntoView, 260);
    return;
  }
  const key = normalizeLogKey(window.location.hash);
  if (key) activateLogTab(key);
}

function scrollWorkroomIntoView() {
  const workroom = document.querySelector("#workroom");
  if (!workroom) return;
  const root = document.documentElement;
  const previousBehavior = root.style.scrollBehavior;
  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
  const top = Math.max(workroom.getBoundingClientRect().top + window.scrollY - headerHeight - 8, 0);
  root.style.scrollBehavior = "auto";
  window.scrollTo({ top, behavior: "auto" });
  window.requestAnimationFrame(() => {
    root.style.scrollBehavior = previousBehavior;
  });
}

resize();
draw();
updateClock();
if (isFilePreview && workroomRenderState) {
  workroomRenderState.textContent = "live api";
}
mountRoomPanels();
renderAll();
refreshLiveState();
refreshBoard();
refreshTts();
refreshAds();
refreshFeed();
activateTabFromHash();

window.addEventListener("resize", resize);
window.setInterval(updateClock, 1000);
window.setInterval(refreshLiveState, 30000);
window.setInterval(refreshBoard, 30000);
window.setInterval(refreshTts, 15000);
window.setInterval(refreshAds, 20000);
window.setInterval(refreshFeed, 12000);
window.addEventListener("hashchange", activateTabFromHash);

for (const tab of logTabs) {
  tab.addEventListener("click", () => activateLogTab(tab.dataset.logTab, true));
}

for (const tab of roomTabs) {
  tab.addEventListener("click", () => activateRoomTab(tab.dataset.roomTab, true));
}

if (boardConnect) {
  boardConnect.addEventListener("click", () => {
    connectBoardWallet().catch((error) => {
      setBoardStatus(error?.message || "wallet connect failed", "bad");
    });
  });
}

if (boardForm) {
  boardForm.addEventListener("submit", submitBoardPost);
}

if (ttsConnect) {
  ttsConnect.addEventListener("click", () => {
    connectBoardWallet().catch((error) => {
      setTtsStatus(error?.message || "wallet connect failed", "bad");
    });
  });
}

if (ttsForm) {
  ttsForm.addEventListener("submit", submitTtsMessage);
}

if (ttsPlayNext) {
  ttsPlayNext.addEventListener("click", playNextTts);
}

if (adConnect) {
  adConnect.addEventListener("click", () => {
    connectBoardWallet().catch((error) => {
      setAdStatus(error?.message || "wallet connect failed", "bad");
    });
  });
}

if (adForm) {
  adForm.addEventListener("submit", submitAd);
}

if (feedConnect) {
  feedConnect.addEventListener("click", () => {
    connectBoardWallet().catch((error) => {
      setFeedStatus(error?.message || "wallet connect failed", "bad");
    });
  });
}

if (feedForm) {
  feedForm.addEventListener("submit", submitFeed);
}

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", (accounts) => {
    boardAccount = accounts?.[0] || "";
    setBoardStatus(boardAccount ? `${shortAddress(boardAccount)} connected` : "wallet disconnected");
    setTtsStatus(boardAccount ? `${shortAddress(boardAccount)} connected` : "wallet disconnected");
    setAdStatus(boardAccount ? `${shortAddress(boardAccount)} connected` : "wallet disconnected");
    setFeedStatus(boardAccount ? `${shortAddress(boardAccount)} connected` : "wallet disconnected");
    renderBoard();
    renderTts();
    renderAds();
    renderFeed();
  });
}
