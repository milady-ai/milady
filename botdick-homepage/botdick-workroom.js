import * as THREE from "three";
import { GLTFLoader } from "https://unpkg.com/three@0.164.1/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.querySelector("#botdick-workroom-canvas");
const renderState = document.querySelector("#workroom-render-state");
const motionLabel = document.querySelector("#workroom-motion-label");
const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const apiOrigin =
  window.BOTDICK_API_ORIGIN ||
  (window.location.protocol === "file:" || isLocalPreview ? "https://botdick.com" : "");
function apiPath(path) {
  return `${apiOrigin}${path}`;
}

const modelPaths = {
  idle: "./assets/3d/botdick-idle.glb",
  walking: "./assets/3d/botdick-walking.glb",
  running: "./assets/3d/botdick-running.glb",
};

if (canvas) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070c11);
  scene.fog = new THREE.Fog(0x070c11, 8, 18);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(3.05, 1.9, 5.45);
  camera.lookAt(0.44, 1.06, -0.12);

  const loader = new GLTFLoader();
  const clock = new THREE.Clock();
  let mixer = null;
  let activeModel = null;
  let currentMode = "idle";
  let modeLoading = null;
  let activeStationIndex = 0;
  let stationStartedAt = 0;
  const modelGroundY = 0.1;
  const runtimeBox = new THREE.Box3();

  const stations = [
    {
      id: "intake",
      title: "REQUEST",
      label: "messages + attachments",
      task: ["TASK CREATED", "read message", "parse attachments", "make receipt id"],
      color: 0x7ee06c,
      position: new THREE.Vector3(-3.46, 0, 1.18),
      cameraOffset: new THREE.Vector3(2.55, 2.08, 4.55),
      wait: 2.8,
    },
    {
      id: "plan",
      title: "PLAN",
      label: "scope + task shape",
      task: ["TASK ACCEPTED", "define artifact", "choose tool lane", "set progress loop"],
      color: 0xefc96f,
      position: new THREE.Vector3(-3.0, 0, -0.76),
      cameraOffset: new THREE.Vector3(2.6, 2.0, 4.35),
      wait: 2.9,
    },
    {
      id: "vps",
      title: "VPS",
      label: "workspace + process",
      task: ["WORKSPACE LIVE", "/opt/botdick", "session + logs", "one process only"],
      color: 0x43c7d9,
      position: new THREE.Vector3(-1.62, 0, -1.62),
      cameraOffset: new THREE.Vector3(2.25, 2.06, 4.1),
      wait: 3.1,
    },
    {
      id: "build",
      title: "CODE",
      label: "edit + test loop",
      task: ["BUILD LANE", "patch files", "run checks", "write blocker if failed"],
      color: 0xe34d3f,
      position: new THREE.Vector3(0.2, 0, -1.72),
      cameraOffset: new THREE.Vector3(2.4, 2.0, 4.05),
      wait: 3.2,
    },
    {
      id: "browser",
      title: "BROWSER",
      label: "preview + screenshot",
      task: ["VISUAL CHECK", "open live app", "inspect viewport", "capture proof"],
      color: 0xf2eadc,
      position: new THREE.Vector3(1.82, 0, -1.06),
      cameraOffset: new THREE.Vector3(2.6, 2.12, 4.18),
      wait: 3.4,
    },
    {
      id: "deploy",
      title: "DEPLOY",
      label: "wrangler + dns",
      task: ["SHIP LANE", "wrangler deploy", "verify domain", "return live url"],
      color: 0x43c7d9,
      position: new THREE.Vector3(3.12, 0, 0.32),
      cameraOffset: new THREE.Vector3(1.55, 2.18, 4.75),
      wait: 3.6,
    },
    {
      id: "publish",
      title: "PUBLISH",
      label: "site state + posts",
      task: ["PUBLIC SYNC", "update homepage", "add project card", "mirror receipt"],
      color: 0x7ee06c,
      position: new THREE.Vector3(1.35, 0, 1.62),
      cameraOffset: new THREE.Vector3(3.05, 2.18, 3.9),
      wait: 3.1,
    },
    {
      id: "social",
      title: "SOCIAL",
      label: "x drafts + replies",
      task: ["SOCIAL LOOP", "view X", "draft posts", "wait for approval"],
      color: 0xefc96f,
      position: new THREE.Vector3(-1.08, 0, 1.72),
      cameraOffset: new THREE.Vector3(3.0, 2.1, 4.15),
      wait: 3.2,
    },
  ];
  const stationAliases = new Map([
    ["heartbeat", "vps"],
    ["health", "vps"],
    ["alive", "vps"],
    ["ping", "vps"],
    ["request", "intake"],
    ["requests", "intake"],
    ["message", "intake"],
    ["messages", "intake"],
    ["discord", "intake"],
    ["attachment", "intake"],
    ["attachments", "intake"],
    ["message_received", "intake"],
    ["discord_message", "intake"],
    ["attachment_seen", "intake"],
    ["accepted", "plan"],
    ["idea", "plan"],
    ["ideas", "plan"],
    ["project_idea", "plan"],
    ["planning", "plan"],
    ["workspace", "vps"],
    ["worktree", "vps"],
    ["code", "build"],
    ["github", "build"],
    ["repo", "build"],
    ["action", "build"],
    ["tool", "build"],
    ["tool_call", "build"],
    ["runtime", "build"],
    ["model", "build"],
    ["model_call", "build"],
    ["provider", "build"],
    ["provider_call", "build"],
    ["llm", "build"],
    ["file", "build"],
    ["file_write", "build"],
    ["command", "vps"],
    ["command_run", "vps"],
    ["terminal", "vps"],
    ["wallet", "vps"],
    ["wallet_action", "vps"],
    ["evm", "vps"],
    ["evm_action", "vps"],
    ["solana", "vps"],
    ["solana_action", "vps"],
    ["screenshot", "browser"],
    ["screenshots", "browser"],
    ["image", "browser"],
    ["images", "browser"],
    ["image_generation", "browser"],
    ["image_generated", "browser"],
    ["video_generation", "browser"],
    ["computer_use", "browser"],
    ["browser_view", "browser"],
    ["browser_scan", "browser"],
    ["x_browser_scan", "browser"],
    ["research", "browser"],
    ["scan", "browser"],
    ["search", "browser"],
    ["news", "browser"],
    ["polymarket", "browser"],
    ["polymarket_scan", "browser"],
    ["preview", "browser"],
    ["x", "social"],
    ["twitter", "social"],
    ["x_view", "social"],
    ["x_draft", "social"],
    ["tweet", "social"],
    ["tweets", "social"],
    ["voice", "social"],
    ["tts", "social"],
    ["audio", "social"],
    ["audio_generation", "social"],
    ["feed", "intake"],
    ["feed_token", "intake"],
    ["feed_tokens", "intake"],
    ["snack", "intake"],
    ["snacks", "intake"],
    ["ad", "publish"],
    ["ads", "publish"],
    ["board", "publish"],
    ["post", "publish"],
    ["posts", "publish"],
    ["site", "publish"],
    ["pages", "deploy"],
  ]);
  stations.forEach((station) => {
    station.defaultLabel = station.label;
    station.defaultTask = station.task.slice();
  });
  const stationTravelSeconds = 3.6;
  const stationMarkers = new Map();
  let routeFrom = stations[0].position.clone();
  let routeTo = stations[0].position.clone();
  let targetStationIndex = 0;
  let movementStartedAt = 0;
  let movingToLiveTarget = false;
  let hasLiveTask = false;
  let currentPopupStation = "";
  let statusScreen = null;
  let agentScreen = null;
  let traceScreen = null;
  let adScreen = null;
  let feederScreen = null;
  let liveAds = [];
  let liveFeed = { drops: [], leaderboard: [] };
  let currentAdIndex = -1;
  let currentFeederStamp = "";
  const snackTokens = new Map();
  const eatenSnackIds = new Set();
  const cameraDesired = new THREE.Vector3();
  const cameraLookTarget = new THREE.Vector3();
  const actorLookTarget = new THREE.Vector3();
  const snackTarget = new THREE.Vector3();

  function splitTaskText(value) {
    const words = String(value || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > 28 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
      if (lines.length >= 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    return lines;
  }

  function canonicalStationId(value) {
    const raw = String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return stationAliases.get(raw) || raw || "intake";
  }

  function stationIndexFor(value) {
    const id = canonicalStationId(value);
    const index = stations.findIndex((station) => station.id === id);
    return index >= 0 ? index : 0;
  }

  function latestEventForStation(events, stationId) {
    return events.find((item) => eventStationId(item) === stationId);
  }

  function eventStationId(event) {
    const candidates = [
      event?.station,
      event?.meta?.station,
      event?.type,
      event?.action,
      event?.meta?.tool,
      event?.meta?.action,
      event?.title,
    ];
    for (const candidate of candidates) {
      const id = canonicalStationId(candidate);
      if (stations.some((station) => station.id === id)) return id;
    }
    return "intake";
  }

  function isSeedEvent(event) {
    const id = String(event?.id || "");
    return id.startsWith("seed-") || String(event?.meta?.source || event?.source || "") === "seed";
  }

  function isSeedTask(task) {
    const id = String(task?.id || "");
    return id.startsWith("task-homepage-") || String(task?.source || "") === "seed";
  }

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
    "browser_scan",
    "x_browser_scan",
    "polymarket_scan",
    "news_scan",
    "request",
    "message_received",
    "discord_message",
    "attachment_seen",
    "provider_call",
    "github_issue",
    "github_pr",
    "wallet_action",
    "evm_action",
    "solana_action",
    "deploy_started",
    "deploy_finished",
    "x_view",
    "x_draft",
    "post",
    "task_started",
    "task_update",
  ]);

  function isToolTelemetryEvent(event) {
    if (!event || isSeedEvent(event)) return false;
    const type = String(event.type || "");
    return (
      toolTelemetryTypes.has(type) ||
      Boolean(event.action || event.meta?.tool || event.meta?.command || event.meta?.inputPreview)
    );
  }

  function eventKindLabel(event) {
    const type = String(event?.type || "event").replace(/_/g, " ").toUpperCase();
    if (type === "COMMAND RUN") return "REAL COMMAND";
    if (type === "FILE WRITE") return "REAL FILE TOOL";
    if (type === "COMPUTER USE") return "REAL BROWSER TOOL";
    if (type === "BROWSER SCAN" || type === "X BROWSER SCAN") return "BROWSER SCAN";
    if (type === "POLYMARKET SCAN") return "MARKET SCAN";
    if (type === "PROVIDER CALL") return "MODEL ROUTE";
    if (type === "MESSAGE RECEIVED" || type === "DISCORD MESSAGE") return "REQUEST";
    if (type === "ATTACHMENT SEEN") return "ATTACHMENT";
    if (type === "TOOL CALL") return "TOOL CALL";
    if (type.startsWith("DEPLOY")) return "DEPLOY RECEIPT";
    return type;
  }

  function toolNameForEvent(event) {
    return String(
      event?.meta?.tool ||
        event?.action ||
        event?.meta?.action ||
        event?.title ||
        event?.summary ||
        "tool",
    );
  }

  function taskLinesForEvent(event) {
    const tool = toolNameForEvent(event);
    const command = String(event?.meta?.command || "");
    const input = String(event?.meta?.inputPreview || "");
    const url = String(event?.url || event?.meta?.url || "");
    const status = String(event?.status || event?.meta?.status || "");
    const body = String(event?.body || event?.summary || url || status || "");
    return [
      eventKindLabel(event),
      tool,
      ...(command ? splitTaskText(command) : splitTaskText(body || input)),
      ...(url && !body.includes(url) ? splitTaskText(url).slice(0, 1) : []),
    ].slice(0, 4);
  }

  function startMovementTo(index) {
    const nextIndex = Math.max(0, Math.min(stations.length - 1, index));
    targetStationIndex = nextIndex;
    routeFrom.copy(root.position);
    routeTo.copy(stations[nextIndex].position);
    movementStartedAt = clock.elapsedTime;
    movingToLiveTarget = !prefersReducedMotion && routeFrom.distanceTo(routeTo) > 0.08;
    if (!movingToLiveTarget) {
      activeStationIndex = nextIndex;
      root.position.copy(routeTo);
    }
  }

  function applyLiveState(state) {
    const events = Array.isArray(state?.events) ? state.events : [];
    const actualEvents = events.filter((event) => !isSeedEvent(event));
    const toolEvents = actualEvents.filter(isToolTelemetryEvent);
    const actualTasks = Array.isArray(state?.lifecycle?.tasks)
      ? state.lifecycle.tasks.filter((task) => !isSeedTask(task))
      : [];
    hasLiveTask = Boolean(toolEvents.length);

    for (const station of stations) {
      station.live = false;
      station.liveType = "";
      station.label = station.defaultLabel;
      station.task = station.defaultTask.slice();
    }

    for (const station of stations) {
      const event = latestEventForStation(toolEvents, station.id);
      if (!event) continue;

      station.live = true;
      station.liveType = eventKindLabel(event);
      station.label = toolNameForEvent(event);
      station.task = taskLinesForEvent(event);
    }
    for (const station of stations) {
      stationMarkers.get(station.id)?.redrawLabel?.();
    }
    renderScreensFromState(state);
    currentPopupStation = "";

    if (!hasLiveTask) {
      startMovementTo(0);
      movingToLiveTarget = false;
      return;
    }

    const targetStation = eventStationId(toolEvents[0]) || stations[activeStationIndex]?.id;
    const nextIndex = stationIndexFor(targetStation);
    if (nextIndex !== activeStationIndex) {
      startMovementTo(nextIndex);
    }
  }

  const root = new THREE.Group();
  const room = new THREE.Group();
  const kinetic = [];
  scene.add(root, room);
  root.position.copy(stations[0].position);

  const matFloor = new THREE.MeshStandardMaterial({
    color: 0x0a1218,
    roughness: 0.76,
    metalness: 0.12,
  });
  const matMetal = new THREE.MeshStandardMaterial({
    color: 0x18222b,
    roughness: 0.58,
    metalness: 0.28,
  });
  const matDark = new THREE.MeshStandardMaterial({
    color: 0x080d12,
    roughness: 0.72,
    metalness: 0.16,
  });
  const matGreen = new THREE.MeshBasicMaterial({
    color: 0x7ee06c,
    transparent: true,
    opacity: 0.8,
  });
  const matCyan = new THREE.MeshBasicMaterial({
    color: 0x43c7d9,
    transparent: true,
    opacity: 0.72,
  });
  const matRed = new THREE.MeshBasicMaterial({
    color: 0xe34d3f,
    transparent: true,
    opacity: 0.75,
  });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(13, 9), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 5.6),
    new THREE.MeshStandardMaterial({
      color: 0x0b1218,
      roughness: 0.8,
      metalness: 0.04,
    }),
  );
  backWall.position.set(0, 2.78, -2.85);
  backWall.receiveShadow = true;
  room.add(backWall);

  const sideWall = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 5.6),
    new THREE.MeshStandardMaterial({
      color: 0x081016,
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  sideWall.position.set(-5.05, 2.78, 0);
  sideWall.rotation.y = Math.PI / 2;
  room.add(sideWall);

  const grid = new THREE.GridHelper(13, 26, 0x43c7d9, 0x182a34);
  grid.position.y = 0.012;
  grid.material.opacity = 0.34;
  grid.material.transparent = true;
  scene.add(grid);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.58, 0.18, 7),
    new THREE.MeshStandardMaterial({
      color: 0x111b22,
      roughness: 0.48,
      metalness: 0.5,
    }),
  );
  platform.position.set(0.62, 0.08, 0.28);
  platform.rotation.y = 0.18;
  platform.castShadow = true;
  platform.receiveShadow = true;
  room.add(platform);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.48, 0.012, 8, 96),
    matCyan,
  );
  ring.position.set(0.62, 0.2, 0.28);
  ring.rotation.x = Math.PI / 2;
  room.add(ring);
  kinetic.push({ mesh: ring, kind: "spin", speed: 0.14 });

  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.86), matMetal);
  desk.position.set(-1.66, 0.7, -0.78);
  desk.castShadow = true;
  desk.receiveShadow = true;
  room.add(desk);

  const deskLegs = [
    [-2.98, 0.34, -1.08],
    [-0.34, 0.34, -1.08],
    [-2.98, 0.34, -0.48],
    [-0.34, 0.34, -0.48],
  ];
  for (const [x, y, z] of deskLegs) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.08), matDark);
    leg.position.set(x, y, z);
    leg.castShadow = true;
    room.add(leg);
  }

  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.035, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x10161c, roughness: 0.72 }),
  );
  keyboard.position.set(-1.22, 0.82, -0.4);
  keyboard.rotation.y = -0.04;
  keyboard.castShadow = true;
  room.add(keyboard);

  function wrapScreenLine(value, maxLength = 24) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}.` : text;
  }

  function drawScreenCanvas(textureCanvas, texture, label, body) {
    const ctx = textureCanvas.getContext("2d");
    const lines = body.map((line) => wrapScreenLine(line)).slice(0, 5);
    ctx.fillStyle = "#050b10";
    ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
    ctx.fillStyle = "rgba(67,199,217,0.13)";
    for (let i = 0; i < 12; i += 1) {
      ctx.fillRect(32, 64 + i * 25, 694 - i * 23, 3);
    }
    ctx.fillStyle = "rgba(126,224,108,0.2)";
    ctx.fillRect(32, 320, 500, 42);
    ctx.fillStyle = "#7ee06c";
    ctx.font = "800 42px monospace";
    ctx.fillText(wrapScreenLine(label, 18), 34, 60);
    ctx.fillStyle = "#f2eadc";
    ctx.font = "30px monospace";
    lines.forEach((line, index) => ctx.fillText(line, 42, 134 + index * 50));
    texture.needsUpdate = true;
  }

  function createScreen(label, body, x, y, z, rotationY = 0, width = 1.12) {
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 768;
    textureCanvas.height = 432;

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    drawScreenCanvas(textureCanvas, texture, label, body);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.5625),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    room.add(mesh);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.1, width * 0.5625 + 0.1, 0.06),
      matDark,
    );
    frame.position.set(x, y, z - 0.045);
    frame.rotation.y = rotationY;
    frame.castShadow = true;
    room.add(frame);
    mesh.position.z += 0.01;
    return {
      mesh,
      textureCanvas,
      texture,
      update(nextLabel, nextBody) {
        drawScreenCanvas(textureCanvas, texture, nextLabel, nextBody);
      },
    };
  }

  function renderScreensFromState(state = {}) {
    const events = Array.isArray(state.events) ? state.events.filter((event) => !isSeedEvent(event)) : [];
    const toolEvents = events.filter(isToolTelemetryEvent);
    const posts = Array.isArray(state.posts) ? state.posts : [];
    const projects = Array.isArray(state.projects) ? state.projects : [];
    const lifecycleTasks = Array.isArray(state.lifecycle?.tasks)
      ? state.lifecycle.tasks.filter((task) => !isSeedTask(task))
      : [];
    const automationTasks = Array.isArray(state.automation?.tasks) ? state.automation.tasks : [];
    const latest = events[0] || {};
    const latestTool = toolEvents[0] || {};
    const secondTool = toolEvents[1] || {};
    const thirdTool = toolEvents[2] || {};
    const activeTask = lifecycleTasks[0] || {};
    const activeAutomation = automationTasks.find((task) => task.status && task.status !== "ready") || automationTasks[0] || {};
    const live = Boolean(toolEvents.length);
    const taskOnly = !live && Boolean(events.length || lifecycleTasks.length);

    statusScreen?.update("botdick", [
      `state: ${state.persistent ? "kv" : "static"}`,
      `tools: ${toolEvents.length}`,
      `tasks: ${lifecycleTasks.length}`,
      taskOnly ? "task updates only" : `station: ${live ? canonicalStationId(latestTool.station || "build") : "none"}`,
    ]);
    agentScreen?.update("tool calls", [
      latestTool.title || "no tool calls received",
      latestTool.meta?.tool ? `tool: ${latestTool.meta.tool}` : activeTask.title || "agent must emit tool telemetry",
      latestTool.meta?.command ? `cmd: ${latestTool.meta.command}` : secondTool.title || "waiting for hook/PTY event",
      latestTool.url || latestTool.image ? "receipt url/image attached" : thirdTool.title || "no call receipt yet",
    ]);
    traceScreen?.update("actual feed", [
      latestTool.body || (taskOnly ? "task status exists, but no tool call event was mirrored" : "no active tool event"),
      activeAutomation.title ? `auto: ${activeAutomation.title}` : `posts: ${posts.length}`,
      state.behaviors?.x?.status ? `x: ${state.behaviors.x.status}` : `projects: ${projects.length}`,
      latestTool.createdAt ? `at: ${String(latestTool.createdAt).slice(11, 19)}` : "POST /api/events type=tool_call",
	    ]);
	  }

  function renderAdScreen(elapsed = 0, force = false) {
    if (!adScreen) return;
    const ads = Array.isArray(liveAds) ? liveAds.filter((ad) => ad?.headline && ad?.body) : [];
    if (!ads.length) {
      if (currentAdIndex !== -2 || force) {
        currentAdIndex = -2;
        adScreen.update("ad board", ["300k BOTDICK slot", "queue via /api/ads", "rotates in this room", "no ad loaded"]);
      }
      return;
    }
    const nextIndex = Math.floor(elapsed / 7) % ads.length;
    if (nextIndex === currentAdIndex && !force) return;
    currentAdIndex = nextIndex;
    const ad = ads[nextIndex];
    adScreen.update("ad board", [
      ad.headline,
      ad.body,
      ad.name ? `from: ${ad.name}` : ad.displayAddress || "holder ad",
      ad.url ? "link attached" : `${ad.cost || "300000"} BOTDICK`,
    ]);
  }

  function renderFeederScreen(force = false) {
    if (!feederScreen) return;
    const leaders = Array.isArray(liveFeed.leaderboard) ? liveFeed.leaderboard.slice(0, 4) : [];
    const stamp = leaders.map((leader) => `${leader.name}:${leader.totalFed}`).join("|");
    if (stamp === currentFeederStamp && !force) return;
    currentFeederStamp = stamp;
    feederScreen.update(
      "feed board",
      leaders.length
        ? leaders.map((leader, index) => `#${index + 1} ${leader.name || leader.displayAddress}: ${leader.totalFed}`)
        : ["send token snacks", "holder credits hourly", "botdick eats them", "leaderboard appears here"],
    );
  }

	  statusScreen = createScreen("botdick", ["state: loading", "status: booting", "station: --", "tasks: --"], -2.18, 1.43, -1.68, -0.08, 1.18);
	  agentScreen = createScreen("tool calls", ["waiting for real call", "no staged fake work", "POST /api/events", "receipt pending"], -0.62, 1.35, -1.78, 0.08, 1.22);
	  traceScreen = createScreen("raw telemetry", ["no command yet", "no file patch yet", "no browser action yet", "botdick.com"], 0.9, 1.32, -1.66, 0.22, 1.1);
  adScreen = createScreen("ad board", ["300k BOTDICK slot", "queue via /api/ads", "rotates in this room", "no ad loaded"], 2.58, 1.55, -1.52, 0.36, 1.32);
  feederScreen = createScreen("feed board", ["send token snacks", "holder credits hourly", "botdick eats them", "leaderboard appears here"], -4.05, 1.34, 0.72, Math.PI / 2, 1.08);
	  renderScreensFromState(window.BOTDICK_LIVE_STATE || window.BOTDICK_CONTENT || {});
  renderAdScreen(0, true);
  renderFeederScreen(true);

  function createJobCard(label, color, x, y, z, phase) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.44, 0.035),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
      }),
    );
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.022, 0.045),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    rail.position.set(0, -0.14, 0.026);
    group.add(card, rail);

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 256;
    textureCanvas.height = 128;
    const ctx = textureCanvas.getContext("2d");
    ctx.fillStyle = "#f2eadc";
    ctx.font = "700 25px monospace";
    ctx.fillText(label, 20, 64);
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.34),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    );
    text.position.set(0, 0.04, 0.032);
    group.add(text);
    room.add(group);
    kinetic.push({ mesh: group, kind: "card", phase });
  }

  function createStationLabel(station, index) {
    const group = new THREE.Group();
    group.position.copy(station.position);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.62, 0.045, 6),
      new THREE.MeshStandardMaterial({
        color: 0x101820,
        roughness: 0.58,
        metalness: 0.42,
        emissive: station.color,
        emissiveIntensity: 0.08,
      }),
    );
    pad.position.y = 0.026;
    pad.rotation.y = index * 0.24;
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.01, 8, 64),
      new THREE.MeshBasicMaterial({
        color: station.color,
        transparent: true,
        opacity: 0.62,
      }),
    );
    halo.position.y = 0.07;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 512;
    textureCanvas.height = 256;
    const ctx = textureCanvas.getContext("2d");
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const redrawLabel = () => {
      const accent = `#${station.color.toString(16).padStart(6, "0")}`;
      ctx.fillStyle = "rgba(5,11,16,0.92)";
      ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, textureCanvas.width - 20, textureCanvas.height - 20);
      ctx.fillStyle = accent;
      ctx.font = "800 42px monospace";
      ctx.fillText(wrapScreenLine(station.title, 14), 28, 70);
      ctx.fillStyle = "#f2eadc";
      ctx.font = "700 26px monospace";
      ctx.fillText(wrapScreenLine(station.label, 25), 28, 126);
      ctx.fillStyle = station.live ? accent : "rgba(242,234,220,0.45)";
      ctx.font = "22px monospace";
      ctx.fillText(station.live ? station.liveType || "tool event" : `waiting ${String(index + 1).padStart(2, "0")}`, 28, 188);
      texture.needsUpdate = true;
    };
    redrawLabel();

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 0.49),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    );
    label.position.set(0, 0.88, -0.18);
    group.add(label);

    room.add(group);
    stationMarkers.set(station.id, { group, halo, label, redrawLabel });
    kinetic.push({ mesh: halo, kind: "station", phase: index * 0.7 });
  }

  stations.forEach(createStationLabel);

  function makeStationBlock(station, index) {
    const accent = station.color;
    const base = station.position;
    const group = new THREE.Group();
    group.position.copy(base);

    const consoleBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.2, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x101820,
        roughness: 0.54,
        metalness: 0.36,
        emissive: accent,
        emissiveIntensity: 0.025,
      }),
    );
    consoleBase.position.set(0.06, 0.22, -0.72);
    consoleBase.castShadow = true;
    consoleBase.receiveShadow = true;
    group.add(consoleBase);

    const consoleFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.32),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.22,
      }),
    );
    consoleFace.position.set(0.06, 0.48, -0.99);
    consoleFace.rotation.x = -0.22;
    group.add(consoleFace);
    kinetic.push({ mesh: consoleFace, kind: "blink", phase: index * 0.42 });

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1.46, 8),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.28,
      }),
    );
    beam.position.set(-0.46, 0.76, -0.62);
    group.add(beam);
    kinetic.push({ mesh: beam, kind: "blink", phase: index * 0.65 + 0.8 });

    if (station.id === "vps") {
      for (let row = 0; row < 4; row += 1) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.44), matMetal);
        rack.position.set(0.04, 0.38 + row * 0.2, -0.72);
        rack.castShadow = true;
        group.add(rack);
        const light = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.035, 0.02),
          row % 2 ? matGreen : matCyan,
        );
        light.position.set(-0.26, 0.38 + row * 0.2, -0.49);
        group.add(light);
        kinetic.push({ mesh: light, kind: "blink", phase: row * 0.9 });
      }
    }

    if (station.id === "browser") {
      const preview = new THREE.Mesh(
        new THREE.PlaneGeometry(1.04, 0.58),
        new THREE.MeshBasicMaterial({ color: 0xf2eadc, transparent: true, opacity: 0.18 }),
      );
      preview.position.set(0.12, 0.84, -0.98);
      preview.rotation.x = -0.08;
      group.add(preview);
      const shutter = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x43c7d9, transparent: true, opacity: 0.76 }),
      );
      shutter.position.set(0.12, 0.84, -0.96);
      group.add(shutter);
      kinetic.push({ mesh: shutter, kind: "scan", phase: 0.2 });
    }

    if (station.id === "deploy") {
      const upload = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.58, 4),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.34 }),
      );
      upload.position.set(0.1, 0.82, -0.7);
      upload.rotation.y = Math.PI / 4;
      group.add(upload);
      kinetic.push({ mesh: upload, kind: "float", phase: 1.1 });
    }

    if (station.id === "publish") {
      const publicPage = new THREE.Mesh(
        new THREE.BoxGeometry(1.08, 0.62, 0.035),
        new THREE.MeshBasicMaterial({ color: 0x7ee06c, transparent: true, opacity: 0.18 }),
      );
      publicPage.position.set(0.08, 0.82, -0.9);
      group.add(publicPage);
      for (let line = 0; line < 4; line += 1) {
        const row = new THREE.Mesh(
          new THREE.BoxGeometry(0.78 - line * 0.08, 0.026, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xf2eadc, transparent: true, opacity: 0.52 }),
        );
        row.position.set(-0.02, 0.94 - line * 0.12, -0.87);
        group.add(row);
      }
    }

    if (station.id === "social") {
      const antenna = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.012, 8, 48),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.72 }),
      );
      antenna.position.set(0.04, 0.92, -0.78);
      antenna.rotation.x = Math.PI / 2;
      group.add(antenna);
      kinetic.push({ mesh: antenna, kind: "spin", speed: 0.4 });
    }

    room.add(group);
  }

  stations.forEach(makeStationBlock);

  const taskCanvas = document.createElement("canvas");
  taskCanvas.width = 1024;
  taskCanvas.height = 512;
  const taskCtx = taskCanvas.getContext("2d");
  const taskTexture = new THREE.CanvasTexture(taskCanvas);
  taskTexture.colorSpace = THREE.SRGBColorSpace;

  const taskPopup = new THREE.Group();
  const taskPopupPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.46, 0.73),
    new THREE.MeshBasicMaterial({
      map: taskTexture,
      transparent: true,
      opacity: 0.96,
    }),
  );
  const taskPopupGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.58, 0.85),
    new THREE.MeshBasicMaterial({
      color: 0x43c7d9,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  taskPopupGlow.position.z = -0.012;
  taskPopup.add(taskPopupGlow, taskPopupPanel);
  taskPopup.position.set(0.3, 1.35, 0.6);
  room.add(taskPopup);

  function drawTaskPopup(station, nextStation, moving) {
    const accent = `#${station.color.toString(16).padStart(6, "0")}`;
    const headline = moving ? "HANDOFF" : station.live ? station.liveType || "TOOL CALL" : "ACTIVE LANE";
    const title = moving ? `${station.title} -> ${nextStation.title}` : station.title;
    const subtitle = moving
      ? `${station.label} / ${nextStation.label}`
      : station.label;
    const lines = moving
      ? [
          `finish: ${station.task[1] || station.label}`,
          `next: ${nextStation.task[1] || nextStation.label}`,
          `route: ${station.id} to ${nextStation.id}`,
        ]
      : station.task.slice(1);

    taskCtx.clearRect(0, 0, taskCanvas.width, taskCanvas.height);
    taskCtx.fillStyle = "rgba(5,11,16,0.94)";
    taskCtx.fillRect(0, 0, taskCanvas.width, taskCanvas.height);
    taskCtx.strokeStyle = accent;
    taskCtx.lineWidth = 8;
    taskCtx.strokeRect(18, 18, taskCanvas.width - 36, taskCanvas.height - 36);
    taskCtx.fillStyle = accent;
    taskCtx.font = "900 50px monospace";
    taskCtx.fillText(headline, 44, 82);
    taskCtx.fillStyle = "#f2eadc";
    taskCtx.font = moving ? "900 48px monospace" : "900 62px monospace";
    taskCtx.fillText(wrapScreenLine(title, moving ? 22 : 14), 44, 160);
    taskCtx.fillStyle = "rgba(242,234,220,0.78)";
    taskCtx.font = "700 34px monospace";
    taskCtx.fillText(wrapScreenLine(subtitle, 36), 46, 214);
    taskCtx.fillStyle = "rgba(242,234,220,0.92)";
    taskCtx.font = "700 30px monospace";
    lines.slice(0, 3).forEach((line, index) => {
      taskCtx.fillText(`> ${line}`, 56, 282 + index * 45);
    });
    taskCtx.fillStyle = "rgba(67,199,217,0.92)";
    taskCtx.font = "800 26px monospace";
    taskCtx.fillText(moving ? "moving through VPS task map" : "mirrored from active task", 56, 458);
    taskTexture.needsUpdate = true;
  }

  function drawStandbyPopup() {
    taskCtx.clearRect(0, 0, taskCanvas.width, taskCanvas.height);
    taskCtx.fillStyle = "rgba(5,11,16,0.94)";
    taskCtx.fillRect(0, 0, taskCanvas.width, taskCanvas.height);
    taskCtx.strokeStyle = "#728087";
    taskCtx.lineWidth = 8;
    taskCtx.strokeRect(18, 18, taskCanvas.width - 36, taskCanvas.height - 36);
    taskCtx.fillStyle = "#728087";
    taskCtx.font = "900 50px monospace";
    taskCtx.fillText("STANDBY", 44, 82);
    taskCtx.fillStyle = "#f2eadc";
    taskCtx.font = "900 58px monospace";
    taskCtx.fillText("WAITING FOR TOOLS", 44, 160);
    taskCtx.fillStyle = "rgba(242,234,220,0.78)";
    taskCtx.font = "700 34px monospace";
    taskCtx.fillText("task status is not a tool call", 46, 214);
    taskCtx.fillStyle = "rgba(242,234,220,0.92)";
    taskCtx.font = "700 30px monospace";
    taskCtx.fillText("> hook PreToolUse", 56, 282);
    taskCtx.fillText("> POST /api/events type=tool_call", 56, 327);
    taskCtx.fillText("> then the room moves", 56, 372);
    taskCtx.fillStyle = "rgba(67,199,217,0.92)";
    taskCtx.font = "800 26px monospace";
    taskCtx.fillText("static seed is not treated as work", 56, 458);
    taskTexture.needsUpdate = true;
  }

  const routePoints = stations.map((station) => station.position.clone().setY(0.08));
  routePoints.push(stations[0].position.clone().setY(0.08));
  const routeLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(routePoints),
    new THREE.LineBasicMaterial({
      color: 0x43c7d9,
      transparent: true,
      opacity: 0.3,
    }),
  );
  room.add(routeLine);

  createJobCard("VPS", 0x43c7d9, -2.1, 1.42, -2.18, 0);
  createJobCard("TEST", 0xf2eadc, 1.78, 1.18, -1.98, 1.7);
  createJobCard("SHIP", 0xe34d3f, 2.82, 1.02, -0.86, 3.2);
  createJobCard("POST", 0x7ee06c, 1.58, 1.36, 1.1, 4.1);

  for (let i = 0; i < 18; i += 1) {
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + (i % 3) * 0.01, 8, 8),
      i % 3 === 0 ? matGreen : i % 3 === 1 ? matCyan : matRed,
    );
    pulse.position.set(-4 + i * 0.42, 0.04, -2.2 + (i % 2) * 0.14);
    room.add(pulse);
    kinetic.push({ mesh: pulse, kind: "pulse", phase: i * 0.45 });
  }

  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.2, 0.78, -0.34),
    new THREE.Vector3(-0.66, 0.22, 0.04),
    new THREE.Vector3(0.28, 0.18, 0.18),
    new THREE.Vector3(0.92, 0.18, 0.34),
  ]);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cablePath, 48, 0.014, 8, false),
    new THREE.MeshBasicMaterial({ color: 0x43c7d9, transparent: true, opacity: 0.48 }),
  );
  room.add(cable);

  const rigLight = new THREE.PointLight(0x43c7d9, 3.4, 7.5);
  rigLight.position.set(-2.1, 2.55, 1.25);
  scene.add(rigLight);

  const redRim = new THREE.PointLight(0xe34d3f, 2.2, 6);
  redRim.position.set(2.4, 1.7, -1.4);
  scene.add(redRim);

  const keyLight = new THREE.DirectionalLight(0xf2eadc, 2.95);
  keyLight.position.set(3.1, 5.2, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 16;
  scene.add(keyLight);

  scene.add(new THREE.HemisphereLight(0x43c7d9, 0x050709, 1.2));

  function setRenderState(text) {
    if (renderState) renderState.textContent = text;
  }

  function setMotionLabel(text) {
    if (!motionLabel) return;
    motionLabel.textContent = text;
  }

  function frameModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? 1.78 / size.y : 1;

    model.scale.setScalar(scale);
    model.position.set(
      -center.x * scale,
      modelGroundY - box.min.y * scale,
      -center.z * scale,
    );
    model.rotation.y = -0.2;
  }

  function keepModelGrounded() {
    if (!activeModel) return;
    runtimeBox.setFromObject(activeModel);
    if (!Number.isFinite(runtimeBox.min.y)) return;

    const buriedBy = root.position.y + modelGroundY - runtimeBox.min.y;
    if (buriedBy > 0.002) {
      activeModel.position.y += buriedBy;
    }
  }

  async function loadMode(mode) {
    if (modeLoading === mode || (activeModel && currentMode === mode)) return;
    modeLoading = mode;
    currentMode = mode;
    setRenderState(`auto ${mode}`);

    const gltf = await loader.loadAsync(modelPaths[mode] || modelPaths.idle);

    if (activeModel) {
      root.remove(activeModel);
      activeModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => material.dispose?.());
        }
      });
    }

    activeModel = gltf.scene;
    activeModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    frameModel(activeModel);
    root.add(activeModel);

    mixer = null;
    if (gltf.animations.length > 0 && !prefersReducedMotion) {
      mixer = new THREE.AnimationMixer(activeModel);
      const action = mixer.clipAction(gltf.animations[0]);
      action.reset().fadeIn(0.2).play();
    }
    modeLoading = null;
    setRenderState(`auto ${mode}`);
  }

  function requestMode(mode) {
    loadMode(mode).catch((error) => {
      console.error(error);
      modeLoading = null;
      setRenderState("model error");
    });
  }

  function resizeWorkroom() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animateKinetics(elapsed) {
    for (const item of kinetic) {
      if (item.kind === "spin") {
        item.mesh.rotation.z = elapsed * item.speed;
        item.mesh.material.opacity = 0.55 + Math.sin(elapsed * 1.8) * 0.15;
      } else if (item.kind === "card") {
        item.mesh.position.y += Math.sin(elapsed * 1.4 + item.phase) * 0.0008;
        item.mesh.rotation.y = -0.42 + Math.sin(elapsed * 0.8 + item.phase) * 0.035;
      } else if (item.kind === "pulse") {
        item.mesh.position.x += 0.011;
        if (item.mesh.position.x > 4.2) item.mesh.position.x = -4.4;
        item.mesh.position.y = 0.05 + Math.sin(elapsed * 2.4 + item.phase) * 0.025;
      } else if (item.kind === "station") {
        item.mesh.rotation.z = elapsed * 0.24 + item.phase;
        item.mesh.material.opacity = 0.42 + Math.sin(elapsed * 1.8 + item.phase) * 0.12;
      } else if (item.kind === "blink") {
        item.mesh.material.opacity = 0.16 + Math.max(0, Math.sin(elapsed * 2.4 + item.phase)) * 0.58;
      } else if (item.kind === "scan") {
        item.mesh.position.y = 0.68 + ((elapsed * 0.22 + item.phase) % 0.34);
        item.mesh.material.opacity = 0.38 + Math.sin(elapsed * 4.2 + item.phase) * 0.18;
      } else if (item.kind === "float") {
        item.mesh.position.y = 0.82 + Math.sin(elapsed * 1.2 + item.phase) * 0.08;
        item.mesh.rotation.y = elapsed * 0.38 + item.phase;
      }
    }
  }

  function snackColor(kind) {
    const colors = {
      green: 0x7ee06c,
      cyan: 0x43c7d9,
      red: 0xe34d3f,
      gold: 0xefc96f,
      white: 0xf2eadc,
    };
    return colors[kind] || colors.green;
  }

  function createSnackToken(drop, index) {
    const group = new THREE.Group();
    const color = snackColor(drop.kind);
    const angle = index * 1.9 + Math.random() * 0.4;
    const radius = 1.15 + (index % 4) * 0.34;
    group.position.set(Math.cos(angle) * radius + 0.45, 0.18, Math.sin(angle) * radius + 0.18);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 18, 14),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.28,
        emissive: color,
        emissiveIntensity: 0.12,
      }),
    );
    ball.castShadow = true;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 18, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    group.add(glow, ball);
    room.add(group);
    return {
      drop,
      group,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.012, 0, (Math.random() - 0.5) * 0.012),
      phase: Math.random() * Math.PI * 2,
      eaten: false,
    };
  }

  function syncFeedTokens(feed = {}) {
    liveFeed = {
      drops: Array.isArray(feed.drops) ? feed.drops : [],
      leaderboard: Array.isArray(feed.leaderboard) ? feed.leaderboard : [],
    };
    const wanted = liveFeed.drops
      .filter((drop) => drop?.id && drop.status !== "eaten" && !eatenSnackIds.has(drop.id))
      .slice(0, 18);
    const wantedIds = new Set(wanted.map((drop) => drop.id));
    for (const [id, token] of snackTokens) {
      if (!wantedIds.has(id)) {
        room.remove(token.group);
        snackTokens.delete(id);
      }
    }
    wanted.forEach((drop, index) => {
      if (!snackTokens.has(drop.id)) {
        snackTokens.set(drop.id, createSnackToken(drop, index));
      }
    });
    renderFeederScreen(true);
  }

  function syncAds(ads = []) {
    liveAds = Array.isArray(ads) ? ads : [];
    currentAdIndex = -1;
    renderAdScreen(clock.elapsedTime, true);
  }

  function updateSnackTokens(elapsed) {
    for (const [id, token] of snackTokens) {
      if (token.eaten) {
        token.group.scale.multiplyScalar(0.88);
        token.group.position.y += 0.018;
        if (token.group.scale.x < 0.04) {
          room.remove(token.group);
          snackTokens.delete(id);
        }
        continue;
      }

      token.group.position.add(token.velocity);
      token.group.position.x = Math.max(-4.25, Math.min(3.75, token.group.position.x));
      token.group.position.z = Math.max(-2.1, Math.min(2.12, token.group.position.z));
      if (Math.abs(token.group.position.x) > 3.7) token.velocity.x *= -1;
      if (Math.abs(token.group.position.z) > 1.95) token.velocity.z *= -1;
      token.group.position.y = 0.15 + Math.abs(Math.sin(elapsed * 2.4 + token.phase)) * 0.12;
      token.group.rotation.x += 0.025;
      token.group.rotation.z += 0.018;
    }
  }

  function nearestSnackToken() {
    let nearest = null;
    let distance = Infinity;
    for (const token of snackTokens.values()) {
      if (token.eaten) continue;
      const nextDistance = root.position.distanceTo(token.group.position);
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = token;
      }
    }
    return nearest;
  }

  function smoothStep(value) {
    return value * value * (3 - 2 * value);
  }

  function updateStationMarkers(activeId, moving) {
    for (const [id, marker] of stationMarkers) {
      const isActive = id === activeId;
      marker.halo.material.opacity = isActive ? (moving ? 0.92 : 0.78) : 0.2;
      marker.group.scale.setScalar(isActive ? 1.08 : 0.98);
    }
  }

  function updateTaskMirror(station, nextStation, moving, elapsed) {
    if (!hasLiveTask) {
      if (currentPopupStation !== "standby") {
        currentPopupStation = "standby";
        drawStandbyPopup();
      }
      const desired = root.position.clone().add(new THREE.Vector3(0.62, 1.28 + Math.sin(elapsed * 1.6) * 0.03, 0.32));
      taskPopup.position.lerp(desired, 0.08);
      taskPopup.lookAt(camera.position);
      taskPopupGlow.material.opacity = 0.07;
      return;
    }

    const popupId = `${station.id}-${moving ? "handoff" : "task"}`;
    if (currentPopupStation !== popupId) {
      currentPopupStation = popupId;
      drawTaskPopup(station, nextStation, moving);
    }

    const side = moving ? -0.86 : 0.62;
    const desired = root.position.clone().add(new THREE.Vector3(side, 1.28 + Math.sin(elapsed * 2.2) * 0.04, 0.32));
    taskPopup.position.lerp(desired, 0.09);
    taskPopup.lookAt(camera.position);
    taskPopupGlow.material.opacity = moving ? 0.18 : 0.12;
  }

  function updateCameraRig(station, nextStation, moving, progress, elapsed) {
    const nextOffset = nextStation.cameraOffset || station.cameraOffset;
    const offset = station.cameraOffset.clone().lerp(nextOffset, moving ? progress : 0.18);
    const orbit = new THREE.Vector3(
      Math.sin(elapsed * 0.22) * 0.18,
      Math.sin(elapsed * 0.18 + 0.7) * 0.08,
      Math.cos(elapsed * 0.16) * 0.2,
    );

    cameraDesired.copy(root.position).add(offset).add(orbit);
    camera.position.lerp(cameraDesired, 0.055);

    actorLookTarget.copy(root.position);
    actorLookTarget.y = 1.0;
    if (moving) actorLookTarget.lerp(nextStation.position.clone().setY(0.86), 0.24);
    cameraLookTarget.lerp(actorLookTarget, 0.075);
    camera.lookAt(cameraLookTarget);
  }

  function updateActorRoute(elapsed) {
    const station = stations[activeStationIndex];
    const targetStation = stations[targetStationIndex] || station;
    let progress = 0;

    if (!hasLiveTask) {
      const snack = nearestSnackToken();
      if (snack) {
        snackTarget.copy(snack.group.position);
        snackTarget.y = 0;
        const distance = root.position.distanceTo(snackTarget);
        root.position.lerp(snackTarget, 0.035);
        const direction = snackTarget.clone().sub(root.position);
        if (direction.lengthSq() > 0.001) {
          root.rotation.y += (Math.atan2(direction.x, direction.z) - root.rotation.y) * 0.08;
        }
        requestMode(distance > 0.42 ? "walking" : "idle");
        setRenderState("snack route");
        setMotionLabel(`snack hunt / ${snack.drop.name || snack.drop.displayAddress || "holder"}`);
        updateStationMarkers("", false);
        updateTaskMirror(stations[0], stations[0], false, elapsed);
        updateCameraRig(stations[0], stations[0], false, progress, elapsed);
        if (distance < 0.34) {
          snack.eaten = true;
          eatenSnackIds.add(snack.drop.id);
          setMotionLabel(`ate token snack from ${snack.drop.name || "holder"}`);
        }
        return;
      }
      const standby = stations[0];
      root.position.lerp(standby.position, 0.05);
      const faceTarget = new THREE.Vector3(0, 0, -1);
      const idleYaw = Math.atan2(faceTarget.x, faceTarget.z) + Math.sin(elapsed * 0.38) * 0.16;
      root.rotation.y += (idleYaw - root.rotation.y) * 0.035;
      root.position.y = Math.sin(elapsed * 1.4) * 0.012;
      requestMode("idle");
      setRenderState("standby");
      setMotionLabel("standby / waiting for actual tool call");
      updateStationMarkers("", false);
      updateTaskMirror(standby, standby, false, elapsed);
      updateCameraRig(standby, standby, false, progress, elapsed);
      return;
    }

    if (movingToLiveTarget) {
      const rawProgress = (elapsed - movementStartedAt) / stationTravelSeconds;
      progress = smoothStep(Math.min(Math.max(rawProgress, 0), 1));
      root.position.lerpVectors(routeFrom, routeTo, progress);

      const direction = routeTo.clone().sub(routeFrom);
      root.rotation.y += (Math.atan2(direction.x, direction.z) - root.rotation.y) * 0.12;
      requestMode("walking");
      setRenderState("live route");
      setMotionLabel(`${station.title.toLowerCase()} -> ${targetStation.title.toLowerCase()}`);
      updateStationMarkers(targetStation.id, true);
      updateTaskMirror(station, targetStation, true, elapsed);
      updateCameraRig(station, targetStation, true, progress, elapsed);

      if (rawProgress >= 1) {
        activeStationIndex = targetStationIndex;
        movingToLiveTarget = false;
        root.position.copy(stations[activeStationIndex].position);
        requestMode("idle");
      }
      return;
    }

    root.position.lerp(station.position, 0.1);
    const faceTarget = new THREE.Vector3(0, 0, -1);
    const idleYaw = Math.atan2(faceTarget.x, faceTarget.z) + Math.sin(elapsed * 0.42) * 0.12;
    root.rotation.y += (idleYaw - root.rotation.y) * 0.04;
    root.position.y = Math.sin(elapsed * 1.35) * 0.01;
    requestMode("idle");
    setRenderState("live idle");
    setMotionLabel(`${station.title.toLowerCase()} / ${station.label}`);
    updateStationMarkers(station.id, false);
    updateTaskMirror(station, station, false, elapsed);
    updateCameraRig(station, station, false, progress, elapsed);
  }

  function animate() {
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    if (mixer) mixer.update(delta);
    updateActorRoute(elapsed);
    keepModelGrounded();
    animateKinetics(elapsed);
    updateSnackTokens(elapsed);
    renderAdScreen(elapsed);
    rigLight.intensity = 3.1 + Math.sin(elapsed * 1.7) * 0.34;
    redRim.intensity = 1.85 + Math.sin(elapsed * 1.15 + 1.2) * 0.22;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resizeWorkroom);
  window.addEventListener("botdick:state", (event) => {
    applyLiveState(event.detail);
  });
  window.addEventListener("botdick:ads", (event) => {
    syncAds(event.detail);
  });
  window.addEventListener("botdick:feed", (event) => {
    syncFeedTokens(event.detail);
  });
  if (window.BOTDICK_LIVE_STATE) {
    applyLiveState(window.BOTDICK_LIVE_STATE);
  }
  if (window.BOTDICK_ADS) {
    syncAds(window.BOTDICK_ADS);
  }
  if (window.BOTDICK_FEED) {
    syncFeedTokens(window.BOTDICK_FEED);
  }
  fetch(apiPath("/api/ads"), { headers: { Accept: "application/json" }, cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (payload?.ads) syncAds(payload.ads);
    })
    .catch(() => {});
  fetch(apiPath("/api/feed-tokens"), { headers: { Accept: "application/json" }, cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (payload) syncFeedTokens({ drops: payload.drops, leaderboard: payload.leaderboard });
    })
    .catch(() => {});
  resizeWorkroom();
  loadMode(currentMode)
    .catch((error) => {
      console.error(error);
      modeLoading = null;
      setRenderState("model error");
    });
  animate();
}
