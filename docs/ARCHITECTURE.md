# Architecture

## Overview

This system maintains a local pacman repository with packages built directly from upstream sources, integrated with pamac for seamless system updates.

## Why Local Repository Instead of AUR Helpers?

### Faster Updates
AUR packages often lag behind upstream releases because:
- AUR maintainers may be busy or unavailable
- Updates require manual version bumps
- Some packages have complex update procedures

By fetching directly from upstream APIs and distribution channels, we get updates as soon as vendors release them.

### Reduced Supply Chain Risk
The AUR maintainer is a trust point that can be compromised:
- Account takeover
- Malicious updates
- Abandoned packages taken over by bad actors

Our approach trusts only:
1. The software vendor (Cursor, etc.)
2. Our own code in this repository

### Control
- Pin versions when needed
- Test updates before system-wide installation
- Audit exactly what's being installed

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI (cli.ts)                         │
│  Commands: update, build, check                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Build Package (build-package.ts)            │
│  1. Load package config                                     │
│  2. Check for new version                                   │
│  3. Download from upstream                                  │
│  4. Generate PKGBUILD from template                         │
│  5. Run makepkg                                             │
│  6. Move package to repo                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Package      │  │ Package      │  │ Package      │
│ Config       │  │ Config       │  │ Config       │
│ (config.ts)  │  │ (config.ts)  │  │ (config.ts)  │
│              │  │              │  │              │
│ - cursor-bin │  │ - future-pkg │  │ - ...        │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Package Configuration Design

Each package has its own directory under `packages/` with:

### config.ts
TypeScript module exporting `PackageConfig`:
- `name`: Package name
- `description`: Human-readable description
- `detectVersion()`: Async function returning version info from upstream
- `getTemplateVars()`: Optional function for additional template variables

This design allows:
- Type-safe configuration
- Complex version detection logic (API calls, redirect following, HTML parsing)
- Package-specific customization

### PKGBUILD.template
Based on the AUR PKGBUILD with template markers:
- `%%VERSION%%` - Package version
- `%%SHA256%%` - Checksum of downloaded file
- Custom markers via `getTemplateVars()`

Why base on AUR PKGBUILDs?
- AUR maintainers have solved packaging edge cases
- Dependencies and build steps are already figured out
- Reduces maintenance burden

### files/
Additional files needed for the package:
- Wrapper scripts (e.g., rg.sh for Cursor)
- Patches
- Desktop files
- Icons

## Version Detection Strategies

Different packages require different approaches:

### API Redirect Following (Cursor)
```typescript
const response = await fetch("https://api2.cursor.sh/updates/...", { redirect: "follow" });
const url = response.url; // Contains version in URL path
```

### GitHub Releases API
```typescript
const releases = await fetch("https://api.github.com/repos/owner/repo/releases/latest");
const { tag_name } = await releases.json();
```

### Changelog/Version File Scraping
```typescript
const page = await fetch("https://example.com/downloads");
const html = await page.text();
const match = html.match(/version-(\d+\.\d+\.\d+)/);
```

## State Management

`state/versions.json` tracks built versions:
```json
{
  "cursor-bin": "2.4.21",
  "other-pkg": "1.0.0"
}
```

This prevents unnecessary rebuilds when version hasn't changed.

## Build Process

1. **Version Check**: Compare upstream version with state
2. **Download**: Fetch from upstream URL to `cache/downloads/`
3. **Checksum**: Compute SHA256 of downloaded file
4. **Template Processing**: Replace markers in PKGBUILD.template
5. **Build Directory Setup**:
   - Create `cache/build/<name>/`
   - Write generated PKGBUILD
   - Copy files from `files/`
   - Symlink downloaded source
6. **makepkg**: Run `makepkg -sf --noconfirm`
7. **Repository Update**:
   - Move `.pkg.tar.zst` to `repo/`
   - Run `repo-add` to update database
8. **State Update**: Save new version to state file

## Integration with pamac

The local repository is configured in `/etc/pacman.conf`:
```ini
[local-packages]
SigLevel = Optional TrustAll
Server = file:///home/user/code/local-packages/repo
```

`SigLevel = Optional TrustAll` is used because:
- We build packages locally from trusted sources
- Package signing would add complexity without security benefit
- The entire build process is auditable in this repository

## Directory Rationale

| Directory | Purpose | Git Status |
|-----------|---------|------------|
| `src/` | Core build system | Tracked |
| `packages/` | Package configurations | Tracked |
| `docs/` | Documentation | Tracked |
| `repo/` | Built packages + database | DB tracked, packages ignored |
| `cache/` | Downloads + build temp | Ignored |
| `state/` | Version tracking | Ignored |
| `logs/` | Build logs | Ignored |

Tracked files are the "source" of the system. Everything else is derived or temporary.
