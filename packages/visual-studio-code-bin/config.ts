import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "visual-studio-code-bin",
  description: "Visual Studio Code (official binary version)",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://api.github.com/repos/microsoft/vscode/releases/latest"
    );
    const data = (await response.json()) as { tag_name: string };

    const version = data.tag_name;
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
