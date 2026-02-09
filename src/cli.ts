import { $ } from "bun";
import { readdir, rm, copyFile } from "fs/promises";
import { join } from "path";
import { buildPackage, checkPackage } from "./build-package";
import { log, getProjectRoot } from "./lib/common";

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

async function isPackageInstalled(pkgName: string): Promise<boolean> {
  try {
    await $`pacman -Q ${pkgName}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  switch (command) {
    case "update": {
      await log("Starting package update...");

      const packages = await getPackageNames();

      // Check versions and install status in parallel
      await log("Checking versions...");
      const checks = await Promise.allSettled(
        packages.map(async (pkg) => {
          const [status, installed] = await Promise.all([
            checkPackage(pkg),
            isPackageInstalled(pkg),
          ]);
          return { pkg, status, installed };
        })
      );

      const toBuild: { pkg: string; versionInfo: import("./lib/types").VersionInfo }[] = [];
      const missingPackages: string[] = [];
      for (let i = 0; i < checks.length; i++) {
        const result = checks[i];
        if (result.status === "rejected") {
          await log(`Error checking ${packages[i]}: ${result.reason}`);
          continue;
        }
        const { pkg, status, installed } = result.value;
        if (status.needsUpdate) toBuild.push({ pkg, versionInfo: status.versionInfo });
        if (!installed) missingPackages.push(pkg);
        await log(`${pkg}: ${status.currentVersion || "not built"} → ${status.latestVersion}${status.needsUpdate ? " (update available)" : " (up to date)"}`);
      }

      // Build packages that need updating (sequentially - makepkg can't parallelize)
      let anyUpdated = false;
      const updatedPackages: string[] = [];
      for (const { pkg, versionInfo } of toBuild) {
        try {
          const updated = await buildPackage(pkg, versionInfo);
          if (updated) {
            anyUpdated = true;
            updatedPackages.push(pkg);
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

      const packagesToInstall = Array.from(new Set([...updatedPackages, ...missingPackages]));

      // Run system update via pamac
      await log("Running system update via pamac...");
      await runPamac(["update", ...args]);

      if (packagesToInstall.length > 0) {
        const installArgs = ["install", ...packagesToInstall];
        if (args.includes("--no-confirm")) {
          installArgs.push("--no-confirm");
        }
        await log("Installing updated local packages...");
        await runPamac(installArgs);
      }
      break;
    }

    case "build": {
      if (!args[0]) {
        console.error("Usage: bun run build <package-name>");
        process.exit(1);
      }
      const pkg = args[0];
      await buildPackage(pkg);
      await log("Updating repository database...");
      await updateRepo();
      break;
    }

    case "check": {
      const packages = args.length > 0 ? args : await getPackageNames();
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
  bun run build <package>      - Build a specific package
  bun run check [packages...]  - Check for available updates

Examples:
  bun run update               - Update all packages and system (via pamac)
  bun run update --no-confirm  - Update without confirmation
  bun run build cursor-bin     - Build only cursor-bin
  bun run check                - Check all packages for updates
`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
