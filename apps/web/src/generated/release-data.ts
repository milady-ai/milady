export const releaseData = {
  generatedAt: "2026-04-04T00:22:30.639Z",
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
    tagName: "v2.0.5",
    appAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.5/apps/app/public/",
    homepageAssetBaseUrl:
      "https://raw.githubusercontent.com/milady-ai/milady/v2.0.5/apps/web/public/",
  },
  release: {
    tagName: "v2.0.5",
    publishedAtLabel: "Apr 2, 2026",
    prerelease: false,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.5",
    downloads: [
      {
        id: "macos-arm64",
        label: "macOS (Apple Silicon)",
        fileName: "stable-macos-arm64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.5/stable-macos-arm64-Milady.dmg",
        sizeLabel: "581.3 MB",
        note: "DMG installer",
      },
      {
        id: "macos-x64",
        label: "macOS (Intel)",
        fileName: "stable-macos-x64-Milady.dmg",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.5/stable-macos-x64-Milady.dmg",
        sizeLabel: "597.0 MB",
        note: "DMG installer",
      },
      {
        id: "windows-x64",
        label: "Windows",
        fileName: "Milady-Setup-stable.exe",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.5/Milady-Setup-stable.exe",
        sizeLabel: "672.9 MB",
        note: "Windows installer",
      },
      {
        id: "linux-x64",
        label: "Linux",
        fileName: "stable-linux-x64-Milady-Setup.tar.gz",
        url: "https://github.com/milady-ai/milady/releases/download/v2.0.5/stable-linux-x64-Milady-Setup.tar.gz",
        sizeLabel: "654.2 MB",
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
      url: "https://github.com/milady-ai/milady/releases/download/v2.0.5/SHA256SUMS.txt",
    },
  },
} as const;
