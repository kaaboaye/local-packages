import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "openai-codex-bin",
  description: "OpenAI Codex CLI (official binary)",

  async detectVersion(): Promise<VersionInfo> {
    const tag = await fetchGitHubLatestTag("openai/codex");
    const version = tag.replace(/^rust-v/, "");
    const downloadUrl = `https://github.com/openai/codex/releases/download/${tag}/codex-x86_64-unknown-linux-gnu.tar.gz`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `codex-${info.version}-x86_64.tar.gz`;
  },
} satisfies PackageConfig;
