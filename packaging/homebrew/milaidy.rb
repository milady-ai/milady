# Homebrew formula for Milaidy — personal AI assistant built on ElizaOS
#
# Installation:
#   brew tap milady-ai/tap
#   brew install milaidy
#
# Or direct:
#   brew install milady-ai/tap/milaidy

class Milaidy < Formula
  desc "Personal AI assistant built on ElizaOS — cute agents for the acceleration"
  homepage "https://milady.ai"
  url "https://registry.npmjs.org/milaidy/-/milaidy-2.0.0-alpha.6.tgz"
  sha256 "d0da83506fc528ab7f3b4d9b1e44aaec2761005aac874ca2478c37444e8ae6e5"
  license "MIT"

  # Semantic versioning — tracks stable releases
  livecheck do
    url "https://registry.npmjs.org/milaidy"
    regex(/["']version["']:\s*["']([^"']+)["']/i)
  end

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    ohai "Milaidy installed! Run 'milaidy start' to begin."
    ohai "First run will walk you through interactive setup."
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/milaidy --version").strip
    assert_match "milaidy", shell_output("#{bin}/milaidy --help")
  end
end
