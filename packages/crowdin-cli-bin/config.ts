import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "crowdin-cli-bin",
  description: "Crowdin CLI tool for localization management",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://api.github.com/repos/crowdin/crowdin-cli/releases/latest"
    );
    const data = (await response.json()) as { tag_name: string };

    const version = data.tag_name;
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
