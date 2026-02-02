# Adding New Packages

This guide walks through adding a new package to the local-packages system.

## Prerequisites

Before adding a package, ensure:
1. The package has an official upstream distribution (vendor website, GitHub releases, etc.)
2. You can programmatically detect the latest version
3. You have the AUR PKGBUILD as reference (recommended)

## Step-by-Step Guide

### 1. Create Package Directory

```bash
mkdir -p packages/<name>/files
```

### 2. Fetch AUR PKGBUILD (Recommended)

Start with the existing AUR package as reference:

```bash
curl -o /tmp/PKGBUILD "https://aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=<aur-package-name>"
```

Also fetch any additional source files listed in the PKGBUILD.

### 3. Create config.ts

Create `packages/<name>/config.ts`:

```typescript
import type { PackageConfig, VersionInfo } from "../../src/lib/types";

export default {
  name: "<name>",
  description: "Package description",

  async detectVersion(): Promise<VersionInfo> {
    // Implement version detection - see examples below
  },

  // Optional: additional template variables
  getTemplateVars(info: VersionInfo) {
    return {
      CUSTOM_VAR: "value",
    };
  },
} satisfies PackageConfig;
```

### 4. Create PKGBUILD.template

Adapt the AUR PKGBUILD:

1. Replace hardcoded version with `%%VERSION%%`
2. Replace hardcoded checksums with `%%SHA256%%`
3. Add any custom markers as `%%CUSTOM_VAR%%`
4. Remove network-dependent checksums (use `SKIP` or compute locally)

Example transformation:
```diff
- pkgver=1.2.3
+ pkgver=%%VERSION%%

- sha256sums=('abc123...')
+ sha256sums=('%%SHA256%%')
```

### 5. Copy Additional Files

Copy any extra files from the AUR package to `packages/<name>/files/`:
- Wrapper scripts
- Patches
- Desktop files
- Icons

### 6. Test the Build

```bash
bun run build <name>
```

Check:
- Package builds successfully
- Package appears in `repo/`
- `pacman -Si <name>` shows package info

### 7. Test Installation

```bash
pamac update --refresh
pamac install <name>
```

## Version Detection Examples

### API Redirect Following

For services that redirect to versioned download URLs:

```typescript
async detectVersion(): Promise<VersionInfo> {
  const response = await fetch(
    "https://example.com/download/latest",
    { redirect: "follow" }
  );
  const url = response.url;

  const match = url.match(/version-(\d+\.\d+\.\d+)/);
  if (!match) throw new Error(`Failed to parse version from ${url}`);

  return {
    version: match[1],
    downloadUrl: url,
  };
}
```

### GitHub Releases API

```typescript
async detectVersion(): Promise<VersionInfo> {
  const response = await fetch(
    "https://api.github.com/repos/owner/repo/releases/latest"
  );
  const release = await response.json();

  // Find the appropriate asset
  const asset = release.assets.find(
    (a: any) => a.name.endsWith(".deb") || a.name.endsWith(".tar.gz")
  );

  return {
    version: release.tag_name.replace(/^v/, ""),
    downloadUrl: asset.browser_download_url,
  };
}
```

### HTML Page Scraping

```typescript
async detectVersion(): Promise<VersionInfo> {
  const response = await fetch("https://example.com/downloads");
  const html = await response.text();

  const versionMatch = html.match(/Current version: (\d+\.\d+\.\d+)/);
  const linkMatch = html.match(/href="([^"]+\.deb)"/);

  if (!versionMatch || !linkMatch) {
    throw new Error("Failed to parse download page");
  }

  return {
    version: versionMatch[1],
    downloadUrl: linkMatch[1],
  };
}
```

### JSON API

```typescript
async detectVersion(): Promise<VersionInfo> {
  const response = await fetch("https://api.example.com/releases");
  const data = await response.json();

  return {
    version: data.latest.version,
    downloadUrl: data.latest.download_url,
  };
}
```

## Source Types

### Debian Packages (.deb)

Most common for pre-built binaries:

```bash
# PKGBUILD.template
source=("${pkgname}_${pkgver}.deb")
sha256sums=('%%SHA256%%')
noextract=(${pkgname}_${pkgver}.deb)

package() {
  bsdtar -xOf ${noextract[0]} data.tar.xz | tar -xJf - -C "$pkgdir"
}
```

### Tarballs (.tar.gz, .tar.xz)

```bash
source=("${pkgname}-${pkgver}.tar.gz")
sha256sums=('%%SHA256%%')

build() {
  cd "${pkgname}-${pkgver}"
  ./configure --prefix=/usr
  make
}

package() {
  cd "${pkgname}-${pkgver}"
  make DESTDIR="$pkgdir" install
}
```

### AppImages

```bash
source=("${pkgname}-${pkgver}.AppImage")
sha256sums=('%%SHA256%%')

package() {
  install -Dm755 "${srcdir}/${pkgname}-${pkgver}.AppImage" \
    "${pkgdir}/opt/${pkgname}/${pkgname}.AppImage"

  # Create launcher script
  install -Dm755 /dev/stdin "${pkgdir}/usr/bin/${pkgname}" <<EOF
#!/bin/sh
exec /opt/${pkgname}/${pkgname}.AppImage "\$@"
EOF
}
```

## Template Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `%%VERSION%%` | `VersionInfo.version` | Package version |
| `%%SHA256%%` | Computed | SHA256 of downloaded file |
| Custom | `getTemplateVars()` | Any additional variables |

## Troubleshooting

### Version detection fails

- Check if the upstream URL/API has changed
- Verify response format matches your parsing logic
- Add error logging to debug

### Build fails

- Compare your template with the current AUR PKGBUILD
- Check for new dependencies
- Verify file paths in the package() function

### Package installs but doesn't work

- Check if all dependencies are listed
- Verify symlinks and wrapper scripts
- Compare installed files with AUR version

### Checksum mismatch

- The downloaded file may have changed
- Re-run `bun run build <name>` to compute new checksum
- Check if upstream provides checksums to verify

## Best Practices

1. **Keep templates close to AUR**: Minimize changes to reduce maintenance
2. **Test thoroughly**: Build and install before committing
3. **Document custom logic**: Add comments explaining non-obvious code
4. **Handle errors gracefully**: Version detection should fail clearly
5. **Use SKIP for remote checksums**: Only verify the main source file
