export const releaseData = {
  generatedAt: "2026-04-02T01:41:54.000Z",
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
    tagName: "v2.0.4",
    appAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.4/apps/app/public/",
    homepageAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.4/apps/web/public/",
  },
  release: {
    tagName: "v2.0.4",
    publishedAtLabel: "Mar 31, 2026",
    prerelease: false,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.4",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "stable-macos-arm64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.4/stable-macos-arm64-Milady.dmg",
        sizeLabel: "597.6 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "stable-macos-x64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.4/stable-macos-x64-Milady.dmg",
        sizeLabel: "597.5 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-stable.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.4/Milady-Setup-stable.exe",
        sizeLabel: "672.6 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "stable-linux-x64-Milady-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.4/stable-linux-x64-Milady-Setup.tar.gz",
        sizeLabel: "653.9 MB",
        note: "tar.gz package",
      },
      {
        id: "linux-deb",
        label: "Ubuntu / Debian",
        fileName: "milady_2.0.0.alpha125-1_all.deb",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.125/milady_2.0.0.alpha125-1_all.deb",
        sizeLabel: "594.0 MB",
        note: "Debian package",
      },
    ],
    checksum: {
      fileName: "SHA256SUMS.txt",
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.4/SHA256SUMS.txt",
    },
  },
} as const;
