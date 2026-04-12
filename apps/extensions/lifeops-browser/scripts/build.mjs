#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildChromeExtensionVersion,
  resolveLifeOpsBrowserReleaseVersion,
} from "./release-version.mjs";

const browserKind = process.argv[2] === "safari" ? "safari" : "chrome";
const extensionRoot = path.resolve(import.meta.dir, "..");
const distDir = path.join(extensionRoot, "dist", browserKind);
const publicDir = path.join(extensionRoot, "public");
const iosPublicDir = path.resolve(
  extensionRoot,
  "..",
  "..",
  "app",
  "ios",
  "App",
  "App",
  "public",
);
const release = resolveLifeOpsBrowserReleaseVersion();
const extensionVersion = buildChromeExtensionVersion(release);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

const define = {
  __LIFEOPS_BROWSER_KIND__: JSON.stringify(browserKind),
};

const buildResult = await Bun.build({
  entrypoints: [
    path.join(extensionRoot, "entrypoints", "background.ts"),
    path.join(extensionRoot, "entrypoints", "content.ts"),
    path.join(extensionRoot, "entrypoints", "popup.ts"),
  ],
  outdir: distDir,
  target: "browser",
  format: "iife",
  sourcemap: "external",
  minify: false,
  naming: "[name].js",
  define,
});

if (!buildResult.success) {
  const messages = buildResult.logs.map((log) => log.message).join("\n");
  throw new Error(`Extension build failed:\n${messages}`);
}

await fs.copyFile(
  path.join(publicDir, "popup.html"),
  path.join(distDir, "popup.html"),
);
await fs.copyFile(
  path.join(publicDir, "popup.css"),
  path.join(distDir, "popup.css"),
);

const iconSources = [
  ["icon16.png", path.join(iosPublicDir, "favicon-16x16.png")],
  ["icon32.png", path.join(iosPublicDir, "favicon-32x32.png")],
  ["icon128.png", path.join(iosPublicDir, "android-chrome-192x192.png")],
];

for (const [fileName, sourcePath] of iconSources) {
  await fs.copyFile(sourcePath, path.join(distDir, fileName));
}

const manifest = {
  manifest_version: 3,
  name: "LifeOps Browser",
  version: extensionVersion,
  version_name: release.raw,
  description:
    "LifeOps personal-browser relay for syncing the current page and executing owner-approved browser sessions.",
  permissions: ["tabs", "storage", "scripting", "alarms", "activeTab"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "background.js",
  },
  action: {
    default_title: "LifeOps Browser",
    default_popup: "popup.html",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  icons: {
    16: "icon16.png",
    32: "icon32.png",
    128: "icon128.png",
  },
  browser_specific_settings:
    browserKind === "safari"
      ? {
          safari: {
            strict_min_version: "17.0",
          },
        }
      : undefined,
};

await fs.writeFile(
  path.join(distDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `Built LifeOps Browser extension ${release.raw} (${extensionVersion}) to ${distDir}`,
);
