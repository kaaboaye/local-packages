import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "t3code-bin",
  description: "T3 Code desktop app",

  async detectVersion(): Promise<VersionInfo> {
    const tag = await fetchGitHubLatestTag("pingdotgg/t3code");
    const version = tag.replace(/^v/, "");
    const downloadUrl = `https://github.com/pingdotgg/t3code/releases/download/${tag}/T3-Code-${version}-x86_64.AppImage`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `T3-Code-${info.version}-x86_64.AppImage`;
  },
} satisfies PackageConfig;
