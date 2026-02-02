# Local Packages - AI Assistant Context

## Project Overview
This system automatically fetches, builds, and maintains local Arch packages from upstream sources, integrated with pamac. It bypasses AUR maintainers by pulling directly from official vendor sources for faster updates and reduced supply chain risk.

## Tech Stack
- **Runtime:** Bun (TypeScript with built-in shell support via `$` template literal)
- **Package Manager:** makepkg + local pacman repository
- **Integration:** pamac for system updates

## Directory Structure
```
local-packages/
├── src/                    # Core TypeScript code
│   ├── cli.ts              # Main entry point
│   ├── build-package.ts    # Generic package builder
│   └── lib/
│       ├── common.ts       # Shared utilities (logging, download, sha256)
│       └── types.ts        # TypeScript interfaces
├── packages/               # Per-package configurations
│   └── cursor-bin/
│       ├── config.ts       # Version detection + template vars
│       ├── PKGBUILD.template
│       └── files/          # Additional files (wrappers, patches)
├── repo/                   # Local pacman repository
├── cache/                  # Downloads and build area (gitignored)
├── state/                  # Version tracking (gitignored)
└── logs/                   # Build logs (gitignored)
```

## Key Commands
```bash
bun run update              # Build all packages + pamac update
bun run build cursor-bin    # Build specific package
bun run check               # Check for available updates
```

## Adding a New Package

1. Create `packages/<name>/` directory
2. Create `config.ts` implementing `PackageConfig`:
   ```typescript
   export default {
     name: "package-name",
     description: "Package description",
     async detectVersion(): Promise<VersionInfo> {
       // Return { version, downloadUrl, commitHash? }
     },
     getTemplateVars(info) {
       // Optional: return additional template variables
     }
   } satisfies PackageConfig;
   ```
3. Create `PKGBUILD.template` with markers: `%%VERSION%%`, `%%SHA256%%`, custom vars
4. Add any extra files to `files/` subdirectory

## Package Config Interface
```typescript
interface VersionInfo {
  version: string;
  downloadUrl: string;
  commitHash?: string;
}

interface PackageConfig {
  name: string;
  description: string;
  detectVersion: () => Promise<VersionInfo>;
  getTemplateVars?: (info: VersionInfo) => Record<string, string>;
}
```

## Design Decisions
- **Base on AUR PKGBUILDs:** AUR maintainers solve packaging edge cases - use their work as reference
- **Fetch from upstream:** Download directly from vendor's official distribution
- **Verify integrity:** Compute SHA256 from downloaded files
- **Minimal changes:** Only modify source URLs and version detection from AUR versions

## Common Tasks
- **Version detection fails:** Check if the upstream API/URL format changed
- **Build fails:** Compare PKGBUILD.template with current AUR version for updates
- **New dependency:** Update the `depends` array in PKGBUILD.template
