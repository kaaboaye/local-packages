import type { PackageConfig, VersionInfo } from "../../src/lib/types";

const RELEASES_URL = "https://downloads.claude.ai/claude-code-releases";

export default {
  name: "claude-code",
  description: "An agentic coding tool that lives in your terminal",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(`${RELEASES_URL}/latest`);
    const version = (await response.text()).trim();

    const downloadUrl = `${RELEASES_URL}/${version}/linux-x64/claude`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `claude-${info.version}-x86_64`;
  },
} satisfies PackageConfig;
