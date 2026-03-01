import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Milady",
    identifier: "com.miladyai.milady",
    version: "2.0.0-alpha.76",
    urlSchemes: ["milady"],
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/index.ts",
    },
    // React app is served by the Bun process — no separate Electrobun views
    views: {},
    mac: {
      codesign: true,
      notarize: true,
      // Bundle Chromium for consistent rendering across platforms
      bundleCEF: true,
    },
    linux: {
      bundleCEF: true,
      icon: "assets/appIcon.png",
    },
    win: {
      bundleCEF: true,
      icon: "assets/appIcon.ico",
    },
  },
  release: {
    baseUrl: "https://milady.ai/releases/",
    generatePatch: true,
  },
} satisfies ElectrobunConfig;
