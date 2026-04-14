import { $ } from "bun";
import { readdir, rm, copyFile } from "fs/promises";
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

async function updateRepo(): Promise<void> {
  const root = getProjectRoot();
  const repoDir = `${root}/repo`;
  const dbFile = `${repoDir}/local-packages.db.tar.zst`;

  // Remove old database files to rebuild fresh
  await $`rm -f ${repoDir}/local-packages.db* ${repoDir}/local-packages.files*`.quiet();

  // Add all packages to the repo database
  const pkgFiles = await $`ls ${repoDir}/*.pkg.tar.zst 2>/dev/null || true`.text();
  if (pkgFiles.trim()) {
    await $`repo-add ${dbFile} ${repoDir}/*.pkg.tar.zst`;
  } else {
    // Create empty database
    await $`repo-add ${dbFile}`;
  }

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
      const activePackages = packages.filter((pkg) => !ignoredPackages.has(pkg));

      if (ignoredPackages.size > 0) {
        const ignored = packages.filter((pkg) => ignoredPackages.has(pkg));
        if (ignored.length > 0) {
          await log(`Ignoring packages: ${ignored.join(", ")}`);
        }
      }

      // Check versions in parallel
      await log("Checking versions...");
      const checks = await Promise.allSettled(
        activePackages.map(async (pkg) => ({ pkg, status: await checkPackage(pkg) }))
      );

      const toBuild: { pkg: string; versionInfo: import("./lib/types").VersionInfo }[] = [];
      for (let i = 0; i < checks.length; i++) {
        const result = checks[i];
        if (result.status === "rejected") {
          await log(`Error checking ${activePackages[i]}: ${result.reason}`);
          continue;
        }
        const { pkg, status } = result.value;
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
      if (anyUpdated) {
        await log("Updating repository database...");
        await updateRepo();
      }

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
      await buildPackage(pkg, undefined, { force });
      await log("Updating repository database...");
      await updateRepo();
      break;
    }

    case "check": {
      const requestedPackages = args.length > 0 ? args : await getPackageNames();
      const ignoredPackages = args.length > 0 ? new Set<string>() : await loadIgnoredPackages();
      const packages = requestedPackages.filter((pkg) => !ignoredPackages.has(pkg));
      const total = packages.length;
      let completed = 0;

      console.log(`\nChecking ${total} packages...`);

      const results = await Promise.allSettled(
        packages.map(async (pkg) => {
          const status = await checkPackage(pkg);
          completed++;
          const marker = status.needsUpdate ? "⚠" : "✓";
          const current = status.currentVersion || "not built";
          console.log(`  [${completed}/${total}] ${marker} ${status.name}: ${current} → ${status.latestVersion}`);
          return status;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          console.log(`  ✗ ${packages[i]}: Error - ${result.reason}`);
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
