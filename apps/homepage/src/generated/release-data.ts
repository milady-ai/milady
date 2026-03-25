export const releaseData = {
  generatedAt: "2026-03-25T05:39:15.209Z",
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
