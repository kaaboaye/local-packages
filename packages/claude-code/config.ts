import type { PackageConfig, VersionInfo } from "../../src/lib/types";

const GCS_BUCKET =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";

export default {
  name: "claude-code",
  description: "An agentic coding tool that lives in your terminal",

  async detectVersion(): Promise<VersionInfo> {
    // Fetch latest version from the official distribution bucket
    const response = await fetch(`${GCS_BUCKET}/latest`);
    const version = (await response.text()).trim();

    const downloadUrl = `${GCS_BUCKET}/${version}/linux-x64/claude`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `claude-${info.version}-x86_64`;
  },
} satisfies PackageConfig;
