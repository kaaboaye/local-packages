import type { PackageConfig, VersionInfo } from "../../src/lib/types";
import { z } from "zod";

const CursorDownloadSchema = z.object({
  version: z.string(),
  commitSha: z.string(),
});

export default {
  name: "cursor-bin",
  description: "AI-first code editor",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=latest"
    );
    const data = CursorDownloadSchema.parse(await response.json());

    const downloadUrl = `https://downloads.cursor.com/production/${data.commitSha}/linux/x64/deb/amd64/deb/cursor_${data.version}_amd64.deb`;

    return {
      version: data.version,
      commitHash: data.commitSha,
      downloadUrl,
    };
  },

  getTemplateVars(info: VersionInfo) {
    return {
      COMMIT_HASH: info.commitHash!,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `cursor_${info.version}_amd64.deb`;
  },
} satisfies PackageConfig;
