import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "opencode-bin",
  description: "The AI coding agent built for the terminal",

  async detectVersion(): Promise<VersionInfo> {
    const tag = await fetchGitHubLatestTag("anomalyco/opencode");
    const version = tag.replace(/^v/, "");
    const downloadUrl = `https://github.com/anomalyco/opencode/releases/download/${tag}/opencode-linux-x64.tar.gz`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `opencode-bin-${info.version}-x86_64.tar.gz`;
  },
} satisfies PackageConfig;
