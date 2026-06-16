import { chmod, lstat, mkdir, rm, symlink, readdir, rename, copyFile } from "fs/promises";
import { join, basename } from "path";
import { log, sha256, downloadFile, loadState, saveState, getProjectRoot } from "./lib/common";
import type { PackageConfig, VersionInfo } from "./lib/types";

interface BuildPackageOptions {
  force?: boolean;
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function makeDirectoryTreeRemovable(directory: string): Promise<void> {
  let mode: number;
  try {
    const stats = await lstat(directory);
    if (!stats.isDirectory()) return;
    mode = stats.mode;
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) return;
    throw error;
  }

  await chmod(directory, (mode & 0o777) | 0o700);

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isErrorWithCode(error, "ENOENT")) return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        await makeDirectoryTreeRemovable(join(directory, entry.name));
      }
    })
  );
}

export async function resetBuildDirectory(buildDir: string): Promise<void> {
  await makeDirectoryTreeRemovable(buildDir);
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
}

async function runMakepkg(buildDir: string): Promise<void> {
  const proc = Bun.spawn(["makepkg", "-sf", "--noconfirm"], {
    cwd: buildDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`makepkg failed with exit code ${exitCode}`);
  }
}

export async function buildPackage(
  pkgName: string,
  prefetchedVersionInfo?: VersionInfo,
  options: BuildPackageOptions = {}
): Promise<boolean> {
  const root = getProjectRoot();
  const configPath = `${root}/packages/${pkgName}/config.ts`;

  const configModule = await import(configPath);
  const config: PackageConfig = configModule.default;

  const versionInfo = prefetchedVersionInfo ?? (await log(`Checking ${config.name}...`), await config.detectVersion());

  // Check current version
  const state = await loadState();
  if (!options.force && state[pkgName] === versionInfo.version) {
    await log(`${pkgName} is up to date (${versionInfo.version})`);
    return false;
  }

  await log(options.force ? `Rebuilding ${pkgName} ${versionInfo.version} (forced)` : `New version available: ${versionInfo.version}`);

  // Download
  const downloadDir = `${root}/cache/downloads`;
  const debFile = `${downloadDir}/${pkgName}_${versionInfo.version}.deb`;
  await log(`Downloading from ${versionInfo.downloadUrl}...`);
  await downloadFile(versionInfo.downloadUrl, debFile);

  // Compute checksum
  const checksum = await sha256(debFile);
  await log(`SHA256: ${checksum}`);

  // Generate PKGBUILD from template
  const templatePath = `${root}/packages/${pkgName}/PKGBUILD.template`;
  const template = await Bun.file(templatePath).text();

  const vars: Record<string, string> = {
    VERSION: versionInfo.version,
    SHA256: checksum,
    ...config.getTemplateVars?.(versionInfo),
  };

  const pkgbuild = template.replace(/%%(\w+)%%/g, (_, key) => vars[key] || `%%${key}%%`);

  // Prepare build directory
  const buildDir = `${root}/cache/build/${pkgName}`;
  await resetBuildDirectory(buildDir);

  // Write PKGBUILD
  await Bun.write(`${buildDir}/PKGBUILD`, pkgbuild);

  // Copy additional files if they exist
  const filesDir = `${root}/packages/${pkgName}/files`;
  try {
    const files = await readdir(filesDir);
    for (const file of files) {
      await copyFile(join(filesDir, file), join(buildDir, file));
    }
  } catch {
    // files/ directory doesn't exist, that's fine
  }

  // Link the downloaded file to build directory with the expected name
  const sourceFilename = config.getSourceFilename?.(versionInfo) ?? `${pkgName}_${versionInfo.version}.deb`;
  try {
    await rm(join(buildDir, sourceFilename), { force: true });
  } catch {
    // File doesn't exist, that's fine
  }
  await symlink(debFile, join(buildDir, sourceFilename));

  // Build the package
  await log(`Building ${pkgName}...`);
  await runMakepkg(buildDir);

  // Move built package to repo
  const repoDir = `${root}/repo`;
  await mkdir(repoDir, { recursive: true });

  // Remove old versions of this package from repo
  try {
    const repoFiles = await readdir(repoDir);
    for (const file of repoFiles) {
      if (file.startsWith(`${pkgName}-`) && file.endsWith(".pkg.tar.zst")) {
        await rm(join(repoDir, file));
      }
    }
  } catch {
    // No files to remove
  }

  // Move new package
  const buildFiles = await readdir(buildDir);
  for (const file of buildFiles) {
    if (file.endsWith(".pkg.tar.zst")) {
      await rename(join(buildDir, file), join(repoDir, file));
    }
  }

  // Update state
  state[pkgName] = versionInfo.version;
  await saveState(state);

  await log(`Successfully built ${pkgName} ${versionInfo.version}`);
  return true;
}

export async function checkPackage(pkgName: string): Promise<{ name: string; currentVersion: string | null; latestVersion: string; needsUpdate: boolean; versionInfo: VersionInfo }> {
  const root = getProjectRoot();
  const configPath = `${root}/packages/${pkgName}/config.ts`;

  const configModule = await import(configPath);
  const config: PackageConfig = configModule.default;

  const versionInfo = await config.detectVersion();
  const state = await loadState();
  const currentVersion = state[pkgName] || null;
  const needsUpdate = currentVersion !== versionInfo.version;

  return {
    name: pkgName,
    currentVersion,
    latestVersion: versionInfo.version,
    needsUpdate,
    versionInfo,
  };
}
