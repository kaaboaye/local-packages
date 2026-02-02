import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "tableplus",
  description: "Modern, native GUI tool for relational databases",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://deb.tableplus.com/debian/24/dists/tableplus/main/binary-amd64/Packages"
    );
    const text = await response.text();

    // Parse: Package: tableplus\nVersion: 0.1.284
    const match = text.match(/Package: tableplus\nVersion: ([\d.]+)/);
    if (!match) {
      throw new Error("Could not detect TablePlus version");
    }

    const version = match[1];
    const downloadUrl = `https://deb.tableplus.com/debian/24/pool/main/t/tableplus/tableplus_${version}_amd64.deb`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `tableplus_${info.version}_amd64.deb`;
  },
} satisfies PackageConfig;
