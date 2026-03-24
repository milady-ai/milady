export const releaseData = {
  generatedAt: "2026-03-24T17:32:42.214Z",
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
    tagName: "v2.0.0-alpha.122",
    publishedAtLabel: "Mar 24, 2026",
    prerelease: false,
    url: "https://github.com/milady-ai/milady/releases/tag/v2.0.0-alpha.122",
    downloads: [],
    checksum: null,
  },
} as const;
