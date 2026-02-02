export interface VersionInfo {
  version: string;
  downloadUrl: string;
  commitHash?: string;
}

export interface PackageConfig {
  name: string;
  description: string;
  detectVersion: () => Promise<VersionInfo>;
  getTemplateVars?: (info: VersionInfo) => Record<string, string>;
  getSourceFilename?: (info: VersionInfo) => string;
}

export interface VersionState {
  [packageName: string]: string;
}
