"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWebAssetDirectory = resolveWebAssetDirectory;
exports.buildMissingWebAssetsMessage = buildMissingWebAssetsMessage;
const tslib_1 = require("tslib");
const node_fs_1 = require("node:fs");
const node_path_1 = tslib_1.__importDefault(require("node:path"));
const DEFAULT_WEB_DIR = "dist";
function hasIndexHtml(dir) {
  return (0, node_fs_1.existsSync)(node_path_1.default.join(dir, "index.html"));
}
function dedupePaths(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const normalized = node_path_1.default.resolve(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
function resolveWebAssetDirectory(options) {
  var _a, _b;
  const webDir =
    ((_a = options.webDir) === null || _a === void 0 ? void 0 : _a.trim()) ||
    DEFAULT_WEB_DIR;
  const cwd = (_b = options.cwd) !== null && _b !== void 0 ? _b : process.cwd();
  const appRoot = node_path_1.default.resolve(options.appPath);
  const primary = node_path_1.default.join(appRoot, "app");
  const primaryHasIndex = hasIndexHtml(primary);
  const defaultCandidates = [
    primary,
    node_path_1.default.join(appRoot, webDir),
    node_path_1.default.join(appRoot, "..", webDir),
    node_path_1.default.join(cwd, "app"),
    node_path_1.default.join(cwd, webDir),
    node_path_1.default.join(cwd, "..", webDir),
  ];
  const preferBuildOutputCandidates = [
    node_path_1.default.join(appRoot, webDir),
    node_path_1.default.join(appRoot, "..", webDir),
    node_path_1.default.join(cwd, webDir),
    node_path_1.default.join(cwd, "..", webDir),
    primary,
    node_path_1.default.join(cwd, "app"),
  ];
  const candidates = dedupePaths(
    options.preferBuildOutput ? preferBuildOutputCandidates : defaultCandidates,
  );
  for (const candidate of candidates) {
    if (!hasIndexHtml(candidate)) continue;
    return {
      directory: candidate,
      searched: candidates,
      usedFallback: candidate !== primary,
      hasIndexHtml: true,
      primaryHasIndexHtml: primaryHasIndex,
    };
  }
  return {
    directory: primary,
    searched: candidates,
    usedFallback: false,
    hasIndexHtml: false,
    primaryHasIndexHtml: primaryHasIndex,
  };
}
function buildMissingWebAssetsMessage(resolution) {
  const attempted = resolution.searched
    .map((candidate) => `- ${candidate}`)
    .join("\n");
  return (
    "[Milady] Web assets were not found for Electron startup. " +
    "Run `bun run build:electron` from `apps/app` to regenerate assets.\n" +
    `Attempted directories:\n${attempted}`
  );
}
