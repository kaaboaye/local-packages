import { $ } from "bun";
import { mkdir, rm, symlink, readdir, rename, copyFile } from "fs/promises";
import { join, basename } from "path";
import { log, sha256, downloadFile, loadState, saveState, getProjectRoot } from "./lib/common";
import type { PackageConfig } from "./lib/types";

export async function buildPackage(pkgName: string): Promise<boolean> {
  const root = getProjectRoot();
  const configPath = `${root}/packages/${pkgName}/config.ts`;

  const configModule = await import(configPath);
  const config: PackageConfig = configModule.default;

  await log(`Checking ${config.name}...`);
  const versionInfo = await config.detectVersion();

  // Check current version
  const state = await loadState();
  if (state[pkgName] === versionInfo.version) {
    await log(`${pkgName} is up to date (${versionInfo.version})`);
    return false;
  }

  await log(`New version available: ${versionInfo.version}`);

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
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });

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

  // Build the package (requires shell for makepkg)
  await log(`Building ${pkgName}...`);
  await $`cd ${buildDir} && makepkg -sf --noconfirm`.quiet();

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

export async function checkPackage(pkgName: string): Promise<{ name: string; currentVersion: string | null; latestVersion: string; needsUpdate: boolean }> {
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
  };
}
