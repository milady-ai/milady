import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json" with { type: "json" };

export default {
  app: {
    name: "Agentic Electrobun App",
    identifier: process.env.APP_ID || "dev.example.agentic-electrobun",
    version: pkg.version,
    // URL schemes are fully supported on macOS in current Electrobun docs; test before relying on Windows/Linux.
    // URL schemes are fully supported on macOS in current Electrobun docs; test before relying on Windows/Linux.
    // URL schemes are fully supported on macOS in current Electrobun docs; test before relying on Windows/Linux.
    urlSchemes: ["agentic-electrobun"],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      sourcemap: "linked",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
        sourcemap: "linked",
      },
      webviewtag: {
        entrypoint: "src/webviewtag/index.ts",
        sourcemap: "linked",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/style.css": "views/mainview/style.css",
      "src/webviewtag/index.html": "views/webviewtag/index.html",
      "assets/tray-template.png": "views/assets/tray-template.png",
    },
    watch: ["src", "assets", "scripts"],
    watchIgnore: ["artifacts/**", "build/**", "**/*.generated.*"],
    mac: {
      codesign: process.env.ELECTROBUN_SIGN === "true",
      notarize: process.env.ELECTROBUN_NOTARIZE === "true",
      bundleCEF: false,
      defaultRenderer: "native",
      entitlements: {},
      icons: "assets/icon.iconset",
    },
    linux: {
      bundleCEF: false,
      defaultRenderer: "native",
    },
    win: {
      bundleCEF: false,
      defaultRenderer: "native",
    },
  },
  scripts: {
    preBuild: "./scripts/electrobun/pre-build.ts",
    postBuild: "./scripts/electrobun/post-build.ts",
    postWrap: "./scripts/electrobun/post-wrap.ts",
    postPackage: "./scripts/electrobun/post-package.ts",
  },
  release: {
    baseUrl: process.env.RELEASE_BASE_URL || "",
  },
} satisfies ElectrobunConfig;
