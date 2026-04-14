import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "opencode-desktop-bin",
  description: "OpenCode desktop client",

  async detectVersion(): Promise<VersionInfo> {
    const tag = await fetchGitHubLatestTag("anomalyco/opencode");
    const version = tag.replace(/^v/, "");
    const downloadUrl = `https://github.com/anomalyco/opencode/releases/download/${tag}/opencode-desktop-linux-amd64.deb`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `opencode-desktop-${info.version}-linux-amd64.deb`;
  },
} satisfies PackageConfig;
