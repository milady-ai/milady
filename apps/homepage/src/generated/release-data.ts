export const releaseData = {
  generatedAt: "2026-03-25T13:16:42.304Z",
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
  release: {
    tagName: "v2.0.0-alpha.123",
    publishedAtLabel: "Mar 24, 2026",
    prerelease: false,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.123",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "canary-macos-arm64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.121/canary-macos-arm64-Milady-canary.dmg",
        sizeLabel: "589.7 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "canary-macos-x64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.121/canary-macos-x64-Milady-canary.dmg",
        sizeLabel: "607.3 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-canary.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.121/Milady-Setup-canary.exe",
        sizeLabel: "671.4 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "canary-linux-x64-Milady-canary-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.121/canary-linux-x64-Milady-canary-Setup.tar.gz",
        sizeLabel: "651.0 MB",
        note: "tar.gz package",
      },
      {
        id: "linux-deb",
        label: "Ubuntu / Debian",
        fileName: "milady_2.0.0.alpha123-1_all.deb",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.123/milady_2.0.0.alpha123-1_all.deb",
        sizeLabel: "604.2 MB",
        note: "Debian package",
      },
    ],
    checksum: null,
  },
} as const;
