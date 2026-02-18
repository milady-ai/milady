import type { IAgentRuntime } from "@elizaos/core";
import chalk from "chalk";
import type { Command } from "commander";
import type {
  InstallProgressLike,
  PluginManagerLike,
} from "../services/plugin-manager-types";
import { parseClampedInteger } from "../utils/number-parsing";

/**
 * Normalize a user-provided plugin name to its fully-qualified form.
 * Accepts `@scope/plugin-x`, `plugin-x`, or shorthand `x` (→ `@elizaos/plugin-x`).
 */
function normalizePluginName(name: string): string {
  if (name.startsWith("@") || name.startsWith("plugin-")) {
    return name;
  }
  return `@elizaos/plugin-${name}`;
}

/**
 * Display plugin configuration parameters in a formatted table.
 */
function displayPluginConfig(
  plugin: {
    id: string;
    name?: string;
    parameters?: Array<{
      key: string;
      description?: string;
      required?: boolean;
      sensitive?: boolean;
    }>;
    configUiHints?: Record<
      string,
      { label?: string; help?: string; sensitive?: boolean }
    >;
  },
  currentEnv: Record<string, string | undefined>,
): void {
  const params = plugin.parameters ?? [];
  if (params.length === 0) {
    console.log(chalk.dim("  No configurable parameters."));
    return;
  }

  for (const param of params) {
    const hint = plugin.configUiHints?.[param.key] ?? {};
    const label = hint.label ?? param.key;
    const value = currentEnv[param.key];
    const isSet = value != null && value !== "";
    const isSensitive = param.sensitive || hint.sensitive;

    const displayValue = !isSet
      ? chalk.dim("(not set)")
      : isSensitive
        ? chalk.dim("●●●●●●●●")
        : chalk.white(value);

    const required = param.required ? chalk.red(" *") : "";
    const help =
      (hint.help ?? param.description)
        ? chalk.dim(` — ${hint.help ?? param.description}`)
        : "";

    console.log(
      `  ${chalk.cyan(label.padEnd(30))} ${displayValue}${required}${help}`,
    );
  }
}

/**
 * Raw service shape extracted from `@elizaos/plugin-plugin-manager`.
 * The package only exports `pluginManagerPlugin`; the internal service class
 * uses different method names than `PluginManagerLike`. This adapter bridges
 * the gap so all CLI commands work through the standard interface.
 */
interface RawPluginManagerService {
  getAvailablePluginsFromRegistry(): Promise<
    Record<
      string,
      {
        git?: { repo?: string };
        npm?: { repo?: string; v0?: string | null; v1?: string | null; v2?: string | null };
        supports?: { v0?: boolean; v1?: boolean; v2?: boolean };
        description?: string;
        topics?: string[];
        stargazers_count?: number;
        language?: string;
        homepage?: string | null;
        viewer?: { url: string; embedParams?: Record<string, string>; postMessageAuth?: boolean; sandbox?: string };
        launchType?: string;
        launchUrl?: string | null;
        category?: string;
        capabilities?: string[];
        icon?: string | null;
      }
    >
  >;
  listInstalledPlugins(): Array<{ name: string; version?: string; installedAt?: Date }>;
  installPluginFromRegistry(
    pluginName: string,
    version?: string,
    onProgress?: (progress: { phase: string; message: string }) => void,
  ): Promise<{ name: string; version: string; path: string; status: string }>;
  getPluginInstallPath(pluginName: string): string;
}

async function getPluginManager(): Promise<PluginManagerLike> {
  const { pluginManagerPlugin } = await import(
    "@elizaos/plugin-plugin-manager"
  );
  // biome-ignore lint/suspicious/noExplicitAny: service constructor not exported
  const PluginManagerServiceCtor = pluginManagerPlugin.services![0] as any;
  const mockRuntime = {
    plugins: [],
    actions: [],
    providers: [],
    evaluators: [],
    services: new Map(),
    getService: () => null,
    registerService: () => {},
    registerAction: () => {},
    registerProvider: () => {},
    registerEvaluator: () => {},
    registerEvent: () => {},
  } as unknown as IAgentRuntime;
  const raw: RawPluginManagerService = new PluginManagerServiceCtor(mockRuntime);

  // Convert raw registry entry → RegistryPluginInfo
  const toPluginInfo = (
    name: string,
    entry: Record<string, unknown>,
  ): import("../services/plugin-manager-types").RegistryPluginInfo => {
    const git = (entry.git ?? {}) as Record<string, unknown>;
    const npm = (entry.npm ?? {}) as Record<string, unknown>;
    const supports = (entry.supports ?? {}) as Record<string, boolean>;
    return {
      name,
      gitRepo: String(git.repo ?? ""),
      gitUrl: git.repo ? `https://github.com/${git.repo}` : "",
      description: String(entry.description ?? ""),
      homepage: (entry.homepage as string | null) ?? null,
      topics: Array.isArray(entry.topics) ? entry.topics : [],
      stars: Number(entry.stargazers_count ?? 0),
      language: String(entry.language ?? ""),
      launchType: entry.launchType as string | undefined,
      launchUrl: (entry.launchUrl as string | null) ?? null,
      viewer: entry.viewer as import("../services/plugin-manager-types").RegistryPluginInfo["viewer"],
      npm: {
        package: String(npm.repo ?? npm.package ?? name),
        v0Version: (npm.v0 as string | null) ?? null,
        v1Version: (npm.v1 as string | null) ?? null,
        v2Version: (npm.v2 as string | null) ?? null,
      },
      supports: {
        v0: Boolean(supports.v0),
        v1: Boolean(supports.v1),
        v2: Boolean(supports.v2),
      },
      category: entry.category as string | undefined,
      capabilities: entry.capabilities as string[] | undefined,
      icon: (entry.icon as string | null) ?? null,
    };
  };

  // Cached registry map
  let registryCache: Map<string, import("../services/plugin-manager-types").RegistryPluginInfo> | null = null;

  const refreshRegistry = async () => {
    const rawRegistry = await raw.getAvailablePluginsFromRegistry();
    const map = new Map<string, import("../services/plugin-manager-types").RegistryPluginInfo>();
    for (const [key, entry] of Object.entries(rawRegistry)) {
      map.set(key, toPluginInfo(key, entry as Record<string, unknown>));
    }
    registryCache = map;
    return map;
  };

  return {
    refreshRegistry,

    async listInstalledPlugins() {
      const list = raw.listInstalledPlugins();
      return list.map((p) => ({
        name: p.name,
        version: p.version,
        installedAt: p.installedAt?.toISOString(),
      }));
    },

    async getRegistryPlugin(name: string) {
      const registry = registryCache ?? (await refreshRegistry());
      return registry.get(name) ?? null;
    },

    async searchRegistry(query: string, limit = 15) {
      const registry = registryCache ?? (await refreshRegistry());
      const q = query.toLowerCase();
      const scored: Array<import("../services/plugin-manager-types").RegistrySearchResult> = [];
      for (const plugin of registry.values()) {
        const nameScore = plugin.name.toLowerCase().includes(q) ? 0.8 : 0;
        const descScore = plugin.description.toLowerCase().includes(q) ? 0.4 : 0;
        const tagScore = plugin.topics.some((t) => t.toLowerCase().includes(q)) ? 0.3 : 0;
        const score = Math.min(nameScore + descScore + tagScore, 1);
        if (score > 0) {
          scored.push({
            name: plugin.name,
            description: plugin.description,
            score,
            tags: plugin.topics,
            version: plugin.npm.v2Version ?? plugin.npm.v1Version ?? plugin.npm.v0Version ?? null,
            latestVersion: plugin.npm.v2Version ?? plugin.npm.v1Version ?? plugin.npm.v0Version ?? null,
            npmPackage: plugin.npm.package,
            repository: plugin.gitUrl,
            stars: plugin.stars,
            supports: plugin.supports,
          });
        }
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    },

    async installPlugin(pluginName, onProgress) {
      try {
        const info = await raw.installPluginFromRegistry(pluginName, undefined, onProgress);
        return {
          success: true,
          pluginName: info.name,
          version: info.version,
          installPath: info.path,
          requiresRestart: true,
        };
      } catch (err) {
        return {
          success: false,
          pluginName,
          version: "",
          installPath: "",
          requiresRestart: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async uninstallPlugin(pluginName) {
      try {
        const installPath = raw.getPluginInstallPath(pluginName);
        const fsModule = await import("node:fs");
        if (fsModule.existsSync(installPath)) {
          fsModule.rmSync(installPath, { recursive: true, force: true });
        }
        return {
          success: true,
          pluginName,
          requiresRestart: true,
        };
      } catch (err) {
        return {
          success: false,
          pluginName,
          requiresRestart: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async listEjectedPlugins() {
      return [];
    },

    async ejectPlugin(_pluginName) {
      return { success: false, pluginName: _pluginName, ejectedPath: "", requiresRestart: false, error: "Not supported in CLI mode" };
    },

    async syncPlugin(_pluginName) {
      return { success: false, pluginName: _pluginName, ejectedPath: "", requiresRestart: false, error: "Not supported in CLI mode" };
    },

    async reinjectPlugin(_pluginName) {
      return { success: false, pluginName: _pluginName, removedPath: "", requiresRestart: false, error: "Not supported in CLI mode" };
    },
  };
}

export function registerPluginsCli(program: Command): void {
  const pluginsCommand = program
    .command("plugins")
    .description(
      "Browse, search, install, and manage ElizaOS plugins from the registry",
    );

  // ── list ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("list")
    .description("List all plugins from the registry (next branch)")
    .option("-q, --query <query>", "Filter plugins by name or keyword")
    .option("-l, --limit <number>", "Max results to show", "30")
    .action(async (opts: { query?: string; limit: string }) => {
      const pluginManager = await getPluginManager();

      const limit = parseClampedInteger(opts.limit, {
        min: 1,
        max: 500,
        fallback: 30,
      });
      const installed = await pluginManager.listInstalledPlugins();
      const installedNames = new Set(installed.map((p) => p.name));

      if (opts.query) {
        const results = await pluginManager.searchRegistry(opts.query, limit);

        if (results.length === 0) {
          console.log(`\nNo plugins found matching "${opts.query}"\n`);
          return;
        }

        console.log(
          `\n${chalk.bold(`Found ${results.length} plugins matching "${opts.query}":`)}\n`,
        );
        for (const r of results) {
          const versionBadges: string[] = [];
          if (r.supports.v0) versionBadges.push("v0");
          if (r.supports.v1) versionBadges.push("v1");
          if (r.supports.v2) versionBadges.push("v2");

          const badge = installedNames.has(r.name)
            ? chalk.green(" ✓ installed")
            : "";

          console.log(
            `  ${chalk.cyan(r.name)} ${r.latestVersion ? chalk.dim(`v${r.latestVersion}`) : ""}${badge}`,
          );
          if (r.description) {
            console.log(`    ${r.description}`);
          }
          if (r.tags.length > 0) {
            console.log(
              `    ${chalk.dim(`tags: ${r.tags.slice(0, 5).join(", ")}`)}`,
            );
          }
          if (versionBadges.length > 0) {
            console.log(
              `    ${chalk.dim(`supports: ${versionBadges.join(", ")}`)}`,
            );
          }
          console.log();
        }
      } else {
        const registry = await pluginManager.refreshRegistry();
        const all = Array.from(registry.values());

        const installedCount = all.filter((p) =>
          installedNames.has(p.name),
        ).length;
        console.log(
          `\n${chalk.bold(`${all.length} plugins available in registry`)}${installedCount > 0 ? chalk.green(` (${installedCount} installed)`) : ""}${chalk.bold(":")}\n`,
        );

        const sorted = all
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, limit);

        for (const plugin of sorted) {
          const desc = plugin.description ? ` — ${plugin.description}` : "";
          const badge = installedNames.has(plugin.name)
            ? chalk.green(" ✓")
            : "";
          console.log(`  ${chalk.cyan(plugin.name)}${badge}${chalk.dim(desc)}`);
        }

        if (all.length > limit) {
          console.log(
            chalk.dim(
              `\n  ... and ${all.length - limit} more (use --limit to show more)`,
            ),
          );
        }

        console.log();
      }

      console.log(chalk.dim("Install a plugin: milady plugins install <name>"));
      console.log(
        chalk.dim("Search:           milady plugins list -q <keyword>"),
      );
      console.log();
    });

  // ── search ───────────────────────────────────────────────────────────
  pluginsCommand
    .command("search <query>")
    .description("Search the plugin registry by keyword")
    .option("-l, --limit <number>", "Max results", "15")
    .action(async (query: string, opts: { limit: string }) => {
      const pluginManager = await getPluginManager();
      const limit = parseClampedInteger(opts.limit, {
        min: 1,
        max: 50,
        fallback: 15,
      });

      const results = await pluginManager.searchRegistry(query, limit);

      if (results.length === 0) {
        console.log(`\nNo plugins found matching "${query}"\n`);
        return;
      }

      console.log(
        `\n${chalk.bold(`${results.length} results for "${query}":`)}\n`,
      );

      for (const r of results) {
        const match = (r.score * 100).toFixed(0);
        console.log(
          `  ${chalk.cyan(r.name)} ${chalk.dim(`(${match}% match)`)}`,
        );
        if (r.description) {
          console.log(`    ${r.description}`);
        }
        if (r.stars > 0) {
          console.log(`    ${chalk.dim(`stars: ${r.stars}`)}`);
        }
        console.log();
      }
    });

  // ── info ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("info <name>")
    .description("Show detailed information about a plugin")
    .action(async (name: string) => {
      const pluginManager = await getPluginManager();

      const normalizedName = normalizePluginName(name);

      const info = await pluginManager.getRegistryPlugin(normalizedName);

      if (!info) {
        console.log(`\n${chalk.red("Not found:")} ${normalizedName}`);
        console.log(
          chalk.dim("Run 'milady plugins search <keyword>' to find plugins.\n"),
        );
        return;
      }

      console.log();
      console.log(chalk.bold(info.name));
      console.log(chalk.dim("─".repeat(info.name.length)));

      if (info.description) {
        console.log(`\n  ${info.description}`);
      }

      console.log(
        `\n  ${chalk.dim("Repository:")}  https://github.com/${info.gitRepo}`,
      );
      if (info.homepage) {
        console.log(`  ${chalk.dim("Homepage:")}    ${info.homepage}`);
      }
      console.log(`  ${chalk.dim("Language:")}    ${info.language}`);
      console.log(`  ${chalk.dim("Stars:")}       ${info.stars}`);

      if (info.topics.length > 0) {
        console.log(`  ${chalk.dim("Topics:")}      ${info.topics.join(", ")}`);
      }

      const versions: string[] = [];
      if (info.npm.v0Version) versions.push(`v0: ${info.npm.v0Version}`);
      if (info.npm.v1Version) versions.push(`v1: ${info.npm.v1Version}`);
      if (info.npm.v2Version) versions.push(`v2: ${info.npm.v2Version}`);
      if (versions.length > 0) {
        console.log(`  ${chalk.dim("npm:")}         ${versions.join("  |  ")}`);
      }

      const supported: string[] = [];
      if (info.supports.v0) supported.push("v0");
      if (info.supports.v1) supported.push("v1");
      if (info.supports.v2) supported.push("v2");
      if (supported.length > 0) {
        console.log(`  ${chalk.dim("Supports:")}    ${supported.join(", ")}`);
      }

      console.log(
        `\n  Install: ${chalk.cyan(`milady plugins install ${info.name}`)}\n`,
      );
    });

  // ── install ──────────────────────────────────────────────────────────
  pluginsCommand
    .command("install <name>")
    .description("Install a plugin from the registry")
    .option("--no-restart", "Install without restarting the agent")
    .action(async (name: string, opts: { restart: boolean }) => {
      const pluginManager = await getPluginManager();

      const normalizedName = normalizePluginName(name);

      console.log(`\nInstalling ${chalk.cyan(normalizedName)}...\n`);

      const progressHandler = (progress: InstallProgressLike) => {
        console.log(`  [${progress.phase}] ${progress.message}`);
      };

      const result = await pluginManager.installPlugin(
        normalizedName,
        progressHandler,
      );

      if (result.success) {
        console.log(
          `\n${chalk.green("Success!")} ${result.pluginName}@${result.version} installed.`,
        );
        if (result.requiresRestart && !opts.restart) {
          console.log(
            chalk.yellow("\nRestart your agent to load the new plugin."),
          );
        } else if (result.requiresRestart) {
          console.log(
            chalk.dim("Agent is restarting to load the new plugin..."),
          );
        }
      } else {
        console.log(`\n${chalk.red("Failed:")} ${result.error}`);
        process.exitCode = 1;
      }
      console.log();
    });

  // ── uninstall ────────────────────────────────────────────────────────
  pluginsCommand
    .command("uninstall <name>")
    .description("Uninstall a user-installed plugin")
    .option("--no-restart", "Uninstall without restarting the agent")
    .action(async (name: string, opts: { restart: boolean }) => {
      const pluginManager = await getPluginManager();

      console.log(`\nUninstalling ${chalk.cyan(name)}...\n`);

      const result = await pluginManager.uninstallPlugin(name);

      if (result.success) {
        console.log(
          `${chalk.green("Success!")} ${result.pluginName} uninstalled.`,
        );
        if (result.requiresRestart && !opts.restart) {
          console.log(chalk.yellow("\nRestart your agent to apply changes."));
        }
      } else {
        console.log(`\n${chalk.red("Failed:")} ${result.error}`);
        process.exitCode = 1;
      }
      console.log();
    });

  // ── installed ────────────────────────────────────────────────────────
  pluginsCommand
    .command("installed")
    .description("List plugins installed from the registry")
    .action(async () => {
      const pluginManager = await getPluginManager();
      const plugins = await pluginManager.listInstalledPlugins();

      if (plugins.length === 0) {
        console.log("\nNo plugins installed from the registry.\n");
        console.log(chalk.dim("Install one: milady plugins install <name>\n"));
        return;
      }

      console.log(
        `\n${chalk.bold(`${plugins.length} user-installed plugins:`)}\n`,
      );
      for (const p of plugins) {
        console.log(`  ${chalk.cyan(p.name)} ${chalk.dim(`v${p.version}`)}`);
        console.log();
      }
    });

  // ── refresh ──────────────────────────────────────────────────────────
  pluginsCommand
    .command("refresh")
    .description("Force-refresh the plugin registry cache")
    .action(async () => {
      const pluginManager = await getPluginManager();

      console.log("\nRefreshing registry cache...");
      const registry = await pluginManager.refreshRegistry();
      console.log(`${chalk.green("Done!")} ${registry.size} plugins loaded.\n`);
    });

  // ── test ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("test")
    .description("Validate custom drop-in plugins in ~/.milady/plugins/custom/")
    .action(async () => {
      const nodePath = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const fsPromises = await import("node:fs/promises");
      const { resolveStateDir, resolveUserPath } = await import(
        "../config/paths"
      );
      const { loadMiladyConfig } = await import("../config/config");
      const { CUSTOM_PLUGINS_DIRNAME, scanDropInPlugins, resolvePackageEntry } =
        await import("../runtime/eliza");

      const customDir = nodePath.join(
        resolveStateDir(),
        CUSTOM_PLUGINS_DIRNAME,
      );
      const scanDirs = [customDir];

      let config: ReturnType<typeof loadMiladyConfig> | null = null;
      try {
        config = loadMiladyConfig();
      } catch (err) {
        console.log(
          chalk.dim(
            `  (Could not read milady.json: ${err instanceof Error ? err.message : String(err)} — scanning default directory only)\n`,
          ),
        );
      }
      for (const p of config?.plugins?.load?.paths ?? []) {
        scanDirs.push(resolveUserPath(p));
      }

      console.log(
        `\n${chalk.bold("Custom plugins directory:")} ${chalk.dim(customDir)}\n`,
      );

      const candidates: Array<{
        name: string;
        installPath: string;
        version: string;
      }> = [];
      for (const dir of scanDirs) {
        for (const [name, record] of Object.entries(
          await scanDropInPlugins(dir),
        )) {
          candidates.push({
            name,
            installPath: record.installPath ?? "",
            version: record.version ?? "",
          });
        }
      }

      if (candidates.length === 0) {
        console.log("  No custom plugins found.\n");
        console.log(
          chalk.dim(
            `  Drop a plugin directory into ${customDir} and run this command again.\n`,
          ),
        );
        return;
      }

      console.log(
        `${chalk.bold(`Found ${candidates.length} custom plugin(s):`)}\n`,
      );

      let validCount = 0;
      let failedCount = 0;

      const fail = (msg: string) => {
        console.log(`    ${chalk.red("✗")} ${msg}`);
        failedCount++;
        console.log();
      };

      for (const candidate of candidates) {
        const ver =
          candidate.version !== "0.0.0"
            ? chalk.dim(` v${candidate.version}`)
            : "";
        console.log(`  ${chalk.cyan(candidate.name)}${ver}`);
        console.log(`    ${chalk.dim("Path:")} ${candidate.installPath}`);

        let entryPoint: string;
        try {
          entryPoint = await resolvePackageEntry(candidate.installPath);
        } catch (err) {
          fail(
            `Entry point failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        console.log(
          `    ${chalk.dim("Entry:")} ${nodePath.relative(candidate.installPath, entryPoint)}`,
        );

        try {
          await fsPromises.access(entryPoint);
        } catch {
          fail(`File not found: ${entryPoint}`);
          continue;
        }

        let mod: Record<string, unknown>;
        try {
          mod = (await import(pathToFileURL(entryPoint).href)) as Record<
            string,
            unknown
          >;
        } catch (err) {
          fail(
            `Import failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        const plugin = findPluginExport(mod);
        if (plugin) {
          console.log(
            `    ${chalk.green("✓ Valid plugin")} — ${plugin.name}: ${chalk.dim(plugin.description)}`,
          );
          validCount++;
        } else {
          fail(
            "No valid Plugin export — needs { name: string, description: string }",
          );
          continue;
        }
        console.log();
      }

      const parts: string[] = [];
      if (validCount > 0) parts.push(chalk.green(`${validCount} valid`));
      if (failedCount > 0) parts.push(chalk.red(`${failedCount} failed`));
      console.log(
        `  ${chalk.bold("Summary:")} ${parts.join(", ")} out of ${candidates.length}\n`,
      );
    });

  // ── add-path ────────────────────────────────────────────────────────
  pluginsCommand
    .command("add-path <path>")
    .description("Register an additional plugin search directory in config")
    .action(async (rawPath: string) => {
      const _nodePath = await import("node:path");
      const nodeFs = await import("node:fs");
      const { resolveUserPath } = await import("../config/paths");
      const { loadMiladyConfig, saveMiladyConfig } = await import(
        "../config/config"
      );

      const resolved = resolveUserPath(rawPath);

      if (
        !nodeFs.existsSync(resolved) ||
        !nodeFs.statSync(resolved).isDirectory()
      ) {
        console.log(
          `\n${chalk.red("Error:")} ${resolved} is not a directory.\n`,
        );
        process.exitCode = 1;
        return;
      }

      let config: ReturnType<typeof loadMiladyConfig>;
      try {
        config = loadMiladyConfig();
      } catch {
        config = {} as ReturnType<typeof loadMiladyConfig>;
      }

      if (!config.plugins) config.plugins = {};
      if (!config.plugins.load) config.plugins.load = {};
      if (!config.plugins.load.paths) config.plugins.load.paths = [];

      const existing = config.plugins.load.paths.map(resolveUserPath);
      if (existing.includes(resolved)) {
        console.log(`\n${chalk.yellow("Already registered:")} ${rawPath}\n`);
        return;
      }

      config.plugins.load.paths.push(rawPath);
      saveMiladyConfig(config);

      console.log(`\n${chalk.green("Added:")} ${rawPath} → ${resolved}`);
      console.log(
        chalk.dim("Restart your agent to load plugins from this path.\n"),
      );
    });

  // ── paths ───────────────────────────────────────────────────────────
  pluginsCommand
    .command("paths")
    .description("List all plugin search directories and their contents")
    .action(async () => {
      const nodePath = await import("node:path");
      const { resolveStateDir, resolveUserPath } = await import(
        "../config/paths"
      );
      const { loadMiladyConfig } = await import("../config/config");
      const { CUSTOM_PLUGINS_DIRNAME, scanDropInPlugins } = await import(
        "../runtime/eliza"
      );

      let config: ReturnType<typeof loadMiladyConfig> | null = null;
      try {
        config = loadMiladyConfig();
      } catch {
        // No config
      }

      const customDir = nodePath.join(
        resolveStateDir(),
        CUSTOM_PLUGINS_DIRNAME,
      );

      const dirs: Array<{ label: string; path: string; origin: string }> = [
        { label: customDir, path: customDir, origin: "custom" },
      ];
      for (const p of config?.plugins?.load?.paths ?? []) {
        dirs.push({ label: p, path: resolveUserPath(p), origin: "config" });
      }

      console.log(`\n${chalk.bold("Plugin search directories:")}\n`);

      for (const dir of dirs) {
        const records = await scanDropInPlugins(dir.path);
        const count = Object.keys(records).length;
        const badge = chalk.dim(`[${dir.origin}]`);
        const countStr =
          count > 0
            ? chalk.green(`${count} plugin${count !== 1 ? "s" : ""}`)
            : chalk.dim("empty");

        console.log(`  ${badge}  ${dir.label}  (${countStr})`);

        for (const [name, record] of Object.entries(records)) {
          const ver = record.version !== "0.0.0" ? ` v${record.version}` : "";
          console.log(`         ${chalk.cyan(name)}${chalk.dim(ver)}`);
        }
      }
      console.log();
    });

  // ── config ──────────────────────────────────────────────────────────
  pluginsCommand
    .command("config <name>")
    .description("Show or edit plugin configuration")
    .option("-e, --edit", "Interactive edit mode")
    .action(async (name: string, opts: { edit?: boolean }) => {
      const nodeFs = await import("node:fs");
      const nodePath = await import("node:path");

      // Read plugins.json catalog
      const pluginsPath = nodePath.resolve(process.cwd(), "plugins.json");
      let catalog: { plugins?: Array<Record<string, unknown>> };
      try {
        catalog = JSON.parse(nodeFs.readFileSync(pluginsPath, "utf8"));
      } catch (err) {
        console.log(
          `\n${chalk.red("Error:")} Could not read plugins.json: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
        return;
      }

      // Find the plugin by id, npmName, or name
      const plugins = catalog.plugins ?? [];
      const plugin = plugins.find(
        (p) =>
          p.id === name ||
          p.npmName === name ||
          (typeof p.name === "string" &&
            p.name.toLowerCase().includes(name.toLowerCase())),
      );

      if (!plugin) {
        console.log(`\n${chalk.red("Not found:")} ${name}`);
        console.log(
          chalk.dim("Run 'milady plugins list' to see available plugins.\n"),
        );
        process.exitCode = 1;
        return;
      }

      const pluginId = String(plugin.id ?? "");
      const pluginName = String(plugin.name ?? pluginId);
      const params = plugin.pluginParameters as
        | Record<
            string,
            {
              type?: string;
              description?: string;
              required?: boolean;
              sensitive?: boolean;
            }
          >
        | undefined;
      const configUiHints = plugin.configUiHints as
        | Record<string, { label?: string; help?: string; sensitive?: boolean }>
        | undefined;

      // Display mode
      if (!opts.edit) {
        console.log(
          `\n${chalk.bold(pluginName)} ${chalk.dim(`(${pluginId})`)}`,
        );
        console.log(
          chalk.dim("─".repeat(pluginName.length + pluginId.length + 3)),
        );

        displayPluginConfig(
          {
            id: pluginId,
            name: pluginName,
            parameters: params
              ? Object.entries(params).map(([key, param]) => ({
                  key,
                  description: param.description,
                  required: param.required,
                  sensitive: param.sensitive,
                }))
              : [],
            configUiHints,
          },
          process.env as Record<string, string | undefined>,
        );
        console.log();
        return;
      }

      // Edit mode
      const clack = await import("@clack/prompts");

      console.log(`\n${chalk.bold("Configure")} ${chalk.cyan(pluginName)}\n`);

      const newValues: Record<string, string> = {};

      if (!params || Object.keys(params).length === 0) {
        console.log(chalk.dim("  No configurable parameters.\n"));
        return;
      }

      for (const [key, param] of Object.entries(params)) {
        const hint = configUiHints?.[key] ?? {};
        const label = hint.label ?? key;
        const currentValue = process.env[key];
        const isSensitive = param.sensitive || hint.sensitive;
        const help = hint.help ?? param.description ?? "";

        const displayCurrent = currentValue
          ? isSensitive
            ? chalk.dim("●●●●●●●●")
            : chalk.dim(`(current: ${currentValue})`)
          : chalk.dim("(not set)");

        let promptValue: string | boolean | symbol;

        if (param.type === "boolean") {
          promptValue = await clack.confirm({
            message: `${label} ${displayCurrent}`,
            initialValue: currentValue === "true",
          });
        } else if (isSensitive) {
          promptValue = await clack.password({
            message: `${label} ${displayCurrent}`,
            validate: (v) =>
              param.required && !v ? "This field is required" : undefined,
          });
        } else {
          promptValue = await clack.text({
            message: `${label} ${displayCurrent}`,
            placeholder: help || undefined,
            validate: (v) =>
              param.required && !v ? "This field is required" : undefined,
          });
        }

        if (clack.isCancel(promptValue)) {
          clack.cancel("Configuration cancelled.");
          process.exit(0);
        }

        if (typeof promptValue === "boolean") {
          newValues[key] = String(promptValue);
        } else if (typeof promptValue === "string" && promptValue !== "") {
          newValues[key] = promptValue;
        }
      }

      // Save to config and env
      const { loadMiladyConfig, saveMiladyConfig } = await import(
        "../config/config"
      );

      let config: ReturnType<typeof loadMiladyConfig>;
      try {
        config = loadMiladyConfig();
      } catch {
        config = {} as ReturnType<typeof loadMiladyConfig>;
      }

      // Initialize plugin config structure
      const configAny = config as Record<string, unknown>;
      if (!configAny.plugins || typeof configAny.plugins !== "object") {
        configAny.plugins = {};
      }
      const pluginsObj = configAny.plugins as Record<string, unknown>;
      if (!pluginsObj.entries || typeof pluginsObj.entries !== "object") {
        pluginsObj.entries = {};
      }
      const entries = pluginsObj.entries as Record<
        string,
        Record<string, unknown>
      >;
      if (!entries[pluginId]) {
        entries[pluginId] = { enabled: true, config: {} };
      }
      if (
        !entries[pluginId].config ||
        typeof entries[pluginId].config !== "object"
      ) {
        entries[pluginId].config = {};
      }
      const pluginConfig = entries[pluginId].config as Record<string, unknown>;

      // Update both process.env and config file
      for (const [key, value] of Object.entries(newValues)) {
        process.env[key] = value;
        pluginConfig[key] = value;
      }

      saveMiladyConfig(config);

      console.log(
        `\n${chalk.green("Success!")} Configuration saved for ${pluginName}.`,
      );
      console.log(chalk.dim("Restart your agent to apply changes.\n"));
    });

  // ── open ────────────────────────────────────────────────────────────
  pluginsCommand
    .command("open [name-or-path]")
    .description(
      "Open a plugin directory (or the custom plugins folder) in your editor",
    )
    .action(async (nameOrPath?: string) => {
      const nodePath = await import("node:path");
      const nodeFs = await import("node:fs");
      const { spawnSync } = await import("node:child_process");
      const { resolveStateDir, resolveUserPath } = await import(
        "../config/paths"
      );
      const { CUSTOM_PLUGINS_DIRNAME, scanDropInPlugins } = await import(
        "../runtime/eliza"
      );

      const customDir = nodePath.join(
        resolveStateDir(),
        CUSTOM_PLUGINS_DIRNAME,
      );

      let targetDir: string;

      if (!nameOrPath) {
        targetDir = customDir;
      } else if (
        nodeFs.existsSync(resolveUserPath(nameOrPath)) &&
        nodeFs.statSync(resolveUserPath(nameOrPath)).isDirectory()
      ) {
        targetDir = resolveUserPath(nameOrPath);
      } else {
        // Treat as a plugin name — search the custom dir
        const records = await scanDropInPlugins(customDir);
        const match = records[nameOrPath];
        if (match?.installPath) {
          targetDir = match.installPath;
        } else {
          console.log(
            `\n${chalk.red("Not found:")} "${nameOrPath}" is not a path or known custom plugin.`,
          );
          console.log(
            chalk.dim(
              `Custom plugins: ${Object.keys(records).join(", ") || "(none)"}\n`,
            ),
          );
          process.exitCode = 1;
          return;
        }
      }

      // Minimal shell-like splitter for $EDITOR to avoid invoking a shell.
      function splitCommand(command: string): { cmd: string; args: string[] } {
        const trimmed = command.trim();
        if (!trimmed) return { cmd: "code", args: [] };

        const tokens: string[] = [];
        let current = "";
        let quote: '"' | "'" | null = null;
        let escaped = false;

        for (let i = 0; i < trimmed.length; i++) {
          const char = trimmed[i];
          if (escaped) {
            current += char;
            escaped = false;
            continue;
          }

          if (char === "\\") {
            if (quote === "'") {
              current += char;
              continue;
            }
            const next = trimmed[i + 1];
            if (
              next === '"' ||
              next === "'" ||
              next === "\\" ||
              (next && /\s/.test(next))
            ) {
              escaped = true;
              continue;
            }
            current += char;
            continue;
          }

          if (quote) {
            if (char === quote) {
              quote = null;
              continue;
            }
            current += char;
            continue;
          }

          if (char === '"' || char === "'") {
            quote = char;
            continue;
          }

          if (/\s/.test(char)) {
            if (current) {
              tokens.push(current);
              current = "";
            }
            continue;
          }

          current += char;
        }

        if (current) tokens.push(current);

        const [cmd, ...args] = tokens.length > 0 ? tokens : ["code"];
        return { cmd, args };
      }

      const editorRaw = process.env.EDITOR || "code";
      const { cmd: editorCmd, args: editorArgs } = splitCommand(editorRaw);
      console.log(`\nOpening ${chalk.cyan(targetDir)} with ${editorCmd}...\n`);

      try {
        const result = spawnSync(editorCmd, [...editorArgs, targetDir], {
          stdio: "inherit",
        });
        if (result.error) throw result.error;
      } catch {
        // Some editors (like code) return immediately and that's fine.
        // If the command actually fails, the user will see it.
      }
    });
}

/** Find the first export that looks like a Plugin ({ name, description }). */
export function findPluginExport(
  mod: Record<string, unknown>,
): { name: string; description: string } | null {
  const isPluginBasic = (
    v: unknown,
  ): v is { name: string; description: string } =>
    v !== null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).name === "string" &&
    typeof (v as Record<string, unknown>).description === "string";

  const hasPluginCapabilities = (v: unknown): boolean => {
    if (v === null || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return (
      Array.isArray(obj.services) ||
      Array.isArray(obj.providers) ||
      Array.isArray(obj.actions) ||
      Array.isArray(obj.routes) ||
      Array.isArray(obj.events) ||
      typeof obj.init === "function"
    );
  };

  const isPluginStrict = (
    v: unknown,
  ): v is { name: string; description: string } =>
    isPluginBasic(v) && hasPluginCapabilities(v);

  if (isPluginStrict(mod.default)) return mod.default;
  if (isPluginStrict(mod.plugin)) return mod.plugin;
  if (isPluginStrict(mod)) return mod as { name: string; description: string };

  const keys = Object.keys(mod).filter(
    (key) => key !== "default" && key !== "plugin",
  );
  const preferred = keys.filter(
    (key) => /plugin$/i.test(key) || /^plugin/i.test(key),
  );
  const fallback = keys.filter((key) => !preferred.includes(key));

  for (const key of [...preferred, ...fallback]) {
    const value = mod[key];
    if (isPluginStrict(value)) return value;
  }

  for (const key of preferred) {
    const value = mod[key];
    if (isPluginBasic(value)) return value;
  }

  if (isPluginBasic(mod.default)) return mod.default;
  if (isPluginBasic(mod.plugin)) return mod.plugin;
  if (isPluginBasic(mod)) return mod as { name: string; description: string };

  return null;
}
