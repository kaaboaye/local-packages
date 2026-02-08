import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "btsms",
  description: "Cross-platform SMS manager via Bluetooth (MAP/PBAP/ANCS)",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://api.github.com/repos/kaaboaye/btsms/commits/main"
    );
    const data = (await response.json()) as {
      sha: string;
      commit: { committer: { date: string } };
    };
    const sha = data.sha;
    const shortSha = sha.substring(0, 7);
    const dateStr = data.commit.committer.date
      .split("T")[0]
      .replace(/-/g, "");

    const version = `0.1.0.${dateStr}.${shortSha}`;
    const downloadUrl = `https://github.com/kaaboaye/btsms/archive/${sha}.tar.gz`;

    return { version, downloadUrl, commitHash: sha };
  },

  getTemplateVars(info: VersionInfo) {
    return { COMMIT: info.commitHash || "" };
  },

  getSourceFilename(info: VersionInfo) {
    return `btsms-${info.commitHash}.tar.gz`;
  },
} satisfies PackageConfig;
