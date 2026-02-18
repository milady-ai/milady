/**
 * Composes the three utility modules (registry-client, plugin-installer,
 * plugin-eject) into a single object that satisfies PluginManagerLike.
 *
 * This is the "glue" layer Shaw's design intended but never wired up.
 *
 * @module services/plugin-manager-composite
 */

import type {
  EjectResult,
  InstalledPluginInfo,
  InstallProgressLike,
  PluginInstallResult,
  PluginManagerLike,
  PluginUninstallResult,
  ReinjectResult,
  RegistryPluginInfo,
  RegistrySearchResult,
  SyncResult,
} from "./plugin-manager-types";

import {
  getPluginInfo,
  refreshRegistry as refreshRegistryFn,
  searchPlugins,
  type RegistryPluginInfo as RegistryClientPluginInfo,
  type RegistrySearchResult as RegistryClientSearchResult,
} from "./registry-client";

import {
  installPlugin as installPluginFn,
  listInstalledPlugins as listInstalledPluginsFn,
  uninstallPlugin as uninstallPluginFn,
  type InstallProgress,
} from "./plugin-installer";

import {
  ejectPlugin as ejectPluginFn,
  listEjectedPlugins as listEjectedPluginsFn,
  reinjectPlugin as reinjectPluginFn,
  syncPlugin as syncPluginFn,
  type EjectResult as EjectModuleResult,
  type ReinjectResult as ReinjectModuleResult,
  type SyncResult as SyncModuleResult,
} from "./plugin-eject";

// ---------------------------------------------------------------------------
// Type adapters — bridge differences between utility module types and
// the PluginManagerLike interface types.
// ---------------------------------------------------------------------------

/** registry-client's RegistryPluginInfo → plugin-manager-types RegistryPluginInfo */
function toInterfacePluginInfo(p: RegistryClientPluginInfo): RegistryPluginInfo {
  return {
    name: p.name,
    gitRepo: p.gitRepo,
    gitUrl: p.gitUrl,
    description: p.description,
    homepage: p.homepage,
    topics: p.topics,
    stars: p.stars,
    language: p.language,
    npm: p.npm,
    supports: p.supports,
    // Carry through optional app metadata when present
    ...(p.appMeta?.displayName && { displayName: p.appMeta.displayName }),
    ...(p.appMeta?.category && { category: p.appMeta.category }),
    ...(p.appMeta?.launchType && { launchType: p.appMeta.launchType }),
    ...(p.appMeta?.launchUrl !== undefined && { launchUrl: p.appMeta.launchUrl }),
    ...(p.appMeta?.icon !== undefined && { icon: p.appMeta.icon }),
    ...(p.appMeta?.capabilities && { capabilities: p.appMeta.capabilities }),
    ...(p.appMeta?.viewer && { viewer: p.appMeta.viewer }),
  };
}

/** registry-client's RegistrySearchResult → plugin-manager-types RegistrySearchResult */
function toInterfaceSearchResult(r: RegistryClientSearchResult): RegistrySearchResult {
  return {
    name: r.name,
    description: r.description,
    score: r.score,
    tags: r.tags,
    version: r.latestVersion,
    latestVersion: r.latestVersion,
    npmPackage: r.name, // npm package name is typically the same as registry name
    repository: r.repository,
    stars: r.stars,
    supports: r.supports,
  };
}

/** plugin-eject's EjectResult → plugin-manager-types EjectResult */
function toInterfaceEjectResult(r: EjectModuleResult): EjectResult {
  return {
    success: r.success,
    pluginName: r.pluginName,
    ejectedPath: r.ejectedPath,
    requiresRestart: r.success, // ejecting always requires restart when successful
    error: r.error,
  };
}

/** plugin-eject's SyncResult → plugin-manager-types SyncResult */
function toInterfaceSyncResult(r: SyncModuleResult): SyncResult {
  return {
    success: r.success,
    pluginName: r.pluginName,
    ejectedPath: r.ejectedPath,
    requiresRestart: r.success && r.upstreamCommits > 0,
    error: r.error,
  };
}

/** plugin-eject's ReinjectResult → plugin-manager-types ReinjectResult */
function toInterfaceReinjectResult(r: ReinjectModuleResult): ReinjectResult {
  return {
    success: r.success,
    pluginName: r.pluginName,
    removedPath: r.removedPath,
    requiresRestart: r.success,
    error: r.error,
  };
}

// ---------------------------------------------------------------------------
// Composite implementation
// ---------------------------------------------------------------------------

/**
 * Creates a PluginManagerLike by composing the three utility modules.
 * Stateless — safe to call multiple times (modules maintain their own state).
 */
export function createPluginManager(): PluginManagerLike {
  return {
    async refreshRegistry(): Promise<Map<string, RegistryPluginInfo>> {
      const raw = await refreshRegistryFn();
      const mapped = new Map<string, RegistryPluginInfo>();
      Array.from(raw.entries()).forEach(([key, value]) => {
        mapped.set(key, toInterfacePluginInfo(value));
      });
      return mapped;
    },

    async getRegistryPlugin(name: string): Promise<RegistryPluginInfo | null> {
      const info = await getPluginInfo(name);
      return info ? toInterfacePluginInfo(info) : null;
    },

    async searchRegistry(
      query: string,
      limit?: number,
    ): Promise<RegistrySearchResult[]> {
      const results = await searchPlugins(query, limit);
      return results.map(toInterfaceSearchResult);
    },

    async listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
      const raw = listInstalledPluginsFn();
      return raw.map((p) => ({
        name: p.name,
        version: p.version,
        installedAt: p.installedAt,
      }));
    },

    async installPlugin(
      pluginName: string,
      onProgress?: (progress: InstallProgressLike) => void,
    ): Promise<PluginInstallResult> {
      // Adapt the progress callback shape
      const progressAdapter: ((p: InstallProgress) => void) | undefined =
        onProgress
          ? (p: InstallProgress) =>
              onProgress({
                phase: p.phase,
                message: p.message,
                pluginName: p.pluginName,
              })
          : undefined;

      return installPluginFn(pluginName, progressAdapter);
    },

    async uninstallPlugin(pluginName: string): Promise<PluginUninstallResult> {
      return uninstallPluginFn(pluginName);
    },

    async listEjectedPlugins(): Promise<InstalledPluginInfo[]> {
      const raw = await listEjectedPluginsFn();
      return raw.map((p) => ({
        name: p.name,
        version: p.version,
      }));
    },

    async ejectPlugin(pluginName: string): Promise<EjectResult> {
      const result = await ejectPluginFn(pluginName);
      return toInterfaceEjectResult(result);
    },

    async syncPlugin(pluginName: string): Promise<SyncResult> {
      const result = await syncPluginFn(pluginName);
      return toInterfaceSyncResult(result);
    },

    async reinjectPlugin(pluginName: string): Promise<ReinjectResult> {
      const result = await reinjectPluginFn(pluginName);
      return toInterfaceReinjectResult(result);
    },
  };
}
