import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "google-chrome",
  description: "The popular web browser by Google (Stable Channel)",

  async detectVersion(): Promise<VersionInfo> {
    const response = await fetch(
      "https://dl.google.com/linux/chrome/deb/dists/stable/main/binary-amd64/Packages"
    );
    const text = await response.text();

    // Parse: Package: google-chrome-stable\nVersion: 144.0.7559.109-1
    const match = text.match(
      /Package: google-chrome-stable\nVersion: ([\d.]+)-\d+/
    );
    if (!match) {
      throw new Error("Could not detect Chrome version");
    }

    const version = match[1];
    const downloadUrl = `https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${version}-1_amd64.deb`;

    return {
      version,
      downloadUrl,
    };
  },

  getSourceFilename(info: VersionInfo) {
    return `google-chrome-stable_${info.version}-1_amd64.deb`;
  },
} satisfies PackageConfig;
