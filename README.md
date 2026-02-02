# Local Packages

Automated package builder for Manjaro/Arch that fetches directly from upstream sources, bypassing AUR maintainers for faster updates and reduced supply chain risk.

## Why?

1. **Faster updates:** AUR packages often lag behind upstream releases
2. **Reduced supply chain risk:** AUR maintainers can be compromised; this system fetches directly from official sources
3. **Control:** You decide when to update and can pin versions if needed

## Setup

### Prerequisites
- Bun runtime
- makepkg (base-devel)
- pamac

### Installation

1. Clone/copy this repository to `~/code/local-packages`

2. Install dependencies:
   ```bash
   cd ~/code/local-packages
   bun install
   ```

3. Add the local repository to pacman. Add to `/etc/pacman.conf`:
   ```ini
   [local-packages]
   SigLevel = Optional TrustAll
   Server = file:///home/user/code/local-packages/repo
   ```

4. (Optional) Add shell alias to `~/.bashrc` or `~/.zshrc`:
   ```bash
   alias update='cd ~/code/local-packages && bun run update'
   ```

## Usage

### Update all packages and system
```bash
bun run update
# Or with the alias:
update
```

This command:
- Builds all local packages
- Refreshes the local repo database when needed
- Installs any updated or missing local packages
- Runs a full system update

### Build a specific package
```bash
bun run build cursor-bin
```

### Check for available updates
```bash
bun run check
```

### Pass arguments to pamac
```bash
bun run update --no-confirm
```

## Migrating from AUR

To switch a package from AUR to your local repository:

```bash
# Remove AUR version
pamac remove cursor-bin

# Refresh package databases
pamac update --refresh

# Install from local repo
pamac install cursor-bin
```

## Adding New Packages

See [docs/ADDING_PACKAGES.md](docs/ADDING_PACKAGES.md) for detailed instructions.

Quick overview:
1. Create `packages/<name>/` directory
2. Fetch AUR PKGBUILD as reference
3. Create `config.ts` with version detection logic
4. Create `PKGBUILD.template` with `%%VERSION%%`, `%%SHA256%%` markers
5. Add any extra files to `files/` subdirectory
6. Test with `bun run build <name>`

## Included Packages

| Package | Description | Upstream Source |
|---------|-------------|-----------------|
| cursor-bin | AI-first code editor | cursor.sh API |

## Troubleshooting

### Package not found after build
Run `bun run update` to install missing local packages.

If you built a package but it is still not in PATH, ensure it is installed:
- `pamac install <package>`
- or `sudo pacman -S <package>`

### Build fails with dependency errors
Install missing dependencies: `pamac install <dependency>`

### Version detection fails
The upstream API may have changed. Check the `config.ts` file and update the URL parsing logic.

## License

MIT
