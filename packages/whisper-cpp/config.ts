import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { fetchGitHubLatestTag } from "../../src/lib/github";

export default {
  name: "whisper-cpp",
  description: "Port of OpenAI's Whisper model in C/C++ (Vulkan GPU acceleration)",

  async detectVersion(): Promise<VersionInfo> {
    const tag = await fetchGitHubLatestTag("ggml-org/whisper.cpp");
    const version = tag.replace(/^v/, "");
    const downloadUrl = `https://github.com/ggml-org/whisper.cpp/archive/${tag}.tar.gz`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `whisper.cpp-${info.version}.tar.gz`;
  },
} satisfies PackageConfig;
