import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "visual-studio-code-bin",
  description: "Visual Studio Code (official binary version)",

  async detectVersion(): Promise<VersionInfo> {
    const version = await fetchGitHubLatestTag("microsoft/vscode");
    const downloadUrl = `https://update.code.visualstudio.com/${version}/linux-x64/stable`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `code_x64_${info.version}.tar.gz`;
  },
} satisfies PackageConfig;
