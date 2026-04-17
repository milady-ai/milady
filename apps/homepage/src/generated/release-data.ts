export const releaseData = {
  generatedAt: "2026-04-17T17:40:02.105Z",
  scripts: {
    shell: {
      url: "https://milady.ai/install.sh",
      command: "curl -fsSL https://milady.ai/install.sh | bash",
    },
    powershell: {
      url: "https://milady.ai/install.ps1",
      command: "irm https://milady.ai/install.ps1 | iex",
    },
  },
  cdn: {
    tagName: "v2.0.10",
    appAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.10/apps/app/public/",
    homepageAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.10/apps/homepage/public/",
  },
  release: {
    tagName: "v2.0.10",
    publishedAtLabel: "Apr 7, 2026",
    prerelease: false,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.10",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "stable-macos-arm64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.10/stable-macos-arm64-Milady.dmg",
        sizeLabel: "756.4 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "stable-macos-x64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.10/stable-macos-x64-Milady.dmg",
        sizeLabel: "776.0 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-stable.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.10/Milady-Setup-stable.exe",
        sizeLabel: "751.5 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "stable-linux-x64-Milady-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.10/stable-linux-x64-Milady-Setup.tar.gz",
        sizeLabel: "748.7 MB",
        note: "tar.gz package",
      },
    ],
    checksum: {
      fileName: "SHA256SUMS.txt",
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.10/SHA256SUMS.txt",
    },
  },
} as const;
