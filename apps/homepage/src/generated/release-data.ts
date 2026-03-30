export const releaseData = {
  generatedAt: "2026-03-28T11:50:13.738Z",
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
    tagName: "v2.0.0-alpha.128",
    publishedAtLabel: "Mar 28, 2026",
    prerelease: true,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.128",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "canary-macos-arm64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.128/canary-macos-arm64-Milady-canary.dmg",
        sizeLabel: "587.7 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "canary-macos-x64-Milady-canary.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.128/canary-macos-x64-Milady-canary.dmg",
        sizeLabel: "611.4 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-canary.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.128/Milady-Setup-canary.exe",
        sizeLabel: "672.4 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "canary-linux-x64-Milady-canary-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.128/canary-linux-x64-Milady-canary-Setup.tar.gz",
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
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.0-alpha.128/SHA256SUMS.txt",
    },
  },
} as const;
