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

async function hasCommand(command: string): Promise<boolean> {
  try {
    await $`command -v ${command}`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function runSudo(command: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["sudo", command, ...args], {
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

      // Build all packages
      const packages = await getPackageNames();
      let anyUpdated = false;
      const updatedPackages: string[] = [];
      const missingPackages: string[] = [];

      for (const pkg of packages) {
        try {
          const updated = await buildPackage(pkg);
          if (updated) {
            anyUpdated = true;
            updatedPackages.push(pkg);
          }
          if (!(await isPackageInstalled(pkg))) {
            missingPackages.push(pkg);
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

      const usePamac = await hasCommand("pamac");

      const packagesToInstall = Array.from(new Set([...updatedPackages, ...missingPackages]));

      if (usePamac) {
        // Run system update (inherit terminal for proper formatting)
        await log("Running system update via pamac...");
        await runSudo("pamac", ["update", ...args]);

        if (packagesToInstall.length > 0) {
          const installArgs = ["install", ...packagesToInstall];
          if (args.includes("--no-confirm")) {
            installArgs.push("--no-confirm");
          }
          await log("Installing updated local packages...");
          await runSudo("pamac", installArgs);
        }
      } else {
        const pacmanArgs = args.map((arg) => (arg === "--no-confirm" ? "--noconfirm" : arg));
        await log("Running system update via pacman...");
        const updateArgs = ["-Syu", ...pacmanArgs, "--needed", ...packagesToInstall];
        await runSudo("pacman", updateArgs);
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

      console.log("\nPackage Status:");
      console.log("─".repeat(60));

      for (const pkg of packages) {
        try {
          const status = await checkPackage(pkg);
          const marker = status.needsUpdate ? "⚠" : "✓";
          const current = status.currentVersion || "not built";
          console.log(`${marker} ${status.name}: ${current} → ${status.latestVersion}`);
        } catch (error) {
          console.log(`✗ ${pkg}: Error - ${error}`);
        }
      }
      console.log("");
      break;
    }

    default:
      console.log(`
Local Packages - Automated package builder for Manjaro

Usage:
  bun run update [pamac args]  - Build all packages and run pamac update
  bun run build <package>      - Build a specific package
  bun run check [packages...]  - Check for available updates

Examples:
  bun run update               - Update all packages and system
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
