import { readdir, rm, copyFile, mkdir } from "fs/promises";
import { join } from "path";
import { buildPackage, checkPackage } from "./build-package";
import { log, getProjectRoot, loadIgnoredPackages } from "./lib/common";

const [command, ...args] = Bun.argv.slice(2);

async function getPackageNames(): Promise<string[]> {
  const root = getProjectRoot();
  const packagesDir = `${root}/packages`;
  const entries = await readdir(packagesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

function splitIgnoredPackages(packages: string[], ignoredPackages: Set<string>) {
  return {
    activePackages: packages.filter((pkg) => !ignoredPackages.has(pkg)),
    skippedPackages: packages.filter((pkg) => ignoredPackages.has(pkg)),
  };
}

async function logSkippedPackages(packages: string[]): Promise<void> {
  if (packages.length > 0) {
    await log(`Ignoring packages: ${packages.join(", ")}`);
  }
}

function packageNameFromPackageFile(file: string): string | null {
  const suffix = ".pkg.tar.zst";
  if (!file.endsWith(suffix)) return null;

  const parts = file.slice(0, -suffix.length).split("-");
  if (parts.length < 4) return null;

  return parts.slice(0, -3).join("-");
}

async function runCommand(command: string[]): Promise<void> {
  const proc = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`${command[0]} failed with exit code ${exitCode}`);
  }
}

async function updateRepo(ignoredPackages: Set<string> = new Set()): Promise<void> {
  const root = getProjectRoot();
  const repoDir = `${root}/repo`;
  const dbFile = `${repoDir}/local-packages.db.tar.zst`;
  await mkdir(repoDir, { recursive: true });
  const repoFiles = await readdir(repoDir);

  // Remove old database files to rebuild fresh
  for (const file of repoFiles) {
    if (file.startsWith("local-packages.db") || file.startsWith("local-packages.files")) {
      await rm(join(repoDir, file), { force: true });
    }
  }

  const pkgFiles = repoFiles
    .filter((file) => file.endsWith(".pkg.tar.zst"))
    .filter((file) => {
      const packageName = packageNameFromPackageFile(file);
      return packageName === null || !ignoredPackages.has(packageName);
    })
    .map((file) => join(repoDir, file));

  const skippedRepoPackages = repoFiles
    .filter((file) => file.endsWith(".pkg.tar.zst"))
    .map((file) => packageNameFromPackageFile(file))
    .filter((packageName): packageName is string => packageName !== null && ignoredPackages.has(packageName));

  if (skippedRepoPackages.length > 0) {
    await log(`Excluding ignored packages from repo database: ${[...new Set(skippedRepoPackages)].join(", ")}`);
  }

  await runCommand(["repo-add", dbFile, ...pkgFiles]);

  // Replace symlinks with copies (pamac doesn't follow symlinks in file:// URLs)
  const dbLink = join(repoDir, "local-packages.db");
  const filesLink = join(repoDir, "local-packages.files");
  await rm(dbLink, { force: true });
  await rm(filesLink, { force: true });
  await copyFile(dbFile, dbLink);
  await copyFile(`${repoDir}/local-packages.files.tar.zst`, filesLink);
}


async function runPamac(args: string[]): Promise<void> {
  const proc = Bun.spawn(["pamac", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

async function main() {
  switch (command) {
    case "update": {
      await log("Starting package update...");

      const [packages, ignoredPackages] = await Promise.all([
        getPackageNames(),
        loadIgnoredPackages(),
      ]);
      const { activePackages, skippedPackages } = splitIgnoredPackages(packages, ignoredPackages);
      await logSkippedPackages(skippedPackages);

      // Check versions in parallel
      await log("Checking versions...");
      const checks = await Promise.all(
        activePackages.map(async (pkg) => {
          try {
            return { ok: true as const, pkg, status: await checkPackage(pkg) };
          } catch (error) {
            return { ok: false as const, pkg, error };
          }
        })
      );

      const toBuild: { pkg: string; versionInfo: import("./lib/types").VersionInfo }[] = [];
      for (const result of checks) {
        if (!result.ok) {
          await log(`Error checking ${result.pkg}: ${result.error}`);
          continue;
        }
        const { pkg, status } = result;
        if (status.needsUpdate) toBuild.push({ pkg, versionInfo: status.versionInfo });
        await log(`${pkg}: ${status.currentVersion || "not built"} → ${status.latestVersion}${status.needsUpdate ? " (update available)" : " (up to date)"}`);
      }

      // Build packages that need updating (sequentially - makepkg can't parallelize)
      let anyUpdated = false;
      for (const { pkg, versionInfo } of toBuild) {
        try {
          const updated = await buildPackage(pkg, versionInfo);
          if (updated) {
            anyUpdated = true;
          }
        } catch (error) {
          await log(`Error building ${pkg}: ${error}`);
        }
      }

      // Update repo database
      await log(anyUpdated ? "Updating repository database..." : "Refreshing repository database...");
      await updateRepo(ignoredPackages);

      // Run system update via pamac
      await log("Running system update via pamac...");
      await runPamac(["update", ...args]);
      break;
    }

    case "build": {
      const force = args.includes("--force");
      const pkg = args.find((arg) => !arg.startsWith("-"));

      if (!pkg) {
        console.error("Usage: bun run build <package-name> [--force]");
        process.exit(1);
      }

      const ignoredPackages = await loadIgnoredPackages();
      if (ignoredPackages.has(pkg)) {
        await log(`Ignoring package: ${pkg}`);
        await log("Refreshing repository database...");
        await updateRepo(ignoredPackages);
        break;
      }

      await buildPackage(pkg, undefined, { force });
      await log("Updating repository database...");
      await updateRepo(ignoredPackages);
      break;
    }

    case "check": {
      const requestedPackages = args.length > 0 ? args : await getPackageNames();
      const ignoredPackages = await loadIgnoredPackages();
      const { activePackages: packages, skippedPackages } = splitIgnoredPackages(requestedPackages, ignoredPackages);
      const total = packages.length;
      let completed = 0;

      if (skippedPackages.length > 0) {
        console.log(`\nIgnoring packages: ${skippedPackages.join(", ")}`);
      }
      console.log(`\nChecking ${total} packages...`);

      const results = await Promise.all(
        packages.map(async (pkg) => {
          try {
            const status = await checkPackage(pkg);
            completed++;
            const marker = status.needsUpdate ? "⚠" : "✓";
            const current = status.currentVersion || "not built";
            console.log(`  [${completed}/${total}] ${marker} ${status.name}: ${current} → ${status.latestVersion}`);
            return { ok: true as const, pkg };
          } catch (error) {
            return { ok: false as const, pkg, error };
          }
        })
      );

      for (const result of results) {
        if (!result.ok) {
          console.log(`  ✗ ${result.pkg}: Error - ${result.error}`);
        }
      }
      console.log("");
      break;
    }

    default:
      console.log(`
Local Packages - Automated package builder for Manjaro

Usage:
  bun run update [args]        - Build all packages and run pamac update
  bun run build <package> [--force] - Build a specific package
  bun run check [packages...]  - Check for available updates

Examples:
  bun run update               - Update all packages and system (via pamac)
  bun run update --no-confirm  - Update without confirmation
  bun run build cursor-bin     - Build only cursor-bin
  bun run build cursor-bin --force - Rebuild current version
  bun run check                - Check all packages for updates
`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
