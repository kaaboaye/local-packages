import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "crowdin-cli-bin",
  description: "Crowdin CLI tool for localization management",

  async detectVersion(): Promise<VersionInfo> {
    const version = await fetchGitHubLatestTag("crowdin/crowdin-cli");
    const downloadUrl = `https://github.com/crowdin/crowdin-cli/releases/download/${version}/crowdin-cli.zip`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename() {
    return "crowdin-cli.zip";
  },
} satisfies PackageConfig;
