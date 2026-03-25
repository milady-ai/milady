/**
 * Intent detection and context-aware action compaction.
 *
 * Extracted from prompt-optimization.ts to keep files under ~500 LOC.
 * These helpers detect user intent from prompt content and strip
 * irrelevant action params to reduce context window usage.
 */

// ---------------------------------------------------------------------------
// Prompt compaction helpers
// ---------------------------------------------------------------------------

export function compactInitialCodeMarker(prompt: string): string {
  return prompt.replace(
    /initial code:\s*([0-9a-f]{8})[0-9a-f-]*/gi,
    "<initial_code>$1</initial_code>",
  );
}

// compactActionDocs removed — replaced by compactActionsForIntent which
// provides context-aware action formatting instead of blanket compaction.

export function compactRegistryCatalog(prompt: string): string {
  return prompt.replace(
    /\*\*Available Plugins from Registry \((\d+) total\):[\s\S]*?(?=\n## Project Context \(Workspace\)|\n### AGENTS\.md|$)/g,
    (_match, total: string) =>
      `**Available Plugins from Registry (${total} total):** [omitted in compact mode; query on demand]\n`,
  );
}

export function compactCodingActionExamples(prompt: string): string {
  const next = prompt.replace(
    /\n# Coding Agent Action Call Examples[\s\S]*?(?=\nPossible response actions:|\n# Available Actions|\n## Project Context \(Workspace\)|$)/g,
    "\n",
  );
  return next.replace(/\nPossible response actions:[^\n]*\n?/g, "\n");
}

export function compactUiCatalog(prompt: string): string {
  return prompt.replace(
    /\n## Rich UI Output — you can render interactive components in your replies[\s\S]*?(?=\n## Project Context \(Workspace\)|\n### AGENTS\.md|$)/g,
    "\n",
  );
}

export function compactLoadedPluginLists(prompt: string): string {
  const loadedCountMatch = prompt.match(
    /\*\*Loaded Plugins:\*\*[\s\S]*?(?=\n\*\*System Plugins:\*\*)/,
  );
  const loadedCount = loadedCountMatch
    ? (loadedCountMatch[0].match(/\n- /g)?.length ?? 0)
    : 0;

  return prompt.replace(
    /\n\*\*Loaded Plugins:\*\*[\s\S]*?(?=\n\*\*Available Plugins from Registry|\nNo access to role information|\nSECURITY ALERT:|$)/g,
    `\n**Loaded Plugins:** ${loadedCount} loaded [list omitted in compact mode]`,
  );
}

export function compactEmoteCatalog(prompt: string): string {
  return prompt.replace(
    /\n## Available Emotes[\s\S]*?(?=\n# Active Workspaces & Agents|\n## Project Context \(Workspace\)|$)/g,
    "\n## Available Emotes\n[emote catalog omitted in compact mode]\n",
  );
}

export function compactWorkspaceContextForNonCoding(prompt: string): string {
  return prompt.replace(
    /\n## Project Context \(Workspace\)[\s\S]*?(?=\nAdmin trust:|\nThe current date and time is|\n# Conversation Messages|$)/g,
    "\n## Project Context (Workspace)\n[workspace file contents omitted in compact mode for non-coding intent]\n",
  );
}

export function compactUiComponentCatalog(prompt: string): string {
  return prompt.replace(
    /\n### Available components \((\d+) total\)[\s\S]*?(?=\n## Available Emotes|\n## Project Context \(Workspace\)|$)/g,
    (_match, total: string) =>
      `\n### Available components (${total} total)\n[component catalog omitted in compact mode]\n`,
  );
}

export function compactInstalledSkills(prompt: string): string {
  return prompt.replace(
    /\n## Installed Skills \((\d+)\)[\s\S]*?\*Use TOGGLE_SKILL to enable\/disable skills\.[\s\S]*?(?=\nMima is|\n\*\*Loaded Plugins:\*\*|\n## Project Context \(Workspace\)|$)/g,
    (_match, total: string) =>
      `\n## Installed Skills (${total})\n[skill list omitted in compact mode; query on demand]\n`,
  );
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

const CODING_INTENT_RE =
  /\b(code|coding|repo|repository|pull request|pr\b|branch|test(s)?\b|compile|build|debug|fix|start_coding_task|spawn_coding_agent|send_to_coding_agent)\b|https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\//i;
const PLUGIN_UI_INTENT_RE =
  /\b(plugin|plugins|configure|configuration|setup|install|enable|disable|api key|credential|secret|dashboard|form|ui|interface|\[config:)\b/i;
const TERMINAL_INTENT_RE =
  /\b(shell|command|execute|run|npm|bun|git\b|bash|terminal|script|pip)\b/i;
const EMOTE_INTENT_RE =
  /\b(emote|wave|dance|bow|clap|laugh|angry|sad|think|sit|play_emote)\b/i;
const ISSUE_INTENT_RE =
  /\b(issue|bug|ticket|label|close|reopen|github issue|create issue)\b/i;

/** Actions that are always included at full detail. */
export const UNIVERSAL_ACTIONS = new Set(["REPLY", "NONE", "IGNORE"]);

/** Map intent categories → action names that get full params when detected. */
export const INTENT_ACTION_MAP: Record<string, Set<string>> = {
  coding: new Set([
    "START_CODING_TASK",
    "SPAWN_CODING_AGENT",
    "PROVISION_WORKSPACE",
    "FINALIZE_WORKSPACE",
    "LIST_CODING_AGENTS",
    "SEND_TO_CODING_AGENT",
  ]),
  terminal: new Set(["RUN_IN_TERMINAL", "RESTART_AGENT"]),
  issues: new Set(["MANAGE_ISSUES"]),
  emote: new Set(["PLAY_EMOTE"]),
};

export function hasIntent(prompt: string, keywords: RegExp): boolean {
  const taskMatch = prompt.match(/<task>([\s\S]*?)<\/task>/i);
  const taskText = (taskMatch?.[1] ?? "").slice(0, 2000);
  if (keywords.test(taskText)) return true;

  // Extract just the user's message line(s) from "# Received Message".
  // The section also contains instructions with generic words like "execute",
  // "run", "command" — only match against the actual user text.
  const msgSection = prompt.indexOf("# Received Message");
  if (msgSection !== -1) {
    const afterHeader = prompt.slice(msgSection + "# Received Message".length);
    // User message is between the header and the next section marker (# or <)
    const nextSection = afterHeader.search(/\n#|\n<|\n\n\n/);
    const userMsg = (
      nextSection !== -1 ? afterHeader.slice(0, nextSection) : afterHeader.slice(0, 500)
    ).trim();
    if (keywords.test(userMsg)) return true;
  }

  // Fallback: scan last few user messages in the conversation
  const convSection = prompt.indexOf("# Conversation Messages");
  if (convSection !== -1) {
    const convBlock = prompt.slice(convSection, prompt.indexOf("# Received Message", convSection));
    // Match only lines that start with "User:" or "user:"
    const userLines = convBlock.match(/^(?:User|user):.*$/gm);
    if (userLines) {
      const recentUserText = userLines.slice(-3).join(" ");
      if (keywords.test(recentUserText)) return true;
    }
  }

  return false;
}

/**
 * Detect which intent categories are present in the prompt.
 * Returns array of category names (e.g. ["coding", "terminal"]).
 * Multiple categories can match simultaneously.
 */
export function detectIntentCategories(prompt: string): string[] {
  const categories: string[] = [];
  if (hasIntent(prompt, CODING_INTENT_RE)) categories.push("coding");
  if (hasIntent(prompt, TERMINAL_INTENT_RE)) categories.push("terminal");
  if (hasIntent(prompt, ISSUE_INTENT_RE)) categories.push("issues");
  if (hasIntent(prompt, EMOTE_INTENT_RE)) categories.push("emote");
  if (hasIntent(prompt, PLUGIN_UI_INTENT_RE)) categories.push("plugin_ui");
  return categories;
}

/**
 * Build the set of action names that should get full param detail.
 * Universal actions are always included. Intent-matched actions are
 * added based on detected categories. Everything else gets stub-only.
 */
export function buildFullParamActionSet(
  intentCategories: string[],
): Set<string> {
  const fullActions = new Set(UNIVERSAL_ACTIONS);
  for (const cat of intentCategories) {
    const actions = INTENT_ACTION_MAP[cat];
    if (actions) {
      for (const a of actions) fullActions.add(a);
    }
  }
  // Coding intent also implies terminal + issues
  if (intentCategories.includes("coding")) {
    for (const a of INTENT_ACTION_MAP.terminal) fullActions.add(a);
    for (const a of INTENT_ACTION_MAP.issues) fullActions.add(a);
  }
  return fullActions;
}

/**
 * Context-aware action formatting. Replaces the <actions>...</actions>
 * block in the prompt with a version where only intent-relevant actions
 * have full <params> — the rest are stubs with just name + description.
 *
 * If no intents are detected, keeps all params (safe fallback).
 */
export function compactActionsForIntent(prompt: string): string {
  // Find the first <actions>...</actions> block (the Available Actions section)
  const actionsStart = prompt.indexOf("<actions>");
  if (actionsStart === -1) return prompt;
  const actionsEnd = prompt.indexOf("</actions>", actionsStart);
  if (actionsEnd === -1) return prompt;

  const actionsBlock = prompt.slice(
    actionsStart + "<actions>".length,
    actionsEnd,
  );

  const intentCategories = detectIntentCategories(prompt);
  // When no specific intent is detected, it's general chat — only universal
  // actions (REPLY, NONE, IGNORE) need full detail. All other actions get
  // stubs so the LLM knows they exist but doesn't waste context on params.
  const fullParamActions = buildFullParamActionSet(intentCategories);

  // Parse individual <action>...</action> blocks
  const actionRegex = /<action>([\s\S]*?)<\/action>/g;
  const compactedActions: string[] = [];

  for (const match of actionsBlock.matchAll(actionRegex)) {
    const actionInner = match[1];
    const nameMatch = actionInner.match(/<name>([\s\S]*?)<\/name>/);
    if (!nameMatch) continue;

    const actionName = nameMatch[1].trim();

    if (fullParamActions.has(actionName)) {
      // Keep full action with params
      compactedActions.push(`  <action>${actionInner}</action>`);
    } else {
      // Stub: name + description only, strip <params>
      const descMatch = actionInner.match(
        /<description>([\s\S]*?)<\/description>/,
      );
      const desc = descMatch?.[1]?.trim() ?? "";
      compactedActions.push(
        `  <action>\n    <name>${actionName}</name>\n    <description>${desc}</description>\n  </action>`,
      );
    }
  }

  const compactedBlock = `<actions>\n${compactedActions.join("\n")}\n</actions>`;
  return `${prompt.slice(0, actionsStart)}${compactedBlock}${prompt.slice(actionsEnd + "</actions>".length)}`;
}

export function compactModelPrompt(prompt: string): string {
  const hasCodingIntent = hasIntent(prompt, CODING_INTENT_RE);
  const hasPluginUiIntent = hasIntent(prompt, PLUGIN_UI_INTENT_RE);

  let next = prompt;
  next = compactInitialCodeMarker(next);
  if (!hasCodingIntent) {
    next = compactCodingActionExamples(next);
  }
  // Context-aware action compaction (replaces old compactActionDocs)
  next = compactActionsForIntent(next);
  next = compactLoadedPluginLists(next);
  next = compactEmoteCatalog(next);
  if (!hasCodingIntent) {
    next = compactInstalledSkills(next);
  }
  if (!hasPluginUiIntent) {
    next = compactRegistryCatalog(next);
    next = compactUiCatalog(next);
  } else {
    next = compactUiComponentCatalog(next);
  }
  if (!hasCodingIntent) {
    next = compactWorkspaceContextForNonCoding(next);
  }
  return next;
}
