import process from "node:process";

export const INSTALL_PROFILES = [
  {
    id: "packages",
    label: "Published packages",
    detail: "fast default; uses npm-published @elizaos/* packages",
  },
  {
    id: "local",
    label: "Local elizaOS source",
    detail: "clones or restores ./eliza and links workspace packages",
  },
  {
    id: "all",
    label: "All developer paths",
    detail: "runs packages first, then local elizaOS source mode",
  },
];

const PROFILE_IDS = new Set(INSTALL_PROFILES.map((profile) => profile.id));
const INSTALL_ORDER = ["packages", "local"];

function uniqueProfileIds(ids) {
  return [...new Set(ids)];
}

export function defaultInstallProfileIds() {
  return ["packages"];
}

export function parseInstallProfileList(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  const ids = value
    .split(/[\s,]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  for (const id of ids) {
    if (!PROFILE_IDS.has(id)) {
      throw new Error(
        `Unknown install profile "${id}". Use packages, local, or all.`,
      );
    }
  }

  return uniqueProfileIds(ids);
}

export function expandInstallProfileIds(ids) {
  const expanded = new Set();
  for (const id of ids.length > 0 ? ids : defaultInstallProfileIds()) {
    if (id === "all") {
      for (const orderedId of INSTALL_ORDER) {
        expanded.add(orderedId);
      }
      continue;
    }
    if (id === "local") {
      expanded.add("packages");
    }
    expanded.add(id);
  }

  return INSTALL_ORDER.filter((id) => expanded.has(id));
}

export function buildInstallPlan(
  profileIds,
  bunInstallArgs,
  env = process.env,
) {
  const nodeCommand =
    env.MILADY_NODE_PATH || env.npm_config_node || process.execPath;

  return expandInstallProfileIds(profileIds).map((id) => {
    if (id === "packages") {
      const packageArgs = [
        "scripts/eliza-source-mode.mjs",
        "packages",
        "--install",
      ];
      if (bunInstallArgs.length > 0) {
        packageArgs.push("--", ...bunInstallArgs);
      }
      return {
        id,
        command: nodeCommand,
        args: packageArgs,
        env: {
          ...env,
          MILADY_ELIZA_SOURCE: env.MILADY_ELIZA_SOURCE || "packages",
        },
      };
    }

    const localArgs = ["scripts/eliza-source-mode.mjs", "local"];
    if (bunInstallArgs.length > 0) {
      localArgs.push("--install", "--", ...bunInstallArgs);
    }

    return {
      id,
      command: nodeCommand,
      args: localArgs,
      env: {
        ...env,
        MILADY_ELIZA_SOURCE: "local",
        MILADY_SKIP_LOCAL_UPSTREAMS: "",
        ELIZA_SKIP_LOCAL_UPSTREAMS: "",
      },
    };
  });
}

export function normalizeInstallState(state) {
  const cursor =
    Number.isInteger(state.cursor) && state.cursor >= 0
      ? state.cursor % INSTALL_PROFILES.length
      : 0;
  const selectedIds = uniqueProfileIds(
    state.selectedIds.filter((id) => PROFILE_IDS.has(id)),
  );

  return {
    cursor,
    selectedIds:
      selectedIds.length > 0 ? selectedIds : defaultInstallProfileIds(),
  };
}

function moveCursor(cursor, delta) {
  return (cursor + delta + INSTALL_PROFILES.length) % INSTALL_PROFILES.length;
}

export function applyInstallProfileKey(state, key) {
  const current = normalizeInstallState(state);

  if (key === "\u001b[A") {
    return { ...current, cursor: moveCursor(current.cursor, -1) };
  }
  if (key === "\u001b[B") {
    return { ...current, cursor: moveCursor(current.cursor, 1) };
  }
  if (key !== " ") {
    return current;
  }

  const profile = INSTALL_PROFILES[current.cursor];
  const selected = new Set(current.selectedIds);
  if (selected.has(profile.id)) {
    selected.delete(profile.id);
  } else {
    selected.add(profile.id);
  }

  return {
    ...current,
    selectedIds: selected.size > 0 ? [...selected] : defaultInstallProfileIds(),
  };
}

export function renderInstallProfilePrompt(state) {
  const current = normalizeInstallState(state);
  const selected = new Set(current.selectedIds);
  const lines = [
    "Choose Milady install paths",
    "Space to select, Enter to install",
    "",
  ];

  INSTALL_PROFILES.forEach((profile, index) => {
    const pointer = index === current.cursor ? ">" : " ";
    const marker = selected.has(profile.id) ? "x" : " ";
    lines.push(`${pointer} [${marker}] ${profile.label}`);
    lines.push(`      ${profile.detail}`);
  });

  return `${lines.join("\n")}\n`;
}

export async function promptInstallProfiles({
  input = process.stdin,
  output = process.stdout,
  processRef = process,
} = {}) {
  let state = { cursor: 0, selectedIds: defaultInstallProfileIds() };
  const wasRaw = input.isRaw ?? false;

  function render() {
    output.write("\u001b[2J\u001b[H");
    output.write(renderInstallProfilePrompt(state));
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let rawModeRestored = false;

    function restoreRawMode() {
      if (rawModeRestored) return;
      rawModeRestored = true;
      if (typeof input.setRawMode === "function") {
        input.setRawMode(wasRaw);
      }
    }

    function cleanup() {
      if (settled) return;
      settled = true;
      input.off("data", onData);
      input.off("error", onError);
      processRef.off("SIGINT", onSigint);
      processRef.off("SIGTERM", onSigterm);
      processRef.off("beforeExit", restoreRawMode);
      processRef.off("exit", restoreRawMode);
      restoreRawMode();
      output.write("\n");
    }

    function finish(callback, value) {
      cleanup();
      callback(value);
    }

    function onError(error) {
      finish(reject, error);
    }

    function onSigint() {
      finish(reject, new Error("Install cancelled by SIGINT."));
    }

    function onSigterm() {
      finish(reject, new Error("Install cancelled by SIGTERM."));
    }

    function onData(chunk) {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        finish(reject, new Error("Install cancelled."));
        return;
      }
      if (key === "\r" || key === "\n") {
        finish(resolve, normalizeInstallState(state).selectedIds);
        return;
      }
      state = applyInstallProfileKey(state, key);
      try {
        render();
      } catch (error) {
        finish(reject, error);
      }
    }

    input.on("data", onData);
    input.once("error", onError);
    processRef.once("SIGINT", onSigint);
    processRef.once("SIGTERM", onSigterm);
    processRef.once("beforeExit", restoreRawMode);
    processRef.once("exit", restoreRawMode);

    try {
      if (typeof input.setRawMode === "function") {
        input.setRawMode(true);
      }
      input.resume();
      render();
    } catch (error) {
      finish(reject, error);
    }
  });
}
